#!/usr/bin/env node
/**
 * Eval runner — validates pipeline output against eval cases.
 * Usage: node evals/runner.js
 * Requires backend to be running on http://localhost:8000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE || 'http://localhost:8000';
const CASES = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${data.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = http.request(options, res => {
      let resp = '';
      res.on('data', c => resp += c);
      res.on('end', () => {
        try { resolve(JSON.parse(resp)); }
        catch (e) { reject(new Error(`JSON parse: ${resp.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function waitForRun(runId, maxWait = 120000, interval = 2000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const run = await httpGet(`${API_BASE}/runs/${runId}`);
    if (run.status === 'completed' || run.status === 'failed') return run;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Run ${runId} did not complete within ${maxWait}ms`);
}

function pass(id, msg) { console.log(`  ✅ ${id}: ${msg}`); return true; }
function fail(id, msg) { console.log(`  ❌ ${id}: ${msg}`); return false; }

async function runEvals() {
  console.log('\n=== GTM Pipeline Eval Runner ===\n');

  // Start a run with default leads
  console.log('Starting pipeline run with default leads...');
  const runResp = await httpPost(`${API_BASE}/runs`, {});
  const runId = runResp.run_id;
  console.log(`Run ID: ${runId}\nWaiting for completion...\n`);

  const run = await waitForRun(runId);
  const results = run.results || [];

  if (run.status === 'failed') {
    console.log('❌ Run failed. Cannot evaluate.');
    process.exit(1);
  }

  console.log(`Run completed. ${results.length} lead results.\n`);

  const byCompany = {};
  for (const r of results) {
    byCompany[r.company_name] = r;
  }

  let passed = 0, total = 0;

  for (const evalCase of CASES) {
    total++;
    const id = evalCase.id;
    const checks = evalCase.checks;

    // E-07: Startup Ventures → Triage, icp_score null
    if (id === 'E-07') {
      const r = byCompany['Startup Ventures Ltd'];
      if (!r) { fail(id, 'Result for Startup Ventures Ltd not found'); continue; }
      const routeOk = r.routing === 'Triage';
      const scoreOk = r.icp_score === null;
      if (routeOk && scoreOk) { passed++; pass(id, `routing=Triage, icp_score=null`); }
      else { fail(id, `routing=${r.routing}, icp_score=${r.icp_score}`); }
      continue;
    }

    // E-08: Dedup — 9 non-skipped results
    if (id === 'E-08') {
      const nonSkipped = results.filter(r => r.status !== 'skipped').length;
      if (nonSkipped === 9) { passed++; pass(id, `${nonSkipped} non-skipped results (1 duplicate skipped)`); }
      else { fail(id, `Expected 9 non-skipped, got ${nonSkipped}`); }
      continue;
    }

    // E-09: Thames Valley Logistics invalid email
    if (id === 'E-09') {
      const r = byCompany['Thames Valley Logistics'];
      if (!r) { fail(id, 'Result for Thames Valley Logistics not found'); continue; }
      if (r.flags && r.flags.includes('invalid_email')) { passed++; pass(id, 'invalid_email flag present'); }
      else { fail(id, `flags=${JSON.stringify(r.flags)}`); }
      continue;
    }

    // E-04: Thames Valley Logistics — email null, red_flag_detected
    if (id === 'E-04') {
      const r = byCompany['Thames Valley Logistics'];
      if (!r) { fail(id, 'Result not found'); continue; }
      const emailNull = r.email === null;
      const flagged = r.flags && r.flags.includes('red_flag_detected');
      if (emailNull && flagged) { passed++; pass(id, 'email=null, red_flag_detected flag present'); }
      else { fail(id, `email=${r.email === null ? 'null' : 'present'}, flags=${JSON.stringify(r.flags)}`); }
      continue;
    }

    // E-10: business_need not null for any completed lead
    if (id === 'E-10') {
      const completed = results.filter(r => r.status === 'completed' && r.icp_score !== null);
      const allGrounded = completed.every(r => r.decision_log?.notes_interpretation?.business_need != null);
      if (allGrounded && completed.length > 0) { passed++; pass(id, `All ${completed.length} completed leads have business_need`); }
      else { fail(id, `Some leads missing business_need or no completed leads`); }
      continue;
    }

    // Email-based evals (E-01 through E-06)
    const companyName = evalCase.lead?.company_name;
    if (!companyName) { fail(id, 'No company_name in eval case'); continue; }

    const r = byCompany[companyName];
    if (!r) { fail(id, `Result for ${companyName} not found`); continue; }

    // E-04 handled above; for E-04 we need no email — skip email checks
    const emailBody = r.email?.body || '';
    const emailBodyLower = emailBody.toLowerCase();

    // Forbidden words
    if (checks.forbid) {
      const found = checks.forbid.filter(w => emailBodyLower.includes(w.toLowerCase()));
      if (found.length > 0) { fail(id, `Forbidden words found: ${found.join(', ')}`); continue; }
    }

    // must_include
    if (checks.must_include) {
      const missing = checks.must_include.filter(w => !emailBodyLower.includes(w.toLowerCase()));
      if (missing.length > 0) { fail(id, `Required words missing: ${missing.join(', ')}`); continue; }
    }

    // must_include_one_of
    if (checks.must_include_one_of) {
      const found = checks.must_include_one_of.some(w => emailBodyLower.includes(w.toLowerCase()));
      if (!found) { fail(id, `None of ${checks.must_include_one_of.join(', ')} found`); continue; }
    }

    // Word count
    if (checks.min_length || checks.max_length) {
      if (!emailBody) { fail(id, 'Email body missing'); continue; }
      const wc = countWords(emailBody);
      if (checks.min_length && wc < checks.min_length) { fail(id, `Word count ${wc} < min ${checks.min_length}`); continue; }
      if (checks.max_length && wc > checks.max_length) { fail(id, `Word count ${wc} > max ${checks.max_length}`); continue; }
    }

    // Disclaimer check
    if (checks.require_disclaimer_if_terms) {
      const termsWords = ['rate', 'term', 'pricing', 'fee', 'interest', 'repay'];
      const mentionsTerms = termsWords.some(w => emailBodyLower.includes(w));
      if (mentionsTerms) {
        const hasDisclaimer = emailBodyLower.includes('subject to status');
        if (!hasDisclaimer) { fail(id, 'Email mentions terms/rates but lacks "Subject to status" disclaimer'); continue; }
      }
    }

    // Safety flag check (E-04 only — handled above)
    if (checks.should_flag_safety) {
      const flagged = r.flags && (r.flags.includes('red_flag_detected') || r.flags.includes('invalid_email'));
      if (!flagged) { fail(id, `Expected safety/red flag for ${companyName}`); continue; }
    }

    passed++;
    pass(id, 'All checks passed');
  }

  console.log(`\n=== Results: ${passed}/${total} passed ===\n`);
  process.exit(passed === total ? 0 : 1);
}

runEvals().catch(err => {
  console.error('Eval runner error:', err);
  process.exit(1);
});
