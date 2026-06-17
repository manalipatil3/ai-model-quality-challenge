import { useMemo } from 'react'
import { useModels } from '../context/ModelContext'
import { buildCustomerSummary, recommendBestModel } from '../lib/goNoGo'
import { generateInsights } from '../lib/insights'
import { CustomerRequirementsForm } from './CustomerRequirementsForm'
import { ReasonList, StatusBadge } from './StatusBadge'

export function CustomerView() {
  const { sweeps, selectedProfile, setSelectedProfile, uploadResult, requirements, setRequirements } = useModels()

  const profileSweeps = useMemo(
    () => sweeps.filter((s) => s.profile === selectedProfile),
    [sweeps, selectedProfile],
  )

  const evaluations = useMemo(
    () => profileSweeps.map((s) => buildCustomerSummary(s, requirements)),
    [profileSweeps, requirements],
  )

  const recommendation = useMemo(() => recommendBestModel(evaluations), [evaluations])
  const insights = useMemo(
    () => generateInsights(sweeps, selectedProfile, requirements),
    [sweeps, selectedProfile, requirements],
  )

  const profiles = useMemo(
    () => Array.from(new Set(sweeps.map((s) => s.profile))).sort((a, b) => a - b),
    [sweeps],
  )

  const uploadedOnOtherProfile = useMemo(() => {
    if (uploadResult.uploadedIds.length === 0) return []
    return uploadResult.uploadedIds
      .map((id) => sweeps.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s && s.profile !== selectedProfile)
  }, [uploadResult.uploadedIds, sweeps, selectedProfile])

  const uploadedIds = useMemo(() => new Set(uploadResult.uploadedIds), [uploadResult.uploadedIds])

  if (sweeps.length === 0) {
    return <p className="text-slate-400">No model data loaded.</p>
  }

  return (
    <div className="space-y-6">
      <CustomerRequirementsForm requirements={requirements} onChange={setRequirements} />

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-400">Traffic profile:</span>
        {profiles.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setSelectedProfile(p)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              selectedProfile === p
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Profile {p}
            {uploadResult.uploadedIds.some((id) => id.endsWith(`profile-${p}`)) && (
              <span
                className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-400"
                title="Uploaded sweep on this profile"
              />
            )}
          </button>
        ))}
      </div>

      {uploadedOnOtherProfile.length > 0 && (
        <div className="rounded-lg border border-violet-700/40 bg-violet-950/20 px-4 py-3 text-sm text-violet-200">
          Your upload is on{' '}
          {uploadedOnOtherProfile.map((s) => `Profile ${s.profile} (Model ${s.modelId})`).join(', ')}.
          Click that profile tab above to see it.
        </div>
      )}

      {profileSweeps.length === 0 && (
        <p className="text-slate-400">
          No sweeps for profile {selectedProfile}. Select another profile tab or upload a file for this profile.
        </p>
      )}

      {profileSweeps.length > 0 && recommendation && (
        <div className="rounded-xl border border-cyan-700/50 bg-cyan-950/30 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-cyan-400">Recommended model</h3>
          <p className="mt-2 text-lg font-medium text-white">
            Model {recommendation.modelId} — Profile {recommendation.profile}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={recommendation.status} score={recommendation.finalScore} />
            <span className="text-sm text-slate-400">Score based on your workload settings</span>
          </div>
          <ReasonList reasons={recommendation.reasons} hardFails={recommendation.hardFailReasons} />
        </div>
      )}

      {profileSweeps.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {evaluations.map((ev) => (
            <article
              key={ev.sweepId}
              className={`rounded-xl border bg-slate-900/50 p-5 shadow-lg ${
                uploadedIds.has(ev.sweepId)
                  ? 'border-violet-500 ring-1 ring-violet-500/40'
                  : 'border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-white">Model {ev.modelId}</h3>
                  {uploadedIds.has(ev.sweepId) && (
                    <span className="text-xs font-semibold uppercase text-violet-400">New upload</span>
                  )}
                </div>
                <StatusBadge status={ev.status} score={ev.finalScore} />
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full ${
                    ev.finalScore >= 85 ? 'bg-emerald-500' : ev.finalScore >= 65 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(100, ev.finalScore)}%` }}
                />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-slate-500">Throughput</dt>
                  <dd className="font-mono text-slate-100">{Math.round(ev.throughputTps).toLocaleString()} tok/s</dd>
                </div>
                <div>
                  <dt className="text-slate-500">TTFT</dt>
                  <dd className="font-mono text-slate-100">{ev.ttftMs.toFixed(1)} ms</dd>
                </div>
                <div>
                  <dt className="text-slate-500">RPM</dt>
                  <dd className="font-mono text-slate-100">{ev.rpm.toFixed(1)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Gen speed</dt>
                  <dd className="font-mono text-slate-100">{Math.round(ev.genSpeedPerUser)} tok/s/user</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Context</dt>
                  <dd className="font-mono text-slate-100">{ev.contextTokens.toLocaleString()} tok</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Output</dt>
                  <dd className="font-mono text-slate-100">{ev.outputTokens.toLocaleString()} tok</dd>
                </div>
              </dl>

              <ReasonList reasons={ev.reasons} hardFails={ev.hardFailReasons} />
            </article>
          ))}
        </div>
      )}

      {profileSweeps.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Insights</h3>
          <ul className="space-y-2">
            {insights.map((insight, i) => (
              <li key={i} className="rounded-lg bg-slate-800/60 px-4 py-3 text-sm text-slate-200">
                {insight.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
