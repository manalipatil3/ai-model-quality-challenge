import type { CustomerRequirements, WorkloadType } from '../types'
import { WORKLOAD_LABELS } from '../types'

interface CustomerRequirementsFormProps {
  requirements: CustomerRequirements
  onChange: (requirements: CustomerRequirements) => void
}

const FIELDS: {
  key: keyof CustomerRequirements
  label: string
  step?: number
  suffix?: string
}[] = [
  { key: 'targetThroughputTps', label: 'Target Throughput', step: 1000, suffix: 'tok/s' },
  { key: 'maxTtftMs', label: 'Max TTFT', step: 1, suffix: 'ms' },
  { key: 'targetRpm', label: 'Target RPM', step: 100, suffix: 'RPM' },
  { key: 'requiredInputLength', label: 'Required Input Length', step: 100, suffix: 'tok' },
  { key: 'requiredOutputLength', label: 'Required Output Length', step: 1, suffix: 'tok' },
]

export function CustomerRequirementsForm({ requirements, onChange }: CustomerRequirementsFormProps) {
  const update = (patch: Partial<CustomerRequirements>) => {
    onChange({ ...requirements, ...patch })
  }

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-cyan-400">Customer requirements</h3>
      <p className="mt-1 text-xs text-slate-500">
        Set workload targets — Go/No-Go scores update live for every model on the selected profile.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map(({ key, label, step, suffix }) => (
          <label key={key} className="block text-sm">
            <span className="text-slate-400">{label}</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={step}
                value={requirements[key] as number}
                onChange={(e) => update({ [key]: Number(e.target.value) || 0 })}
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
              />
              {suffix && <span className="shrink-0 text-xs text-slate-500">{suffix}</span>}
            </div>
          </label>
        ))}

        <fieldset className="sm:col-span-2 lg:col-span-3">
          <legend className="text-sm text-slate-400">Workload type</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(Object.keys(WORKLOAD_LABELS) as WorkloadType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => update({ workloadType: type })}
                className={`rounded-lg px-4 py-2 text-sm ${
                  requirements.workloadType === type
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {WORKLOAD_LABELS[type]}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  )
}
