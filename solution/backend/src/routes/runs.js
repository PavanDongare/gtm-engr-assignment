const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/client');
const { processRun } = require('../pipeline');
const fs = require('fs');
const path = require('path');

function loadDefaultLeads() {
  const p = path.join(__dirname, '../../data/leads_small.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// POST /runs — start a new run
router.post('/', async (req, res) => {
  try {
    const { leads: inputLeads, pipeline_id } = req.body || {};
    const leads = inputLeads && inputLeads.length > 0 ? inputLeads : loadDefaultLeads();

    // Get pipeline config
    const pipeline = await db.getDefaultPipeline();
    if (!pipeline) return res.status(500).json({ error: 'No default pipeline configured' });

    const config = pipeline.config;
    const configHash = crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 16);

    // Create run
    const run = await db.createRun(pipeline.id, leads.length, configHash);

    // Process in background
    processRun(run, leads, config).catch(err => {
      console.error('[runs] Background processing error:', err);
      db.markRunFailed(run.id);
    });

    res.status(202).json({
      run_id: run.id,
      status: run.status,
      pipeline_id: run.pipeline_id,
      lead_count: run.lead_count,
      created_at: run.created_at,
    });
  } catch (err) {
    console.error('[runs] POST /runs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /runs — list all runs
router.get('/', async (req, res) => {
  try {
    const runs = await db.listRuns();
    res.json({ runs: runs.map(r => ({ ...r, run_id: r.id })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /runs/:id — get run status + results
router.get('/:id', async (req, res) => {
  try {
    const run = await db.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json({ ...run, run_id: run.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /runs/:runId/results/:resultId — operator override
// Stores a human routing decision alongside the pipeline output without overwriting it.
// Required fields: routing (string), reason (string).
// Optional: routing_priority (string).
router.patch('/:runId/results/:resultId', async (req, res) => {
  try {
    const { routing, routing_priority, reason } = req.body || {};
    if (!routing || !reason) {
      return res.status(400).json({ error: 'routing and reason are required' });
    }
    const updated = await db.overrideLeadResult(req.params.resultId, { routing, routing_priority, reason });
    if (!updated) return res.status(404).json({ error: 'Lead result not found' });
    res.json({
      result_id: updated.id,
      operator_override: updated.output.operator_override,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
