import React, { useEffect, useState } from 'react'
import { api } from '../api/client'
import LeadCard from './LeadCard'

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function LatestLeadsTab() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const data = await api.listLatestLeadResults()
      setResults(data.results || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleOverride() {
    await load()
  }

  if (loading) return <div className="text-center py-8 text-gray-400">Loading latest leads…</div>

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Latest Leads</h2>
        <p className="mt-1 text-sm text-gray-500">
          This is the latest stored result per lead ID. The decision log, score breakdown, and flags explain why the result passed or failed.
        </p>
      </div>

      <div className="mb-6 rounded-md border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
        <span className="font-medium text-stone-900">Implemented now:</span> latest stored result per lead for an operator-friendly current-state view.
        {' '}
        <span className="font-medium text-stone-900">Future scope:</span> full config versioning and config snapshots per run, so this view can also show the exact config behind each historical decision.
      </div>

      {results.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>No lead results yet. Run the pipeline first.</p>
        </div>
      ) : (
        <div>
          <div className="mb-3 text-sm text-gray-500">
            {results.length} leads with latest stored results
          </div>
          {results.map(result => (
            <div key={result.result_id} className="mb-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-700">
                  Run {result.run_id.slice(0, 8)}…
                </span>
                <span>Run time {formatDate(result.run_created_at)}</span>
                <span>Updated {formatDate(result.result_updated_at)}</span>
                <span className="font-mono text-[11px] text-gray-400">config {result.config_hash || '—'}</span>
              </div>
              <LeadCard result={result} runId={result.run_id} onOverride={handleOverride} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
