function normalise(lead) {
  const result = { ...lead };

  // Trim all string fields
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'string') {
      result[key] = result[key].trim();
    }
  }

  // Ensure numeric fields are numbers
  if (typeof result.annual_revenue_gbp === 'string') {
    result.annual_revenue_gbp = parseFloat(result.annual_revenue_gbp.replace(/[^0-9.]/g, '')) || 0;
  }
  if (typeof result.employees === 'string') {
    result.employees = parseInt(result.employees, 10) || 0;
  }

  // Normalised company name for matching (remove legal suffixes)
  result._company_name_normalised = (result.company_name || '')
    .toLowerCase()
    .replace(/\s+(ltd|limited|co|company|plc|llp|inc|corp)\.?$/i, '')
    .trim();

  // Normalised website for dedup
  result._website_normalised = (result.website || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

  return result;
}

module.exports = { normalise };
