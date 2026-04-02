import React, { useState, useEffect } from 'react'
import { api } from '../api/client'

function Section({ title, description, children }) {
  return (
    <div className="mb-6 bg-white rounded-lg border p-4">
      <div className="mb-3">
        <h3 className="font-medium text-gray-900">{title}</h3>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function ReadOnlyField({ label, value, badge = 'engineer-only' }) {
  return (
    <div className="flex flex-col gap-1 py-2 border-b last:border-0 sm:flex-row sm:items-start sm:gap-3">
      <span className="text-sm text-gray-500 sm:w-48 sm:flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-400 font-mono text-xs break-all">{JSON.stringify(value)}</span>
      <span className="text-xs text-gray-300 sm:ml-auto">{badge}</span>
    </div>
  )
}

function ComplianceField({ label, value }) {
  const display = Array.isArray(value) ? value.join(', ') : value;
  return (
    <div className="flex flex-col gap-1 py-2 border-b last:border-0 sm:flex-row sm:items-start sm:gap-3">
      <span className="text-sm text-gray-500 sm:w-48 sm:flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-400 font-mono text-xs break-all">{display}</span>
      <span className="text-xs text-amber-400 sm:ml-auto sm:whitespace-nowrap">compliance-owned</span>
    </div>
  )
}

export default function ConfigTab({ activeSection = 'routing' }) {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getDefaultPipeline()
      .then(p => setConfig(p.config))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await api.updateDefaultPipeline(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function updatePath(path, value) {
    setConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const keys = path.split('.')
      let obj = next
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]]
      obj[keys[keys.length - 1]] = value
      return next
    })
  }

  function updateListField(path, index, value) {
    setConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const keys = path.split('.')
      let obj = next
      for (const k of keys) obj = obj[k]
      obj[index] = value
      return next
    })
  }

  function addToList(path) {
    setConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const keys = path.split('.')
      let obj = next
      for (const k of keys) obj = obj[k]
      obj.push('')
      return next
    })
  }

  function removeFromList(path, index) {
    setConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const keys = path.split('.')
      let obj = next
      for (const k of keys) obj = obj[k]
      obj.splice(index, 1)
      return next
    })
  }

  if (loading) return <div className="text-center py-8 text-gray-400">Loading configuration…</div>
  if (!config) return <div className="text-center py-8 text-gray-400">No config found. {error}</div>

  const h = config.heuristics
  const lc = config.llm_context
  const co = config.compliance || {}
  const show = section => activeSection === section

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pipeline Configuration</h2>
          <p className="text-sm text-gray-500 mt-0.5">Changes apply to all subsequent runs.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {saved && <span className="text-sm text-green-600">✓ Saved</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
          <button
            onClick={save}
            disabled={saving}
            className="w-full px-4 py-2 bg-stone-950 text-white rounded-lg text-sm font-medium hover:bg-black disabled:opacity-50 transition-colors sm:w-auto"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* ── ROUTING ── */}
      {show('routing') && <>
        <Section title="Routing Thresholds" description="ICP score cutoffs that determine team assignment.">
          <div className="space-y-3">
            {[
              { label: 'High threshold (Growth-Inbound priority)', path: 'heuristics.routing.high_threshold', desc: 'Scores above this → Growth-Inbound priority', step: 0.05, min: 0, max: 1 },
              { label: 'Low threshold (Triage cutoff)', path: 'heuristics.routing.low_threshold', desc: 'Scores below this → Triage', step: 0.05, min: 0, max: 1 },
            ].map(({ label, path, desc, step, min, max }) => {
              const keys = path.split('.')
              let val = config
              for (const k of keys) val = val[k]
              return (
                <div key={path}>
                  <label className="text-sm text-gray-700 font-medium block mb-1">{label}</label>
                  <p className="text-xs text-gray-400 mb-1">{desc}</p>
                  <input type="number" step={step} min={min} max={max} value={val}
                    onChange={e => updatePath(path, parseFloat(e.target.value))}
                    className="w-full max-w-[12rem] border rounded px-2 py-1 text-sm" />
                </div>
              )
            })}
            <div>
              <label className="text-sm text-gray-700 font-medium block mb-1">Revenue minimum (£)</label>
              <p className="text-xs text-gray-400 mb-1">Leads below this are routed to Triage without scoring.</p>
              <input type="number" step={50000} value={h.revenue.hard_gate_min_gbp}
                onChange={e => updatePath('heuristics.revenue.hard_gate_min_gbp', parseInt(e.target.value))}
                className="w-full max-w-[14rem] border rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-700 font-medium block mb-1">Revenue ceiling (£)</label>
              <p className="text-xs text-gray-400 mb-1">Leads above this are routed to Manual Review — outside standard product range.</p>
              <input type="number" step={1000000} value={h.revenue.max_revenue_gbp}
                onChange={e => updatePath('heuristics.revenue.max_revenue_gbp', parseInt(e.target.value))}
                className="w-full max-w-[14rem] border rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-700 font-medium block mb-1">Minimum trading years</label>
              <p className="text-xs text-gray-400 mb-1">Companies below this age are routed to Manual Review for alternate assessment.</p>
              <input type="number" step={0.5} min={0} value={h.company_age_years.min_trading_years}
                onChange={e => updatePath('heuristics.company_age_years.min_trading_years', parseFloat(e.target.value))}
                className="w-full max-w-[12rem] border rounded px-2 py-1 text-sm" />
            </div>
          </div>
        </Section>

        <Section title="Score Weights" description="Relative importance of each signal in the ICP score. Should sum to 1.0.">
          <div className="space-y-3">
            {[
              { label: 'Revenue weight', path: 'heuristics.score_weights.revenue', desc: 'Primary driver — determines loan size viability' },
              { label: 'Sector weight', path: 'heuristics.score_weights.sector', desc: 'Product-market fit and default risk profile' },
              { label: 'Company age weight', path: 'heuristics.score_weights.company_age', desc: 'Trading history as a creditworthiness signal' },
            ].map(({ label, path, desc }) => {
              const keys = path.split('.')
              let val = config
              for (const k of keys) val = val[k]
              return (
                <div key={path}>
                  <label className="text-sm text-gray-700 font-medium block mb-1">{label}</label>
                  <p className="text-xs text-gray-400 mb-1">{desc}</p>
                  <input type="number" step={0.05} min={0} max={1} value={val}
                    onChange={e => updatePath(path, parseFloat(e.target.value))}
                    className="w-full max-w-[12rem] border rounded px-2 py-1 text-sm" />
                </div>
              )
            })}
          </div>
        </Section>

        <Section title="Revenue Verification Discount" description="Penalty applied to the revenue score when Companies House enrichment finds no match.">
          <div>
            <label className="text-sm text-gray-700 font-medium block mb-1">Unverified revenue multiplier</label>
            <p className="text-xs text-gray-400 mb-1">Applied to revenue contribution only. 0.85 = 15% discount for self-reported revenue.</p>
            <input type="number" step={0.05} min={0} max={1} value={h.unverified_revenue_multiplier}
              onChange={e => updatePath('heuristics.unverified_revenue_multiplier', parseFloat(e.target.value))}
              className="w-full max-w-[12rem] border rounded px-2 py-1 text-sm" />
          </div>
        </Section>
      </>}

      {/* ── SECTORS ── */}
      {show('sectors') && <>
        <Section title="Good Sectors" description="Sectors that receive full credit in ICP scoring.">
          <div className="space-y-2">
            {lc.good_sectors.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <input value={s} onChange={e => updateListField('llm_context.good_sectors', i, e.target.value)}
                  className="flex-1 border rounded px-2 py-1 text-sm" />
                <button onClick={() => removeFromList('llm_context.good_sectors', i)} className="shrink-0 text-red-400 hover:text-red-600 px-2">✕</button>
              </div>
            ))}
            <button onClick={() => addToList('llm_context.good_sectors')} className="text-sm text-stone-700 hover:text-black">+ Add sector</button>
          </div>
        </Section>

        <Section title="Poor Sectors" description="Sectors that score zero in ICP scoring.">
          <div className="space-y-2">
            {lc.poor_sectors.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <input value={s} onChange={e => updateListField('llm_context.poor_sectors', i, e.target.value)}
                  className="flex-1 border rounded px-2 py-1 text-sm" />
                <button onClick={() => removeFromList('llm_context.poor_sectors', i)} className="shrink-0 text-red-400 hover:text-red-600 px-2">✕</button>
              </div>
            ))}
            <button onClick={() => addToList('llm_context.poor_sectors')} className="text-sm text-stone-700 hover:text-black">+ Add sector</button>
          </div>
        </Section>

        {config.sic_to_sector && (
          <Section title="SIC Code → Sector Mapping" description="Maps Companies House SIC codes to sector names used in scoring.">
            <div className="space-y-2">
              {Object.entries(config.sic_to_sector).map(([sic, sector]) => (
                <div key={sic} className="flex items-center gap-2">
                  <span className="text-sm font-mono text-gray-500 w-16 flex-shrink-0">{sic}</span>
                  <input value={sector}
                    onChange={e => {
                      setConfig(prev => {
                        const next = JSON.parse(JSON.stringify(prev))
                        next.sic_to_sector[sic] = e.target.value
                        return next
                      })
                    }}
                    className="flex-1 border rounded px-2 py-1 text-sm" />
                </div>
              ))}
            </div>
          </Section>
        )}
      </>}

      {/* ── SAFETY ── */}
      {show('safety') && <>
        <Section title="Red Flag Examples" description="Patterns the LLM uses to detect risk signals in lead notes.">
          <div className="space-y-2">
            {lc.red_flag_examples.map((f, i) => (
              <div key={i} className="flex items-start gap-2">
                <input value={f} onChange={e => updateListField('llm_context.red_flag_examples', i, e.target.value)}
                  className="flex-1 border rounded px-2 py-1 text-sm" />
                <button onClick={() => removeFromList('llm_context.red_flag_examples', i)} className="shrink-0 text-red-400 hover:text-red-600 px-2">✕</button>
              </div>
            ))}
            <button onClick={() => addToList('llm_context.red_flag_examples')} className="text-sm text-stone-700 hover:text-black">+ Add example</button>
          </div>
        </Section>

        <Section title="Prohibited Output Phrases" description="Phrases that must never appear in generated emails (fast regex check).">
          <div className="space-y-2">
            {h.prohibited_phrases_regex.map((p, i) => (
              <div key={i} className="flex items-start gap-2">
                <input value={p} onChange={e => updateListField('heuristics.prohibited_phrases_regex', i, e.target.value)}
                  className="flex-1 border rounded px-2 py-1 text-sm font-mono text-xs" />
                <button onClick={() => removeFromList('heuristics.prohibited_phrases_regex', i)} className="shrink-0 text-red-400 hover:text-red-600 px-2">✕</button>
              </div>
            ))}
            <button onClick={() => addToList('heuristics.prohibited_phrases_regex')} className="text-sm text-stone-700 hover:text-black">+ Add phrase</button>
          </div>
        </Section>

        <Section title="Prohibited Output Examples" description="Tone violations shown to the LLM compliance reviewer as examples of what to catch.">
          <div className="space-y-2">
            {(lc.prohibited_output_examples || []).map((p, i) => (
              <div key={i} className="flex items-start gap-2">
                <input value={p} onChange={e => updateListField('llm_context.prohibited_output_examples', i, e.target.value)}
                  className="flex-1 border rounded px-2 py-1 text-sm" />
                <button onClick={() => removeFromList('llm_context.prohibited_output_examples', i)} className="shrink-0 text-red-400 hover:text-red-600 px-2">✕</button>
              </div>
            ))}
            <button onClick={() => addToList('llm_context.prohibited_output_examples')} className="text-sm text-stone-700 hover:text-black">+ Add example</button>
          </div>
        </Section>
      </>}

      {/* ── MESSAGING ── */}
      {show('messaging') && <>
        <Section title="Email Word Count" description="Bounds enforced in both the generation prompt and the structural safety check — one source of truth.">
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
            <div>
              <label className="text-sm text-gray-700 font-medium block mb-1">Minimum words</label>
              <input type="number" step={5} min={50} value={h.email_word_count?.min ?? 110}
                onChange={e => updatePath('heuristics.email_word_count.min', parseInt(e.target.value))}
                className="w-full max-w-[10rem] border rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-700 font-medium block mb-1">Maximum words</label>
              <input type="number" step={5} min={50} value={h.email_word_count?.max ?? 170}
                onChange={e => updatePath('heuristics.email_word_count.max', parseInt(e.target.value))}
                className="w-full max-w-[10rem] border rounded px-2 py-1 text-sm" />
            </div>
          </div>
        </Section>

        <Section title="Sector Product Hints" description="Copy injected into first-touch emails per sector.">
          <div className="space-y-3">
            {Object.entries(lc.sector_product_hints).map(([sector, hint]) => (
              <div key={sector}>
                <label className="text-sm font-medium text-gray-700 block mb-1">{sector}</label>
                <textarea value={hint}
                  onChange={e => {
                    setConfig(prev => {
                      const next = JSON.parse(JSON.stringify(prev))
                      next.llm_context.sector_product_hints[sector] = e.target.value
                      return next
                    })
                  }}
                  rows={2} className="w-full border rounded px-2 py-1 text-sm" />
              </div>
            ))}
          </div>
        </Section>
      </>}

      {/* ── INTERNALS ── */}
      {show('internals') && <>
        <Section title="Algorithm Internals" description="Engineering constants. Change via direct DB edit or config redeploy.">
          <ReadOnlyField label="dedup_similarity_threshold" value={h.dedup_similarity_threshold} />
          <ReadOnlyField label="llm_concurrency_limit" value={h.llm_concurrency_limit} />
          <ReadOnlyField label="cache_ttl_days" value={h.cache_ttl_days ?? 30} />
          <ReadOnlyField label="revenue.bands" value="(see config JSON)" />
          <ReadOnlyField label="company_age_years.bands" value="(see config JSON)" />
        </Section>

        <Section title="Compliance Policy" description="Policy constants owned by compliance. Not GTM-editable. Change requires engineering + compliance review.">
          <ComplianceField label="declined_statuses" value={co.declined_statuses} />
          <ComplianceField label="eligible_company_types" value={co.eligible_company_types} />
          <ComplianceField label="pricing_trigger_words" value={co.pricing_trigger_words} />
          <ComplianceField label="required_disclaimer" value={co.required_disclaimer} />
        </Section>
      </>}
    </div>
  )
}
