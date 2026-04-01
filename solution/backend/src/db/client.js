const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = {
  query: (text, params) => pool.query(text, params),

  async ensureSchema() {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pipelines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        config JSONB NOT NULL,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pipeline_id UUID REFERENCES pipelines(id),
        status TEXT NOT NULL DEFAULT 'processing',
        lead_count INTEGER NOT NULL DEFAULT 0,
        processed_count INTEGER NOT NULL DEFAULT 0,
        config_hash TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        completed_at TIMESTAMPTZ
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
        lead_id TEXT NOT NULL,
        company_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        output JSONB,
        raw_input JSONB,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    await pool.query(`ALTER TABLE runs ADD COLUMN IF NOT EXISTS config_hash TEXT`);
    await pool.query(`ALTER TABLE lead_results ADD COLUMN IF NOT EXISTS raw_input JSONB`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_results_run_lead ON lead_results(run_id, lead_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_lead_results_run_id ON lead_results(run_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status)`);
  },

  async createRun(pipelineId, leadCount, configHash) {
    const res = await pool.query(
      `INSERT INTO runs (pipeline_id, lead_count, status, config_hash) VALUES ($1, $2, 'processing', $3) RETURNING *`,
      [pipelineId, leadCount, configHash]
    );
    return res.rows[0];
  },

  // Write a pending placeholder for every lead at run start.
  // This gives the UI something to show immediately and lets crash recovery
  // identify which leads were never processed (still pending after run fails).
  async insertPendingLeadResults(runId, leads) {
    for (const lead of leads) {
      await pool.query(
        `INSERT INTO lead_results (run_id, lead_id, company_name, status)
         VALUES ($1, $2, $3, 'pending')
         ON CONFLICT (run_id, lead_id) DO NOTHING`,
        [runId, lead.id || 'unknown', lead.company_name || 'Unknown']
      );
    }
  },

  // raw_input stores the full lead record including PII (email, contact_name, phone, notes).
  // It is kept in a dedicated column and is never included in the `output` JSONB that the
  // API returns to callers — output contains only the pipeline decision and score breakdown.
  // raw_input exists for manual review, audit, and reprocessing purposes.
  async upsertLeadResult(runId, result, rawLead = null) {
    await pool.query(
      `UPDATE lead_results
       SET status = $3, output = $4, raw_input = $5, updated_at = now()
       WHERE run_id = $1 AND lead_id = $2`,
      [runId, result.id, result.status, JSON.stringify(result), rawLead ? JSON.stringify(rawLead) : null]
    );
    // processed_count tracks leads attempted (completed + failed + skipped),
    // not just successful ones. The UI uses this as a progress indicator.
    await pool.query(
      `UPDATE runs SET processed_count = processed_count + 1 WHERE id = $1`,
      [runId]
    );
  },

  // Stores an operator override on a lead result. The original pipeline output is preserved;
  // operator_override sits alongside it and the UI displays which is active.
  async overrideLeadResult(resultId, override) {
    const payload = JSON.stringify({
      routing: override.routing,
      routing_priority: override.routing_priority || null,
      reason: override.reason,
      overridden_at: new Date().toISOString(),
    });
    const res = await pool.query(
      `UPDATE lead_results
       SET output = jsonb_set(output, '{operator_override}', $2::jsonb),
           updated_at = now()
       WHERE id = $1
       RETURNING id, output`,
      [resultId, payload]
    );
    return res.rows[0] || null;
  },

  async markRunCompleted(runId) {
    await pool.query(
      `UPDATE runs SET status = 'completed', completed_at = now() WHERE id = $1`,
      [runId]
    );
  },

  async markRunFailed(runId) {
    await pool.query(
      `UPDATE runs SET status = 'failed', completed_at = now() WHERE id = $1`,
      [runId]
    );
  },

  async getRun(runId) {
    const runRes = await pool.query(`SELECT * FROM runs WHERE id = $1`, [runId]);
    if (runRes.rows.length === 0) return null;
    const run = runRes.rows[0];
    const resultsRes = await pool.query(
      `SELECT id, lead_id, company_name, status, output FROM lead_results WHERE run_id = $1 ORDER BY created_at ASC`,
      [runId]
    );
    run.results = resultsRes.rows.map(r =>
      r.output
        ? { ...r.output, result_id: r.id }
        : { result_id: r.id, id: r.lead_id, company_name: r.company_name, status: 'pending' }
    );
    return run;
  },

  async getLeadResultRawInput(resultId) {
    const res = await pool.query(
      `SELECT id, run_id, lead_id, company_name, raw_input
       FROM lead_results
       WHERE id = $1
       LIMIT 1`,
      [resultId]
    );
    return res.rows[0] || null;
  },

  async listLatestLeadResults() {
    const res = await pool.query(
      `SELECT DISTINCT ON (lr.lead_id)
         lr.id,
         lr.run_id,
         lr.lead_id,
         lr.company_name,
         lr.status,
         lr.output,
         lr.updated_at,
         r.created_at AS run_created_at,
         r.config_hash
       FROM lead_results lr
       JOIN runs r ON r.id = lr.run_id
       WHERE lr.status <> 'pending'
       ORDER BY lr.lead_id, lr.updated_at DESC, lr.created_at DESC`
    );

    return res.rows.map(r => ({
      ...(r.output || {}),
      result_id: r.id,
      run_id: r.run_id,
      config_hash: r.config_hash,
      result_updated_at: r.updated_at,
      run_created_at: r.run_created_at,
      id: r.output?.id || r.lead_id,
      company_name: r.output?.company_name || r.company_name,
      status: r.output?.status || r.status,
    }));
  },

  async listRuns() {
    const res = await pool.query(
      `SELECT id, pipeline_id, status, lead_count, processed_count, created_at, completed_at
       FROM runs ORDER BY created_at DESC LIMIT 50`
    );
    return res.rows;
  },

  async getDefaultPipeline() {
    const res = await pool.query(
      `SELECT * FROM pipelines WHERE is_default = true LIMIT 1`
    );
    return res.rows[0] || null;
  },

  async updateDefaultPipeline(config) {
    const res = await pool.query(
      `UPDATE pipelines SET config = $1, updated_at = now() WHERE is_default = true RETURNING *`,
      [JSON.stringify(config)]
    );
    return res.rows[0];
  },

  async ensureDefaultConfig(defaultConfig) {
    const existing = await pool.query(
      `SELECT id FROM pipelines WHERE is_default = true LIMIT 1`
    );
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO pipelines (name, config, is_default) VALUES ($1, $2, true)`,
        ['Default', JSON.stringify(defaultConfig)]
      );
      console.log('[db] Default pipeline config seeded.');
    } else {
      // Update existing empty config
      const current = await pool.query(`SELECT config FROM pipelines WHERE is_default = true LIMIT 1`);
      const cfg = current.rows[0].config;
      if (!cfg || !cfg.heuristics || !cfg.compliance) {
        await pool.query(
          `UPDATE pipelines SET config = $1, updated_at = now() WHERE is_default = true`,
          [JSON.stringify(defaultConfig)]
        );
        console.log('[db] Default pipeline config updated (new compliance/sic fields added).');
      }
    }
  }
};

module.exports = db;
