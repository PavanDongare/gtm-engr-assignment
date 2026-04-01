require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db/client');
const defaultConfig = require('./config/default.json');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/runs', require('./routes/runs'));
app.use('/pipelines', require('./routes/pipelines'));
app.use('/lead-results', require('./routes/lead-results'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 8000;

async function start() {
  // Wait for DB to be ready (Docker startup race)
  let retries = 10;
  while (retries > 0) {
    try {
      await db.query('SELECT 1');
      break;
    } catch (err) {
      retries--;
      if (retries === 0) throw err;
      console.log(`[startup] DB not ready, retrying... (${retries} left)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Seed default config
  await db.ensureSchema();
  await db.ensureDefaultConfig(defaultConfig);

  app.listen(PORT, () => {
    console.log(`[server] GTM Pipeline backend running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
