import React, { useState, useEffect } from 'react'
import { api } from '../api/client'
import LeadCard from './LeadCard'

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function HistoryTab() {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRun, setSelectedRun] = useState(null)
  const [runDetail, setRunDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    api.listRuns()
      .then(r => setRuns(r.runs || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function selectRun(run) {
    setSelectedRun(run)
    setLoadingDetail(true)
    try {
      const detail = await api.getRun(run.run_id || run.id)
      setRunDetail(detail)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingDetail(false)
    }
  }

  if (loading) return <div className="text-center py-8 text-gray-400">Loading history…</div>
  if (runs.length === 0) return (
    <div className="text-center py-12 text-gray-400">
      <div className="text-4xl mb-3">📋</div>
      <p>No past runs yet. Run the pipeline first.</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="lg:w-72 lg:flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Past Runs</h3>
        <div className="flex gap-3 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
          {runs.map(run => {
            const id = run.run_id || run.id
            const isSelected = selectedRun && (selectedRun.run_id || selectedRun.id) === id
            return (
              <button
                key={id}
                onClick={() => selectRun(run)}
                className={`min-w-[15rem] shrink-0 text-left rounded-md border p-3 transition-colors lg:w-full lg:min-w-0 ${isSelected ? 'border-stone-300 bg-stone-100' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
              >
                <div className="text-xs text-gray-400 font-mono">{id.slice(0, 8)}…</div>
                <div className="text-sm font-medium mt-1">{formatDate(run.created_at)}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    run.status === 'completed' ? 'bg-green-100 text-green-700' :
                    run.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{run.status}</span>
                  <span className="text-xs text-gray-400">{run.processed_count}/{run.lead_count} leads</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        {!selectedRun && (
          <div className="text-center py-12 text-gray-400">
            <p>Select a run to view results.</p>
          </div>
        )}
        {selectedRun && loadingDetail && (
          <div className="text-center py-8 text-gray-400">Loading results…</div>
        )}
        {selectedRun && runDetail && !loadingDetail && (
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Results — {formatDate(runDetail.created_at)}
            </h3>
            {(runDetail.results || []).map(r => <LeadCard key={r.id} result={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}
