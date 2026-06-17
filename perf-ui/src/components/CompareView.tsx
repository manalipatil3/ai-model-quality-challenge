import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useModels } from '../context/ModelContext'
import { compareModels } from '../lib/goNoGo'
import { formatModelLabel } from '../lib/uploadErrors'
import type { ModelSweep } from '../types'
import { ReasonList, StatusBadge } from './StatusBadge'

type CompareMode = 'models' | 'profiles'

function formatSweepLabel(sweep: ModelSweep, mode: CompareMode): string {
  if (mode === 'profiles') {
    return `Profile ${sweep.profile}`
  }
  return formatModelLabel(sweep.modelId)
}

function formatSweepChartName(sweep: ModelSweep): string {
  return `${formatModelLabel(sweep.modelId)} · P${sweep.profile}`
}

export function CompareView() {
  const { sweeps, compareIds, toggleCompare, setCompareIds, requirements } = useModels()
  const [mode, setMode] = useState<CompareMode>('models')
  const [profile, setProfile] = useState(1)
  const [selectedModel, setSelectedModel] = useState('')

  const profiles = useMemo(
    () => Array.from(new Set(sweeps.map((s) => s.profile))).sort((a, b) => a - b),
    [sweeps],
  )

  const modelIds = useMemo(
    () => Array.from(new Set(sweeps.map((s) => s.modelId))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [sweeps],
  )

  useEffect(() => {
    if (modelIds.length > 0 && !modelIds.includes(selectedModel)) {
      setSelectedModel(modelIds[0])
    }
  }, [modelIds, selectedModel])

  const selectableSweeps = useMemo(() => {
    if (mode === 'profiles') {
      return sweeps.filter((s) => s.modelId === selectedModel)
    }
    return sweeps.filter((s) => s.profile === profile)
  }, [mode, profile, selectedModel, sweeps])

  const compared = useMemo(
    () => selectableSweeps.filter((s) => compareIds.includes(s.id)),
    [selectableSweeps, compareIds],
  )

  const comparison = useMemo(
    () => compareModels(compared, requirements),
    [compared, requirements],
  )

  const chartData = useMemo(
    () =>
      comparison.ranked.map((ev) => ({
        name: formatSweepChartName(
          compared.find((s) => s.id === ev.sweepId) ?? {
            modelId: ev.modelId,
            profile: ev.profile,
          } as ModelSweep,
        ),
        score: ev.finalScore,
        ttft: ev.ttftMs,
        throughput: Math.round(ev.throughputTps / 1000),
      })),
    [comparison.ranked, compared],
  )

  const selectAll = () => setCompareIds(selectableSweeps.map((s) => s.id))

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
        <p className="text-sm font-medium text-slate-200">Comparison mode</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('models')}
            className={`rounded-lg px-4 py-2 text-sm ${
              mode === 'models'
                ? 'bg-violet-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Different models · one profile
          </button>
          <button
            type="button"
            onClick={() => setMode('profiles')}
            className={`rounded-lg px-4 py-2 text-sm ${
              mode === 'profiles'
                ? 'bg-violet-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Same model · different profiles
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {mode === 'models'
            ? 'Pick a traffic profile, then select two or more models to rank on that workload.'
            : 'Pick a model, then select two or more profiles to see how it behaves across workloads.'}
        </p>
      </div>

      {mode === 'models' ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-400">Traffic profile:</span>
          {profiles.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProfile(p)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                profile === p ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Profile {p}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-400">
            Model:
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-1.5 text-sm text-white"
            >
              {modelIds.map((id) => (
                <option key={id} value={id}>
                  {formatModelLabel(id)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={selectAll}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          {mode === 'profiles' ? 'Select all profiles' : 'Select all on profile'}
        </button>
        <button
          type="button"
          onClick={() => setCompareIds([])}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          Clear selection
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {selectableSweeps.map((sweep) => {
          const selected = compareIds.includes(sweep.id)
          return (
            <button
              key={sweep.id}
              type="button"
              onClick={() => toggleCompare(sweep.id)}
              className={`rounded-full px-3 py-1 text-sm ${
                selected
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-800 text-slate-400 ring-1 ring-slate-700 hover:text-white'
              }`}
            >
              {formatSweepLabel(sweep, mode)}
            </button>
          )
        })}
      </div>

      {selectableSweeps.length === 0 && (
        <p className="text-slate-400">
          {mode === 'profiles'
            ? `No sweeps found for ${formatModelLabel(selectedModel)}. Upload more profiles or pick another model.`
            : `No sweeps on profile ${profile}.`}
        </p>
      )}

      {compared.length < 2 ? (
        <p className="text-slate-400">
          {mode === 'profiles'
            ? 'Select at least two profiles above to compare the same model across workloads.'
            : 'Select at least two models above to compare side by side.'}
        </p>
      ) : (
        <>
          {(comparison.bestForChat || comparison.bestForBatch || comparison.bestOverall) && (
            <div className="grid gap-4 md:grid-cols-3">
              {comparison.bestOverall && (
                <div className="rounded-xl border border-cyan-700/40 bg-cyan-950/20 p-4">
                  <h4 className="text-xs font-semibold uppercase text-cyan-400">Best overall</h4>
                  <p className="mt-1 text-lg font-medium text-white">
                    {formatSweepChartName(
                      compared.find((s) => s.id === comparison.bestOverall?.sweepId) ?? {
                        modelId: comparison.bestOverall.modelId,
                        profile: comparison.bestOverall.profile,
                      } as ModelSweep,
                    )}
                  </p>
                  <StatusBadge status={comparison.bestOverall.status} score={comparison.bestOverall.finalScore} />
                </div>
              )}
              {comparison.bestForChat && (
                <div className="rounded-xl border border-violet-700/40 bg-violet-950/20 p-4">
                  <h4 className="text-xs font-semibold uppercase text-violet-400">Best for chat</h4>
                  <p className="mt-1 text-lg font-medium text-white">
                    {formatSweepChartName(
                      compared.find((s) => s.id === comparison.bestForChat?.sweepId) ?? {
                        modelId: comparison.bestForChat.modelId,
                        profile: comparison.bestForChat.profile,
                      } as ModelSweep,
                    )}
                  </p>
                  <StatusBadge status={comparison.bestForChat.status} score={comparison.bestForChat.finalScore} />
                </div>
              )}
              {comparison.bestForBatch && (
                <div className="rounded-xl border border-orange-700/40 bg-orange-950/20 p-4">
                  <h4 className="text-xs font-semibold uppercase text-orange-400">Best for batch</h4>
                  <p className="mt-1 text-lg font-medium text-white">
                    {formatSweepChartName(
                      compared.find((s) => s.id === comparison.bestForBatch?.sweepId) ?? {
                        modelId: comparison.bestForBatch.modelId,
                        profile: comparison.bestForBatch.profile,
                      } as ModelSweep,
                    )}
                  </p>
                  <StatusBadge status={comparison.bestForBatch.status} score={comparison.bestForBatch.finalScore} />
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-300">Ranked by final score</h3>
            <ol className="space-y-2">
              {comparison.ranked.map((ev, index) => (
                <li
                  key={ev.sweepId}
                  className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-800/50 px-4 py-3 text-sm"
                >
                  <span className="font-mono text-slate-500">{index + 1}.</span>
                  <span className="font-medium text-white">
                    {formatSweepChartName(
                      compared.find((s) => s.id === ev.sweepId) ?? {
                        modelId: ev.modelId,
                        profile: ev.profile,
                      } as ModelSweep,
                    )}
                  </span>
                  <StatusBadge status={ev.status} score={ev.finalScore} />
                  <span className="ml-auto font-mono text-xs text-slate-400">
                    {Math.round(ev.throughputTps).toLocaleString()} tok/s · {ev.ttftMs.toFixed(1)} ms TTFT
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-800 text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left">Rank</th>
                  <th className="px-4 py-3 text-left">{mode === 'profiles' ? 'Profile' : 'Model'}</th>
                  <th className="px-4 py-3 text-left">Decision</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3 text-right">tok/s</th>
                  <th className="px-4 py-3 text-right">TTFT</th>
                  <th className="px-4 py-3 text-right">RPM</th>
                  <th className="px-4 py-3 text-left">Reasons</th>
                </tr>
              </thead>
              <tbody>
                {comparison.ranked.map((ev, index) => (
                  <tr key={ev.sweepId} className="border-t border-slate-800 text-slate-200">
                    <td className="px-4 py-3 font-mono text-slate-500">{index + 1}</td>
                    <td className="px-4 py-3 font-medium">
                      {formatSweepChartName(
                        compared.find((s) => s.id === ev.sweepId) ?? {
                          modelId: ev.modelId,
                          profile: ev.profile,
                        } as ModelSweep,
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ev.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{ev.finalScore}</td>
                    <td className="px-4 py-3 text-right font-mono">{Math.round(ev.throughputTps).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono">{ev.ttftMs.toFixed(1)} ms</td>
                    <td className="px-4 py-3 text-right font-mono">{ev.rpm.toFixed(1)}</td>
                    <td className="px-4 py-3">
                      <ReasonList reasons={ev.reasons} hardFails={ev.hardFailReasons} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-300">Final score comparison</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
                <Legend />
                <Bar dataKey="score" name="Final score" fill="#22d3ee" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
