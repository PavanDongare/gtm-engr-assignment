const pLimit = require('p-limit');
const { normalise } = require('./stages/0_normalise');
const { validateLead, deduplicateLeads } = require('./stages/1_validate');
const { enrich } = require('./stages/2_enrich');
const { scoreAndRoute } = require('./stages/3_score');
const { draftEmail } = require('./stages/4_email');
const { safetyCheck } = require('./stages/5_safety');
const db = require('../db/client');

async function processLead(rawLead, config, dedupInfo) {
  // Stage 0: Normalise
  const lead = normalise(rawLead);

  const baseResult = {
    id: lead.id || 'unknown',
    company_name: lead.company_name || 'Unknown',
  };

  // Handle invalid input (missing id or company_name)
  if (!lead.id || !lead.company_name) {
    return {
      ...baseResult,
      status: 'invalid_input',
      valid: false,
      duplicate_of: null,
      enrichment: null,
      icp_score: null,
      routing: null,
      routing_priority: null,
      flags: ['missing_required_fields'],
      score_breakdown: null,
      decision_log: { gate_results: { missing_required: true } },
      email: null,
    };
  }

  // Handle duplicate
  if (dedupInfo.isDuplicate) {
    return {
      ...baseResult,
      status: 'skipped',
      valid: false,
      duplicate_of: dedupInfo.duplicateOf,
      enrichment: null,
      icp_score: null,
      routing: null,
      routing_priority: null,
      flags: ['duplicate'],
      score_breakdown: null,
      decision_log: {
        gate_results: {
          is_duplicate: true,
          duplicate_of: dedupInfo.duplicateOf,
          reason: `Same company_name and website as ${dedupInfo.duplicateOf}`,
        },
      },
      email: null,
    };
  }

  // Stage 1: Validate
  const validation = validateLead(lead);
  const flags = [...validation.flags];

  // Stage 2: Enrich
  const enrichment = enrich(lead, config);

  // Stage 3: Score & Route
  const scoring = await scoreAndRoute(lead, enrichment, config);
  flags.push(...scoring.flags);

  // Build gate_results combining validation and scoring
  const gateResults = {
    email_valid: validation.gate_results.email_valid,
    is_duplicate: false,
    ...scoring.gate_results,
    ...(validation.gate_results.email_reason ? { email_reason: validation.gate_results.email_reason } : {}),
  };

  if (!scoring.passed_hard_gates) {
    return {
      ...baseResult,
      status: 'completed',
      valid: validation.valid,
      duplicate_of: null,
      enrichment: enrichment.matched ? enrichment : null,
      icp_score: null,
      routing: scoring.routing,
      routing_priority: scoring.routing_priority,
      flags,
      score_breakdown: null,
      decision_log: {
        gate_results: { ...gateResults, hard_gate_failure: scoring.hard_gate_failure },
        notes_interpretation: scoring.notes_interpretation,
        routing_reason: scoring.hard_gate_failure,
      },
      email: null,
    };
  }

  // Stage 4: Email — only if email address is valid (no point drafting if we can't send)
  let emailDraft = validation.valid ? await draftEmail(lead, enrichment, scoring, config) : null;

  // Stage 5: Safety
  let safeEmail = null;
  if (emailDraft) {
    safeEmail = await safetyCheck(emailDraft, scoring, config);
  }

  const routingReason = (() => {
    if (scoring.routing_override_reason) {
      return `${scoring.routing_override_reason} → Manual Review`;
    }
    if (scoring.notes_interpretation?.red_flags?.length > 0) {
      return `Red flags detected → Manual Review regardless of score`;
    }
    if (scoring.icp_score > config.heuristics.routing.high_threshold) {
      return `ICP score ${scoring.icp_score} > ${config.heuristics.routing.high_threshold} threshold → Growth-Inbound priority`;
    }
    if (scoring.icp_score >= config.heuristics.routing.low_threshold) {
      return `ICP score ${scoring.icp_score} in standard band (${config.heuristics.routing.low_threshold}–${config.heuristics.routing.high_threshold}) → Growth-Inbound standard`;
    }
    return `ICP score ${scoring.icp_score} < ${config.heuristics.routing.low_threshold} → Triage`;
  })();

  return {
    ...baseResult,
    status: 'completed',
    valid: validation.valid,
    duplicate_of: null,
    enrichment,
    icp_score: scoring.icp_score,
    routing: scoring.routing,
    routing_priority: scoring.routing_priority,
    flags,
    score_breakdown: scoring.score_breakdown,
    decision_log: {
      gate_results: gateResults,
      notes_interpretation: scoring.notes_interpretation,
      routing_reason: routingReason,
    },
    email: safeEmail,
    from_cache: false,
  };
}

async function processRun(run, leads, config) {
  const limit = pLimit(config.heuristics.llm_concurrency_limit ?? 3);

  // Normalise all leads first for dedup
  const normalisedLeads = leads.map(l => normalise(l));

  // Deduplicate
  const threshold = config.heuristics.dedup_similarity_threshold ?? 0.85;
  const dedupResults = deduplicateLeads(normalisedLeads, threshold);

  // Write pending placeholders before processing begins so the UI shows all
  // lead IDs immediately and crash recovery can identify unprocessed leads.
  await db.insertPendingLeadResults(run.id, normalisedLeads);

  await Promise.all(
    dedupResults.map(({ lead, isDuplicate, duplicateOf }) =>
      limit(async () => {
        try {
          const result = await processLead(lead, config, { isDuplicate, duplicateOf });
          // raw lead (including PII) stored in raw_input column, not in output
          await db.upsertLeadResult(run.id, result, lead);
        } catch (err) {
          console.error(`[pipeline] Error processing lead ${lead.id}:`, err);
          await db.upsertLeadResult(run.id, {
            id: lead.id || 'unknown',
            company_name: lead.company_name || 'Unknown',
            status: 'failed',
            valid: false,
            duplicate_of: null,
            enrichment: null,
            icp_score: null,
            routing: null,
            routing_priority: null,
            flags: ['processing_error'],
            score_breakdown: null,
            decision_log: { error: err.message },
            email: null,
                }, lead);
        }
      })
    )
  );

  await db.markRunCompleted(run.id);
}

module.exports = { processRun };
