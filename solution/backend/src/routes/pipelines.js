const express = require('express');
const router = express.Router();
const db = require('../db/client');

// GET /pipelines/default
router.get('/default', async (req, res) => {
  try {
    const pipeline = await db.getDefaultPipeline();
    if (!pipeline) return res.status(404).json({ error: 'No default pipeline found' });
    res.json(pipeline);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /pipelines/default
router.put('/default', async (req, res) => {
  try {
    const { config } = req.body;
    if (!config) return res.status(400).json({ error: 'config is required' });
    const updated = await db.updateDefaultPipeline(config);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
