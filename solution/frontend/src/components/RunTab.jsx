import React, { useState, useEffect, useRef } from 'react'
import { api } from '../api/client'
import LeadCard from './LeadCard'

export default function RunTab() {
  const [runId, setRunId] = useState(null)
  const [run, setRun] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [leadsText, setLeadsText] = useState('')
  const [parseError, setParseError] = useState(null)
  const pollRef = useRef(null)
  const fileRef = useRef(null)

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => () => stopPolling(), [])

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setLeadsText(ev.target.result)
    reader.readAsText(file)
  }

  async function startRun() {
    setLoading(true)
    setError(null)
    setParseError(null)
    setRun(null)
    stopPolling()

    let leads = null
    if (leadsText.trim()) {
      try {
        leads = JSON.parse(leadsText)
        if (!Array.isArray(leads)) throw new Error('Must be a JSON array')
      } catch (e) {
        setParseError(`Invalid JSON: ${e.message}`)
        setLoading(false)
        return
      }
    }

    try {
      const resp = await api.startRun(leads)
      setRunId(resp.run_id)
      pollRef.current = setInterval(async () => {
        try {
          const r = await api.getRun(resp.run_id)
          setRun(r)
          if (r.status === 'completed' || r.status === 'failed') stopPolling()
        } catch (e) {
          console.error('Poll error:', e)
        }
      }, 2000)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // When an operator override is saved, refresh the run so the card updates.
  async function handleOverride() {
    if (!runId) return
    try {
      const r = await api.getRun(runId)
      setRun(r)
    } catch (e) {
      console.error('Refresh after override failed:', e)
    }
  }

  const results = run?.results || []
  const isProcessing = run && run.status === 'processing'
  const pendingCount = results.filter(r => r.status === 'pending').length
  const completedCount = results.filter(r => r.status !== 'pending').length

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Process Leads</h2>
          <p className="text-sm text-gray-500 mt-0.5">Paste a JSON array of leads, upload a file, or leave empty to run the sample dataset.</p>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="text-sm font-medium text-gray-700">Leads JSON</label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="text-sm text-stone-600 hover:text-stone-900 underline"
            >
              Upload file
            </button>
            {leadsText && (
              <button onClick={() => setLeadsText('')} className="text-sm text-red-400 hover:text-red-600">
                Clear
              </button>
            )}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleFile} />
        <textarea
          value={leadsText}
          onChange={e => { setLeadsText(e.target.value); setParseError(null) }}
          placeholder={`[\n  { "id": "L-2001", "company_name": "Oxfordshire Bakery Ltd", "contact_name": "Amelia Shaw", "email": "amelia.shaw@example.com", "website": "https://oxonbakery.example", "employees": 18, "annual_revenue_gbp": 1800000, "notes": "Inbound form: equipment upgrade financing." },\n  { "id": "L-2002", "company_name": "Northbridge Fabrication Co", "contact_name": "Harjit Singh", "email": "harjit@northbridgefab.example", "website": "http://northbridgefab.example", "employees": 42, "annual_revenue_gbp": 5200000, "notes": "Broker referral: refinance existing loans." },\n  ...\n]`}
          rows={6}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-mono text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-stone-400 resize-y"
        />
        {parseError && <p className="text-xs text-red-500 mt-1">{parseError}</p>}
      </div>

      <div className="mb-6 flex justify-stretch sm:justify-end">
        <button
          onClick={startRun}
          disabled={loading || isProcessing}
          className="w-full px-4 py-2 bg-stone-900 text-white rounded-md text-sm font-medium hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors sm:w-auto"
        >
          {loading ? 'Starting…' : isProcessing ? 'Processing…' : 'Run Pipeline'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-700 mb-4">
          Error: {error}
        </div>
      )}

      {run && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <span>Run {run.run_id?.slice(0, 8)}…</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            run.status === 'completed' ? 'bg-green-100 text-green-700' :
            run.status === 'failed'    ? 'bg-red-100 text-red-700' :
                                         'bg-blue-100 text-blue-700'
          }`}>{run.status}</span>
          {isProcessing && (
            <span>{completedCount} of {run.lead_count} completed</span>
          )}
          {run.status === 'completed' && (
            <span>{completedCount} leads processed</span>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div>
          {results.map(r => (
            <LeadCard
              key={r.result_id || r.id}
              result={r}
              runId={run?.run_id || run?.id}
              onOverride={handleOverride}
            />
          ))}
        </div>
      )}

      {!run && !loading && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">🚀</div>
          <p>Click <strong>Run Pipeline</strong> to process the sample leads.</p>
        </div>
      )}
    </div>
  )
}
