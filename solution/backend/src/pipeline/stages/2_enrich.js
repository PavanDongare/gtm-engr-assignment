const path = require('path');
const stringSimilarity = require('string-similarity');

let stubData = null;

function loadStub() {
  if (stubData) return stubData;
  try {
    const stubPath = process.env.ENRICHMENT_STUB_PATH || path.join(__dirname, '../../../data/companies_house_stub.json');
    stubData = require(stubPath);
  } catch {
    stubData = {};
  }
  return stubData;
}

function computeAgeYears(incorporatedOn) {
  if (!incorporatedOn) return null;
  const then = new Date(incorporatedOn);
  const now = new Date();
  return parseFloat(((now - then) / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1));
}

function deriveSector(sicCodes, sicToSector) {
  if (!sicCodes || sicCodes.length === 0) return null;
  for (const sic of sicCodes) {
    if (sicToSector[sic]) return sicToSector[sic];
  }
  return null;
}

function enrich(lead, config) {
  const sicToSector = (config && config.sic_to_sector) || {};
  const stub = loadStub();
  const keys = Object.keys(stub);

  // Try exact match first
  let matchKey = keys.find(k => k.toLowerCase() === lead.company_name.toLowerCase());

  // Fuzzy match fallback
  if (!matchKey && keys.length > 0) {
    const normalised = lead._company_name_normalised;
    const normalisedKeys = keys.map(k =>
      k.toLowerCase().replace(/\s+(ltd|limited|co|company|plc|llp|inc|corp)\.?$/i, '').trim()
    );
    const bestMatch = stringSimilarity.findBestMatch(normalised, normalisedKeys);
    if (bestMatch.bestMatch.rating >= 0.85) {
      matchKey = keys[bestMatch.bestMatchIndex];
    }
  }

  if (!matchKey) {
    return {
      matched: false,
      confidence: 0.0,
      company_number: null,
      status: null,
      incorporated_on: null,
      company_age_years: null,
      sic_codes: null,
      sector: lead.sector_hint || null,
      address: null,
    };
  }

  const record = stub[matchKey];
  const sector = deriveSector(record.sic_codes, sicToSector) || lead.sector_hint || null;
  const ageYears = computeAgeYears(record.incorporated_on);

  return {
    matched: true,
    confidence: 1.0,
    company_number: record.company_number,
    status: record.status,
    incorporated_on: record.incorporated_on,
    company_age_years: ageYears,
    sic_codes: record.sic_codes,
    sector,
    address: record.registered_address,
  };
}

module.exports = { enrich };
