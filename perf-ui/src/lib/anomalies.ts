import type { Anomaly, ModelSweep } from '../types'
import { referenceRow } from './parseXlsx'

export function detectAnomalies(sweeps: ModelSweep[]): Anomaly[] {
  const anomalies: Anomaly[] = []

  for (const sweep of sweeps) {
    for (const row of sweep.rows) {
      if (row.maxMs > row.targetMaxMs) {
        anomalies.push({
          severity: 'critical',
          message: `Batch ${row.batchSize}: max latency ${Math.round(row.maxMs).toLocaleString()} ms exceeds target ${Math.round(row.targetMaxMs).toLocaleString()} ms`,
          sweepId: sweep.id,
          modelId: sweep.modelId,
          profile: sweep.profile,
        })
      }

      if (row.ttftMs > 40) {
        anomalies.push({
          severity: row.ttftMs > 60 ? 'critical' : 'warning',
          message: `Batch ${row.batchSize}: TTFT ${row.ttftMs.toFixed(1)} ms is elevated`,
          sweepId: sweep.id,
          modelId: sweep.modelId,
          profile: sweep.profile,
        })
      }
    }

    const ref = referenceRow(sweep)
    const throughputDrop = sweep.rows.some((row, index, arr) => {
      if (index === 0) return false
      const prev = arr[index - 1]
      return row.batchSize > prev.batchSize && row.genSpeedPerUser < prev.genSpeedPerUser * 0.7
    })

    if (throughputDrop) {
      anomalies.push({
        severity: 'warning',
        message: 'Per-user gen speed drops sharply at higher batch sizes — check queueing assumptions',
        sweepId: sweep.id,
        modelId: sweep.modelId,
        profile: sweep.profile,
      })
    }

    if (ref.cachePct >= 0.8 && ref.throughputTps < 100_000) {
      anomalies.push({
        severity: 'warning',
        message: `High cache ratio (${(ref.cachePct * 100).toFixed(0)}%) but aggregate throughput below 100k tok/s`,
        sweepId: sweep.id,
        modelId: sweep.modelId,
        profile: sweep.profile,
      })
    }
  }

  return anomalies
}

export const PROFILE_USE_CASES: Record<number, string> = {
  1: 'Long-context chat with moderate output (10k in / 333 out, 50% cache)',
  2: 'Long-form generation, cold cache (10k in / 4k out)',
  3: 'Short prompt, medium output (3.2k in / 400 out)',
  4: 'Balanced mid-size workload (1k in / 1k out)',
  5: 'Document Q&A with longer answers (8k in / 1k out)',
  6: 'Ultra long-context retrieval (60k in / 200 out, 90% cache)',
  7: 'Mixed long input + long output (17k in / 3.5k out, 70% cache)',
}
