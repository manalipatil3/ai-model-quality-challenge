import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useModels } from '../context/ModelContext'
import { detectAnomalies, PROFILE_USE_CASES } from '../lib/anomalies'

export function EngineerView() {
  const { sweeps } = useModels()
  const modelIds = useMemo(
    () => Array.from(new Set(sweeps.map((s) => s.modelId))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [sweeps],
  )
  const [selectedModel, setSelectedModel] = useState(modelIds[0] ?? '')
  const [selectedProfile, setSelectedProfile] = useState(1)

  useEffect(() => {
    if (modelIds.length > 0 && !modelIds.includes(selectedModel)) {
      setSelectedModel(modelIds[0])
    }
  }, [modelIds, selectedModel])

  const modelSweeps = useMemo(
    () => sweeps.filter((s) => s.modelId === selectedModel),
    [sweeps, selectedModel],
  )

  const activeSweep = useMemo(
    () => modelSweeps.find((s) => s.profile === selectedProfile) ?? modelSweeps[0],
    [modelSweeps, selectedProfile],
  )

  const anomalies = useMemo(() => detectAnomalies(sweeps), [sweeps])
  const modelAnomalies = anomalies.filter((a) => a.modelId === selectedModel)

  const batchChartData = useMemo(
    () =>
      activeSweep?.rows.map((row) => ({
        batch: row.batchSize,
        throughput: Math.round(row.throughputTps),
        ttft: row.ttftMs,
        genSpeed: Math.round(row.genSpeedPerUser),
        maxMs: row.maxMs,
        targetMs: row.targetMaxMs,
      })) ?? [],
    [activeSweep],
  )

  const profileTrendData = useMemo(() => {
    return modelSweeps
      .sort((a, b) => a.profile - b.profile)
      .map((sweep) => {
        const ref = sweep.rows.find((r) => r.batchSize === 10) ?? sweep.rows[0]
        return {
          profile: `P${sweep.profile}`,
          throughput: Math.round(ref.throughputTps),
          ttft: ref.ttftMs,
          genSpeed: Math.round(ref.genSpeedPerUser),
        }
      })
  }, [modelSweeps])

  if (!activeSweep) {
    return <p className="text-slate-400">Select a model to inspect raw metrics.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
        >
          {modelIds.map((id) => (
            <option key={id} value={id}>
              Model {id}
            </option>
          ))}
        </select>
        <select
          value={activeSweep.profile}
          onChange={(e) => setSelectedProfile(Number(e.target.value))}
          className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
        >
          {modelSweeps.map((s) => (
            <option key={s.id} value={s.profile}>
              Profile {s.profile}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-slate-400">
        {PROFILE_USE_CASES[activeSweep.profile] ?? 'Custom traffic profile'}
      </p>

      {modelAnomalies.length > 0 && (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-4">
          <h3 className="text-sm font-semibold text-amber-300">Anomaly warnings</h3>
          <ul className="mt-2 space-y-1 text-sm text-amber-100/90">
            {modelAnomalies.map((a, i) => (
              <li key={i}>
                [{a.severity.toUpperCase()}] P{a.profile}: {a.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Throughput vs batch size</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={batchChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="batch" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
              <Legend />
              <Line type="monotone" dataKey="throughput" name="tok/s" stroke="#22d3ee" strokeWidth={2} />
              <Line type="monotone" dataKey="genSpeed" name="tok/s/user" stroke="#a78bfa" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">TTFT vs batch size</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={batchChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="batch" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
              <Bar dataKey="ttft" name="TTFT (ms)" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Profile trends (batch=10 reference)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={profileTrendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="profile" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
            <Legend />
            <Line type="monotone" dataKey="throughput" name="tok/s" stroke="#22d3ee" />
            <Line type="monotone" dataKey="ttft" name="TTFT ms" stroke="#f97316" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="min-w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-800 text-slate-400">
            <tr>
              <th className="px-3 py-2">Batch</th>
              <th className="px-3 py-2">In</th>
              <th className="px-3 py-2">Out</th>
              <th className="px-3 py-2">Cache</th>
              <th className="px-3 py-2">Max ms</th>
              <th className="px-3 py-2">Target ms</th>
              <th className="px-3 py-2">tok/s</th>
              <th className="px-3 py-2">tok/s/box</th>
              <th className="px-3 py-2">TTFT</th>
              <th className="px-3 py-2">Gen/user</th>
              <th className="px-3 py-2">RPM</th>
            </tr>
          </thead>
          <tbody>
            {activeSweep.rows.map((row) => (
              <tr key={row.batchSize} className="border-t border-slate-800 even:bg-slate-900/40">
                <td className="px-3 py-2 font-mono">{row.batchSize}</td>
                <td className="px-3 py-2 font-mono">{row.inputLength}</td>
                <td className="px-3 py-2 font-mono">{row.outputLength}</td>
                <td className="px-3 py-2 font-mono">{(row.cachePct * 100).toFixed(0)}%</td>
                <td className={`px-3 py-2 font-mono ${row.maxMs > row.targetMaxMs ? 'text-red-400' : ''}`}>
                  {Math.round(row.maxMs).toLocaleString()}
                </td>
                <td className="px-3 py-2 font-mono">{Math.round(row.targetMaxMs).toLocaleString()}</td>
                <td className="px-3 py-2 font-mono">{Math.round(row.throughputTps).toLocaleString()}</td>
                <td className="px-3 py-2 font-mono">{Math.round(row.throughputPerBox).toLocaleString()}</td>
                <td className="px-3 py-2 font-mono">{row.ttftMs.toFixed(1)}</td>
                <td className="px-3 py-2 font-mono">{Math.round(row.genSpeedPerUser)}</td>
                <td className="px-3 py-2 font-mono">{row.rpm.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
