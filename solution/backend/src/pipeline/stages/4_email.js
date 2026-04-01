const { callLLMWithRetry } = require('../llm');
const { getRevenueBand } = require('./3_score');

function extractFirstName(contactName) {
  if (!contactName) return 'there';
  // Strip honorifics
  const stripped = contactName.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.)\s*/i, '').trim();
  return stripped.split(/\s+/)[0] || 'there';
}

async function draftEmail(lead, enrichment, scoring, config) {
  // Only draft for Growth-Inbound
  if (scoring.routing !== 'Growth-Inbound') {
    return null;
  }

  const { min: wMin, max: wMax } = config.heuristics.email_word_count;
  const sector = enrichment.sector || lead.sector_hint || 'Unknown';
  const sectorHint = config.llm_context.sector_product_hints[sector]
    || config.llm_context.sector_product_hints['default'];

  const firstName = extractFirstName(lead.contact_name);
  const revenueBand = getRevenueBand(lead.annual_revenue_gbp);
  const companyAge = enrichment.company_age_years
    ? `${enrichment.company_age_years} years (incorporated ${enrichment.incorporated_on})`
    : 'unknown';
  const address = enrichment.address || 'UK';
  const businessNeed = scoring.notes_interpretation?.business_need || 'general lending enquiry';

  const systemPrompt = `You are a business development writer for Allica Bank, a UK specialist lender for established SME businesses.

Your job is to write a short, professional first-touch email to a business that has expressed interest in lending.

STRICT RULES — violating any of these will cause the email to fail a compliance check:
1. Length: between ${wMin} and ${wMax} words. Count carefully. Do not go under or over.
2. Exactly ONE call to action — either "book a call" or "reply for more information". Not both.
3. Use the contact's first name in the greeting (e.g. "Dear Sarah,")
4. Reference the company name and their specific business need
5. Use the sector-appropriate product angle provided to you
6. Tone: pragmatic, respectful, professional. No sales jargon. No exclamation marks.
7. NEVER promise guaranteed approval, specific timelines, or certainty of funding
8. NEVER mention specific interest rates, "lowest rates", "best rates", or "best terms"
9. If referencing pricing or terms at all, include this exact disclaimer: "Subject to status and credit checks. Terms apply."
10. Do not use multiple CTAs. Do not use phrases like "feel free to", "don't hesitate to"

You must return ONLY a valid JSON object with this exact structure, no other text:
{
  "subject": "email subject line (max 60 characters)",
  "body": "full email body text"
}`;

  const userMessage = `Contact first name: ${firstName}
Company: ${lead.company_name}
Sector: ${sector}
Revenue band: ${revenueBand}
Company age: ${companyAge}
Business need (extracted from their enquiry): ${businessNeed}
Address: ${address}

Sector-specific product angle to reference:
${sectorHint}

Write the first-touch email. Remember: ${wMin}-${wMax} words, exactly one CTA, no guarantees or specific rates.`;

  const result = await callLLMWithRetry(
    {
      systemPrompt,
      userMessage,
      model: process.env.LLM_EMAIL_MODEL || process.env.LLM_MODEL || 'claude-sonnet-4-6',
      temperature: 0.3,
      maxTokens: 1024,
    },
    1
  );

  if (!result) {
    return null;
  }

  return result;
}

module.exports = { draftEmail };
