// OpenRouter is called via the OpenAI-compatible SDK — the openai package supports
// CommonJS require() while @openrouter/sdk is ESM-only. Both hit the same API.
const OpenAI = require('openai');

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || '',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'GTM Pipeline',
      },
    });
  }
  return client;
}

async function callLLM({ systemPrompt, userMessage, model, temperature = 0, maxTokens = 1024 }) {
  const c = getClient();
  const m = model || process.env.LLM_MODEL || 'openai/gpt-5.2';

  const response = await c.chat.completions.create({
    model: m,
    temperature,
    max_tokens: maxTokens,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: userMessage },
    ],
  });

  return response.choices?.[0]?.message?.content ?? '';
}

async function callLLMWithRetry(params, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const text = await callLLM(params);
      const parsed = JSON.parse(text);
      return parsed;
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      return null; // safe fallback
    }
  }
}

module.exports = { callLLM, callLLMWithRetry };
