const express = require('express');
const crypto = require('crypto');
const db = require('../db/client');
const { processRun } = require('../pipeline');

const router = express.Router();

router.get('/latest', async (_req, res) => {
  try {
    const results = await db.listLatestLeadResults();
    res.json({ results });
  } catch (err) {
    console.error('[lead-results] GET latest error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/rerun', async (req, res) => {
  try {
    const stored = await db.getLeadResultRawInput(req.params.id);
    if (!stored) return res.status(404).json({ error: 'Lead result not found' });
    if (!stored.raw_input) return res.status(400).json({ error: 'No stored raw_input available for rerun' });

    const pipeline = await db.getDefaultPipeline();
    if (!pipeline) return res.status(500).json({ error: 'No default pipeline configured' });

    const config = pipeline.config;
    const configHash = crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 16);
    const run = await db.createRun(pipeline.id, 1, configHash);

    processRun(run, [stored.raw_input], config, { skipCache: true }).catch(err => {
      console.error('[lead-results] Background rerun error:', err);
      db.markRunFailed(run.id);
    });

    res.status(202).json({
      run_id: run.id,
      status: run.status,
      pipeline_id: run.pipeline_id,
      lead_count: run.lead_count,
      created_at: run.created_at,
      rerun_of_result_id: stored.id,
      rerun_of_lead_id: stored.lead_id,
    });
  } catch (err) {
    console.error('[lead-results] POST rerun error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
