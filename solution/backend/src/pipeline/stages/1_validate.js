const stringSimilarity = require('string-similarity');

function validateEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateLead(lead) {
  const flags = [];
  const gateResults = {};

  // Must have id and company_name
  if (!lead.id || !lead.company_name) {
    return { valid: false, status: 'invalid_input', flags: ['missing_required_fields'], gate_results: { missing_required: true } };
  }

  // Email validation
  const emailValid = validateEmail(lead.email);
  gateResults.email_valid = emailValid;
  if (!emailValid) {
    flags.push('invalid_email');
    if (lead.email) {
      gateResults.email_reason = `'[redacted]' does not match expected format`;
    } else {
      gateResults.email_reason = 'Email address missing';
    }
  }

  return { valid: emailValid, flags, gate_results: gateResults };
}

function deduplicateLeads(leads, threshold = 0.85) {
  const seen = new Map(); // key -> lead_id
  const results = [];

  for (const lead of leads) {
    const key = `${lead._company_name_normalised}||${lead._website_normalised}`;

    // Exact key match
    if (seen.has(key)) {
      results.push({ lead, isDuplicate: true, duplicateOf: seen.get(key) });
      continue;
    }

    // Fuzzy match against seen keys
    let foundDuplicate = false;
    for (const [seenKey, seenId] of seen.entries()) {
      const similarity = stringSimilarity.compareTwoStrings(key, seenKey);
      if (similarity >= threshold) {
        results.push({ lead, isDuplicate: true, duplicateOf: seenId });
        foundDuplicate = true;
        break;
      }
    }

    if (!foundDuplicate) {
      seen.set(key, lead.id);
      results.push({ lead, isDuplicate: false, duplicateOf: null });
    }
  }

  return results;
}

module.exports = { validateLead, deduplicateLeads };
