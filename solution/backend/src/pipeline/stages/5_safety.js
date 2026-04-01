const { callLLMWithRetry } = require('../llm');

function regexCheck(emailBody, prohibitedPhrases) {
  if (!emailBody) return [];
  const lower = emailBody.toLowerCase();
  return prohibitedPhrases.filter(phrase => lower.includes(phrase.toLowerCase()));
}

// Deterministic structural checks — no LLM needed, fast, always run first.
// Word count bounds and pricing/disclaimer terms come from config so they
// stay in sync with the generation prompt.
function structuralChecks(body, config) {
  const violations = [];
  const { min, max } = config.heuristics.email_word_count;
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < min || wordCount > max) {
    violations.push(`Email is ${wordCount} words — must be between ${min} and ${max}`);
  }

  const pricingWords = config.compliance.pricing_trigger_words;
  const pricingRe = new RegExp(`\\b(${pricingWords.join('|')})\\b`, 'i');
  const disclaimerRe = new RegExp(
    config.compliance.required_disclaimer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    'i'
  );
  if (pricingRe.test(body) && !disclaimerRe.test(body)) {
    violations.push(`Pricing or terms referenced without required disclaimer: "${config.compliance.required_disclaimer}. Terms apply."`);
  }
  return violations;
}

async function safetyCheck(email, scoring, config) {
  if (!email) return null;

  const body = email.body || '';
  const subject = email.subject || '';

  // Step 1: structural checks (word count, disclaimer)
  const structuralViolations = structuralChecks(body, config);

  // Step 2: prohibited phrase regex
  const regexViolations = regexCheck(body, config.heuristics.prohibited_phrases_regex);

  // Step 3: LLM check (only if both deterministic checks passed — saves tokens)
  let llmResult = null;
  if (structuralViolations.length === 0 && regexViolations.length === 0) {
    const prohibitedExamples = config.llm_context.prohibited_output_examples
      .map((p, i) => `${i + 1}. "${p}"`).join('\n');
    const prohibitedPhrases = config.heuristics.prohibited_phrases_regex
      .map((p, i) => `${i + 1}. "${p}"`).join('\n');

    const systemPrompt = `You are a compliance reviewer for Allica Bank.

Your job is to review a draft outreach email and identify any compliance violations.

There are two types of violations to check for:

TYPE 1 — KNOWN PROHIBITED PHRASES (these will also be caught by a separate automated check, but flag them anyway):
${prohibitedPhrases}

TYPE 2 — SUBTLE VIOLATIONS (these are examples of the type of phrasing to watch for):
${prohibitedExamples}

Also check:
- Does the email contain exactly one call to action? A call to action is any phrase inviting the reader to take a specific next step (e.g. "book a call", "reply to this email", "visit our website", "get in touch", "call us"). Flag as a violation if there is zero or more than one.
- Does the email contradict any red flags detected for this lead? (e.g. if a red flag was "company in financial distress" and the email says "we're confident we can help")
- Does the email imply certainty of approval without using exact prohibited phrases?
- Does the email promise a timeline without using exact prohibited words?

You must return ONLY a valid JSON object with this exact structure, no other text:
{
  "passed": true,
  "violations": [],
  "reasoning": "one sentence"
}

or if violations found:
{
  "passed": false,
  "violations": ["plain English description of each violation"],
  "reasoning": "one sentence explaining the main issue"
}

Be strict. If in doubt, flag it.`;

    const redFlagsText = (scoring.notes_interpretation?.red_flags || []).join('; ') || 'none';

    const userMessage = `Email subject: ${subject}
Email body: ${body}

Red flags detected for this lead: ${redFlagsText}
(Check that the email does not contradict these)

Review the email and return the JSON.`;

    llmResult = await callLLMWithRetry({ systemPrompt, userMessage, temperature: 0 }, 1);
  }

  const llmUnavailable = structuralViolations.length === 0 && regexViolations.length === 0 && llmResult === null;

  const safetyViolations = [
    ...structuralViolations,
    ...regexViolations.map(p => `Prohibited phrase detected: "${p}"`),
    ...(llmResult?.violations || []),
  ];

  const passed = !llmUnavailable && structuralViolations.length === 0 && regexViolations.length === 0 && (llmResult?.passed !== false);

  return {
    ...email,
    safety_passed: passed,
    safety_check_incomplete: llmUnavailable,
    safety_violations: safetyViolations,
    safety_reasoning: llmUnavailable
      ? 'LLM unavailable — subtle compliance violations could not be checked. Do not send without manual review.'
      : llmResult?.reasoning || (structuralViolations.length > 0 ? 'Structural check failed (word count or missing disclaimer).' : regexViolations.length > 0 ? 'Prohibited phrases detected by regex check.' : 'Passed all checks.'),
  };
}

module.exports = { safetyCheck };
