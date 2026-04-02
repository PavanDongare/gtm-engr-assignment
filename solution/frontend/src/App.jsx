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
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <aside className="border-b border-stone-200 bg-white px-4 py-5 lg:w-72 lg:flex-shrink-0 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
          <div className="mb-5 lg:mb-8">
            <div className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Allica Bank</div>
            <div className="mt-2 text-2xl font-semibold text-stone-950">GTM Pipeline Console</div>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Internal workflow for lead review, routing, and first-touch drafting.
            </p>
          </div>

          <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => selectItem(item)}
                className={`shrink-0 whitespace-nowrap rounded-md px-4 py-2.5 text-left text-sm transition-colors lg:block lg:w-full lg:whitespace-normal ${itemClass(item)}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {tab === 'run' && <RunTab />}
          {tab === 'latest' && <LatestLeadsTab />}
          {tab === 'history' && <HistoryTab />}
          {tab === 'config' && <ConfigTab activeSection={configSection} />}
        </main>
      </div>
    </div>
  )
}
