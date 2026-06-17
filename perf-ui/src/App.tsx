import { ModelProvider, useModels } from './context/ModelContext'
import { FileUpload } from './components/FileUpload'
import { CustomerView } from './components/CustomerView'
import { EngineerView } from './components/EngineerView'
import { CompareView } from './components/CompareView'
import type { ViewTab } from './types'

const tabs: { id: ViewTab; label: string; description: string }[] = [
  { id: 'customer', label: 'Customer View', description: 'Go/No-Go, key metrics, recommendation' },
  { id: 'engineer', label: 'Engineer View', description: 'Raw sweeps, charts, anomalies' },
  { id: 'compare', label: 'Compare', description: 'Side-by-side model comparison' },
]

function AppShell() {
  const { loading, activeTab, setActiveTab, sweeps } = useModels()

  const modelCount = new Set(sweeps.map((s) => s.modelId)).size

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">Cerebras Challenge</p>
          <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">Performance Explorer</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Upload perf projection sweeps and get customer go/no-go signals, engineer diagnostics, and model comparisons — dynamically, without hard-coded model lists.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <FileUpload />

        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <span className="ml-auto self-center text-xs text-slate-500">
            {modelCount} models · {sweeps.length} sweeps
          </span>
        </div>

        <p className="text-xs text-slate-500">{tabs.find((t) => t.id === activeTab)?.description}</p>

        {loading ? (
          <div className="flex items-center gap-3 text-slate-400">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
            Loading default models A–K…
          </div>
        ) : (
          <>
            {activeTab === 'customer' && <CustomerView />}
            {activeTab === 'engineer' && <EngineerView />}
            {activeTab === 'compare' && <CompareView />}
          </>
        )}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ModelProvider>
      <AppShell />
    </ModelProvider>
  )
}
