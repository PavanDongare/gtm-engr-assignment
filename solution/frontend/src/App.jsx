import React, { useState } from 'react'
import RunTab from './components/RunTab'
import HistoryTab from './components/HistoryTab'
import LatestLeadsTab from './components/LatestLeadsTab'
import ConfigTab from './components/ConfigTab'

const NAV_ITEMS = [
  { id: 'run', label: 'Run Pipeline', type: 'tab' },
  { id: 'latest', label: 'Latest Leads', type: 'tab' },
  { id: 'history', label: 'Run History', type: 'tab' },
  { id: 'config', label: 'Configuration', type: 'tab' },
  { id: 'config-routing', label: 'Routing', type: 'config', section: 'routing' },
  { id: 'config-sectors', label: 'Sectors', type: 'config', section: 'sectors' },
  { id: 'config-safety', label: 'Safety', type: 'config', section: 'safety' },
  { id: 'config-messaging', label: 'Messaging', type: 'config', section: 'messaging' },
  { id: 'config-internals', label: 'Internals', type: 'config', section: 'internals' },
]

export default function App() {
  const [tab, setTab] = useState('run')
  const [configSection, setConfigSection] = useState('routing')

  function selectItem(item) {
    if (item.type === 'tab') {
      setTab(item.id)
      if (item.id === 'config') setConfigSection('routing')
      return
    }

    setTab('config')
    setConfigSection(item.section)
  }

  function isActive(item) {
    if (item.type === 'tab') return tab === item.id
    return tab === 'config' && configSection === item.section
  }

  function itemClass(item) {
    if (item.type === 'tab') {
      return isActive(item)
        ? 'bg-stone-300 text-stone-950'
        : 'text-stone-700 hover:bg-stone-100 hover:text-stone-950'
    }

    const configParentActive = tab === 'config'
    const configChildActive = tab === 'config' && configSection === item.section

    if (configChildActive) {
      return 'bg-stone-200 pl-8 text-stone-950'
    }

    if (item.id === 'config' && configParentActive) {
      return 'bg-stone-100 text-stone-700'
    }

    if (item.type === 'config') {
      return 'pl-8 text-stone-500 hover:bg-stone-100 hover:text-stone-900'
    }

    return 'text-stone-700 hover:bg-stone-100 hover:text-stone-950'
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <aside className="w-72 border-r border-stone-200 bg-white px-5 py-6">
          <div className="mb-8">
            <div className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Allica Bank</div>
            <div className="mt-2 text-2xl font-semibold text-stone-950">GTM Pipeline Console</div>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Internal workflow for lead review, routing, and first-touch drafting.
            </p>
          </div>

          <nav className="space-y-1">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => selectItem(item)}
                className={`w-full rounded-md px-4 py-2.5 text-left text-sm transition-colors ${itemClass(item)}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 px-8 py-8">
          {tab === 'run' && <RunTab />}
          {tab === 'latest' && <LatestLeadsTab />}
          {tab === 'history' && <HistoryTab />}
          {tab === 'config' && <ConfigTab activeSection={configSection} />}
        </main>
      </div>
    </div>
  )
}
