import React, { useState } from 'react'
import LeadDetail from './LeadDetail'

const ROUTING_COLORS = {
  'Growth-Inbound': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
  'Triage':         { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200' },
  'Manual Review':  { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' },
  'Declined':       { bg: 'bg-gray-200', text: 'text-gray-700', border: 'border-gray-300' },
}

const FLAG_LABELS = {
  duplicate:              'Duplicate',
  invalid_email:          'Invalid Email',
  red_flag_detected:      'Red Flag',
  below_revenue_threshold:'Below Revenue Min',
  young_company:          'Young Company',
  above_max_revenue:      'Above £50m',
  non_limited_entity:     'Non-Limited Entity',
  company_status_declined:'Status: Declined',
  enrichment_unverified:  'Unverified',
  llm_error:              'LLM Error',
  safety_check_incomplete:'Safety Incomplete',
  processing_error:       'Processing Error',
  missing_required_fields:'Missing Fields',
  possible_prompt_injection: 'Injection Attempt',
}

function ScoreBadge({ score }) {
  if (score === null || score === undefined) return <span className="text-gray-400 text-sm">—</span>
  const pct = Math.round(score * 100)
  const color = score > 0.7 ? 'text-green-700' : score > 0.4 ? 'text-yellow-700' : 'text-red-700'
  return <span className={`font-bold text-sm ${color}`}>{pct}%</span>
}

function PendingRow({ result }) {
  return (
    <div className="border rounded-lg bg-white shadow-sm mb-3 opacity-60">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse" />
          <div>
            <span className="font-medium text-gray-900">{result.company_name}</span>
            <span className="text-xs text-gray-400 ml-2">{result.id}</span>
          </div>
        </div>
        <span className="text-xs text-gray-400">pending…</span>
      </div>
    </div>
  )
}

export default function LeadCard({ result, runId, onOverride }) {
  const [expanded, setExpanded] = useState(false)
  const [showJson, setShowJson] = useState(false)

  if (!result) return null
  if (result.status === 'pending') return <PendingRow result={result} />

  const override = result.operator_override
  const activeRouting = override?.routing || result.routing
  const activeRoutingPriority = override ? override.routing_priority : result.routing_priority
  const routingStyle = ROUTING_COLORS[activeRouting] || { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' }
  const isSkipped = result.status === 'skipped'

  return (
    <div className={`border rounded-lg bg-white shadow-sm mb-3 ${isSkipped ? 'opacity-60' : ''}`}>
      <button
        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900">{result.company_name}</span>
              <span className="text-xs text-gray-400">{result.id}</span>
              {isSkipped && (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">
                  skipped — duplicate of {result.duplicate_of}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {activeRouting && !isSkipped && (
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${routingStyle.bg} ${routingStyle.text} ${routingStyle.border}`}>
                  {activeRouting}{activeRoutingPriority ? ` · ${activeRoutingPriority}` : ''}
                </span>
              )}
              {override && (
                <span className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                  Overridden
                </span>
              )}
              {(result.flags || []).map(f => (
                <span key={f} className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">
                  {FLAG_LABELS[f] || f}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 ml-4 flex-shrink-0">
          {!isSkipped && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(true)
                setShowJson(v => !v)
              }}
              className={`rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                showJson
                  ? 'border-stone-300 bg-stone-900 text-white'
                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              }`}
            >
              API JSON
            </button>
          )}
          <div className="text-right">
            <div className="text-xs text-gray-400">ICP Score</div>
            <ScoreBadge score={result.icp_score} />
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && !isSkipped && (
        <div className="border-t px-4 py-4">
          <LeadDetail
            result={result}
            runId={runId}
            onOverride={onOverride}
            showJson={showJson}
            onToggleJson={() => setShowJson(v => !v)}
          />
        </div>
      )}
    </div>
  )
}
