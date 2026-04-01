const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  startRun: (leads) => request('/runs', {
    method: 'POST',
    body: JSON.stringify(leads ? { leads } : {}),
  }),
  getRun: (id) => request(`/runs/${id}`),
  listRuns: () => request('/runs'),
  listLatestLeadResults: () => request('/lead-results/latest'),
  rerunLeadResult: (resultId) => request(`/lead-results/${resultId}/rerun`, {
    method: 'POST',
  }),
  overrideLeadResult: (runId, resultId, body) => request(`/runs/${runId}/results/${resultId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }),
  getDefaultPipeline: () => request('/pipelines/default'),
  updateDefaultPipeline: (config) => request('/pipelines/default', {
    method: 'PUT',
    body: JSON.stringify({ config }),
  }),
};
