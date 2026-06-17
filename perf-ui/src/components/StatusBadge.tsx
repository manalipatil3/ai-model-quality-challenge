import type { EvaluationReason, GoNoGoStatus } from '../types'

const styles: Record<GoNoGoStatus, string> = {
  go: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40',
  'no-go': 'bg-red-500/20 text-red-300 ring-red-500/40',
  conditional: 'bg-amber-500/20 text-amber-300 ring-amber-500/40',
}

const labels: Record<GoNoGoStatus, string> = {
  go: 'GO',
  'no-go': 'NOT GO',
  conditional: 'CONDITIONAL',
}

export function StatusBadge({ status, score }: { status: GoNoGoStatus; score?: number }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ${styles[status]}`}>
      {labels[status]}
      {score !== undefined && <span className="font-mono opacity-80">{score}</span>}
    </span>
  )
}

export function ReasonList({ reasons, hardFails }: { reasons: EvaluationReason[]; hardFails?: string[] }) {
  return (
    <ul className="mt-3 space-y-1 text-xs">
      {hardFails?.map((text) => (
        <li key={text} className="flex gap-2 text-red-300">
          <span className="shrink-0">✗</span>
          <span>{text}</span>
        </li>
      ))}
      {reasons.map((r) => (
        <li key={r.text} className={`flex gap-2 ${r.pass ? 'text-emerald-300/90' : 'text-amber-200/90'}`}>
          <span className="shrink-0">{r.pass ? '✓' : '✗'}</span>
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  )
}
