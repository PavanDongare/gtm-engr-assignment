import React, { useState } from 'react'
import { api } from '../api/client'

const ROUTING_OPTIONS = ['Growth-Inbound', 'Manual Review', 'Triage', 'Declined']
const PRIORITY_OPTIONS = { 'Growth-Inbound': ['priority', 'standard'], default: [] }

function Section({ title, children }) {
  return (
    <div className="mb-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h4>
      {children}
    </div>
  )
}

function KV({ label, value, mono }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex gap-2 text-sm mb-1">
      <span className="text-gray-500 min-w-[160px] flex-shrink-0">{label}</span>
      <span className={`text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}>{String(value)}</span>
    </div>
  )
}

function OverrideForm({ result, runId, onOverride }) {
  const [routing, setRouting] = useState(result.routing || 'Manual Review')
  const [priority, setPriority] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const priorityOptions = PRIORITY_OPTIONS[routing] || []

  async function submit(e) {
    e.preventDefault()
    if (!reason.trim()) return
    setSaving(true)
    setError(null)
    try {
      const updated = await api.overrideLeadResult(runId, result.result_id, {
        routing,
        routing_priority: priority || null,
        reason: reason.trim(),
      })
      onOverride(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-purple-50 border border-purple-200 rounded p-3 space-y-3">
      <div className="flex gap-3 flex-wrap">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Routing</label>
          <select
            value={routing}
            onChange={e => { setRouting(e.target.value); setPriority('') }}
            className="text-sm border rounded px-2 py-1 bg-white"
          >
            {ROUTING_OPTIONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        {priorityOptions.length > 0 && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">Priority</label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className="text-sm border rounded px-2 py-1 bg-white"
            >
              <option value="">—</option>
              {priorityOptions.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">Reason (required)</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={2}
          placeholder="Why are you overriding this decision?"
          className="w-full text-sm border rounded px-2 py-1 resize-none"
          required
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving || !reason.trim()}
        className="px-3 py-1.5 bg-purple-700 text-white text-sm rounded hover:bg-purple-800 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Saving…' : 'Save Override'}
      </button>
    </form>
  )
}

export default function LeadDetail({ result, runId, onOverride }) {
  const [showOverrideForm, setShowOverrideForm] = useState(false)

  if (!result) return null

  const { enrichment, score_breakdown, decision_log, email } = result
  const override = result.operator_override

  function handleOverrideSaved(updated) {
    setShowOverrideForm(false)
    if (onOverride) onOverride(updated)
  }

  return (
    <div className="space-y-4">

      {/* Operator Override */}
      {result.result_id && runId && (
        <Section title="Operator Actions">
          {override ? (
            <div className="bg-purple-50 border border-purple-200 rounded p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-purple-700">Decision overridden</span>
                <button
                  onClick={() => setShowOverrideForm(f => !f)}
                  className="text-xs text-purple-600 underline"
                >
                  {showOverrideForm ? 'Cancel' : 'Change'}
                </button>
              </div>
              <KV label="Override routing" value={`${override.routing}${override.routing_priority ? ` · ${override.routing_priority}` : ''}`} />
              <KV label="Reason" value={override.reason} />
              <KV label="Original routing" value={`${result.routing}${result.routing_priority ? ` · ${result.routing_priority}` : ''}`} />
              {showOverrideForm && (
                <div className="pt-2">
                  <OverrideForm result={result} runId={runId} onOverride={handleOverrideSaved} />
                </div>
              )}
            </div>
          ) : (
            <div>
              <button
                onClick={() => setShowOverrideForm(f => !f)}
                className="px-3 py-1.5 border border-purple-300 text-purple-700 text-sm rounded hover:bg-purple-50 transition-colors"
              >
                {showOverrideForm ? 'Cancel' : 'Override Decision'}
              </button>
              {showOverrideForm && (
                <div className="mt-2">
                  <OverrideForm result={result} runId={runId} onOverride={handleOverrideSaved} />
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      {/* Enrichment */}
      {enrichment && enrichment.matched && (
        <Section title="Company Registry">
          <div className="bg-gray-50 rounded p-3 space-y-1">
            <KV label="Company Number" value={enrichment.company_number} mono />
            <KV label="Status" value={enrichment.status} />
            <KV label="Sector" value={enrichment.sector} />
            <KV label="Incorporated" value={enrichment.incorporated_on} />
            <KV label="Company Age" value={enrichment.company_age_years ? `${enrichment.company_age_years} years` : null} />
            <KV label="Address" value={enrichment.address} />
            <KV label="SIC Codes" value={enrichment.sic_codes?.join(', ')} mono />
          </div>
        </Section>
      )}
      {enrichment && !enrichment.matched && (
        <Section title="Company Registry">
          <p className="text-sm text-gray-500 italic">No Companies House match — enrichment unavailable.</p>
        </Section>
      )}

      {/* Gate Results */}
      {decision_log?.gate_results && Object.keys(decision_log.gate_results).length > 0 && (
        <Section title="Validation Gates">
          <div className="bg-gray-50 rounded p-3 space-y-1">
            {Object.entries(decision_log.gate_results).map(([k, v]) => (
              <KV key={k} label={k.replace(/_/g, ' ')} value={String(v)} />
            ))}
          </div>
        </Section>
      )}

      {/* Notes Interpretation */}
      {decision_log?.notes_interpretation && (
        <Section title="Notes Interpretation">
          <div className="bg-blue-50 rounded p-3 space-y-2">
            <KV label="Business Need" value={decision_log.notes_interpretation.business_need} />
            {decision_log.notes_interpretation.red_flags?.length > 0 && (
              <div>
                <span className="text-sm text-gray-500">Red Flags</span>
                <ul className="mt-1 space-y-1">
                  {decision_log.notes_interpretation.red_flags.map((f, i) => (
                    <li key={i} className="text-sm text-red-700 bg-red-50 rounded px-2 py-1">⚠ {f}</li>
                  ))}
                </ul>
              </div>
            )}
            {decision_log.notes_interpretation.llm_reasoning && (
              <p className="text-sm text-gray-600 italic border-t pt-2 mt-2">
                {decision_log.notes_interpretation.llm_reasoning}
              </p>
            )}
          </div>
        </Section>
      )}

      {/* Score Breakdown */}
      {score_breakdown && (
        <Section title="ICP Score Breakdown">
          <div className="bg-gray-50 rounded p-3">
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: 'Revenue', value: score_breakdown.revenue, weight: '50%' },
                { label: 'Sector', value: score_breakdown.sector, weight: '30%' },
                { label: 'Company Age', value: score_breakdown.company_age, weight: '20%' },
              ].map(({ label, value, weight }) => (
                <div key={label} className="bg-white rounded border p-2 text-center">
                  <div className="text-xs text-gray-400">{label} ({weight})</div>
                  <div className="font-bold text-lg text-gray-800">{(value * 100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <span className={`text-xs px-2 py-0.5 rounded ${score_breakdown.revenue_verified ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                Revenue {score_breakdown.revenue_verified ? 'verified' : 'unverified (15% discount applied)'}
              </span>
              {' '}
              <span className={`text-xs px-2 py-0.5 rounded ${score_breakdown.age_available ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                Age {score_breakdown.age_available ? 'available' : 'unavailable (scored 0)'}
              </span>
            </div>
          </div>
        </Section>
      )}

      {/* Routing Decision */}
      {decision_log?.routing_reason && (
        <Section title="Routing Decision">
          <p className="text-sm text-gray-700 bg-gray-50 rounded p-3">{decision_log.routing_reason}</p>
        </Section>
      )}

      {/* Email */}
      {email && (
        <Section title="First-Touch Email Draft">
          <div className={`rounded border p-3 ${email.safety_passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600">Subject: {email.subject}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                email.safety_check_incomplete ? 'bg-yellow-100 text-yellow-700' :
                email.safety_passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {email.safety_check_incomplete ? '⚠ Safety check incomplete' :
                 email.safety_passed ? '✓ Safety passed' : '⚠ Safety failed'}
              </span>
            </div>
            <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">{email.body}</pre>
            {email.safety_violations?.length > 0 && (
              <div className="mt-2 pt-2 border-t border-red-200">
                <p className="text-xs font-medium text-red-700 mb-1">Safety violations:</p>
                <ul className="space-y-1">
                  {email.safety_violations.map((v, i) => (
                    <li key={i} className="text-xs text-red-600">• {v}</li>
                  ))}
                </ul>
              </div>
            )}
            {email.safety_reasoning && (
              <p className="text-xs text-gray-500 mt-2 italic border-t pt-2">{email.safety_reasoning}</p>
            )}
          </div>
        </Section>
      )}

      {result.routing === 'Triage' && !email && (
        <Section title="Email">
          <p className="text-sm text-gray-500 italic bg-gray-50 rounded p-3">
            No email drafted — lead routed to Triage.
          </p>
        </Section>
      )}

      {(result.routing === 'Manual Review' || result.routing === 'Declined') && !email && (
        <Section title="Email">
          <p className="text-sm text-gray-500 italic bg-red-50 rounded p-3">
            No email drafted — {result.routing === 'Declined' ? 'lead automatically declined.' : 'human review required before any outreach.'}
          </p>
        </Section>
      )}
    </div>
  )
}
