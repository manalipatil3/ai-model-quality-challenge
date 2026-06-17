import type {
  CustomerRequirements,
  EvaluationReason,
  GoNoGoDecision,
  GoNoGoStatus,
  MetricScores,
  ModelComparisonResult,
  ModelSweep,
  WorkloadEvaluation,
  WorkloadType,
  WorkloadWeights,
} from '../types'
import { WORKLOAD_WEIGHTS } from '../types'
import { referenceRow } from './parseXlsx'

function asNumber(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : 0
}

function capScore(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(1, value)
}

export function computeCostEfficiency(row: { throughputPerBox: number; throughputTps: number }): number {
  if (row.throughputPerBox <= 0) return 0
  return row.throughputTps / row.throughputPerBox
}

export interface LoadDegradation {
  throughputDropPercent: number
  ttftIncreasePercent: number
  ttftMultiplier: number
  severeThroughputDrop: boolean
  severeTtftIncrease: boolean
  severe: boolean
  baselineBatch: number
  peakBatch: number
}

const THROUGHPUT_DROP_SEVERE_PCT = 40
const TTFT_INCREASE_SEVERE_PCT = 200 // 3× baseline

/** Measure sweep-wide degradation from lowest to highest batch size. */
export function measureLoadDegradation(sweep: ModelSweep): LoadDegradation | null {
  const sorted = [...sweep.rows].sort((a, b) => a.batchSize - b.batchSize)
  if (sorted.length < 2) return null

  const baseline = sorted[0]
  const peak = sorted[sorted.length - 1]

  const baselineThroughput = asNumber(baseline.throughputTps)
  const peakThroughput = asNumber(peak.throughputTps)
  const baselineTtft = asNumber(baseline.ttftMs)
  const peakTtft = asNumber(peak.ttftMs)

  const throughputDropPercent =
    baselineThroughput > 0 ? ((baselineThroughput - peakThroughput) / baselineThroughput) * 100 : 0
  const ttftIncreasePercent =
    baselineTtft > 0 ? ((peakTtft - baselineTtft) / baselineTtft) * 100 : 0
  const ttftMultiplier = baselineTtft > 0 ? peakTtft / baselineTtft : 1

  const severeThroughputDrop = throughputDropPercent > THROUGHPUT_DROP_SEVERE_PCT
  const severeTtftIncrease = ttftIncreasePercent > TTFT_INCREASE_SEVERE_PCT

  return {
    throughputDropPercent,
    ttftIncreasePercent,
    ttftMultiplier,
    severeThroughputDrop,
    severeTtftIncrease,
    severe: severeThroughputDrop || severeTtftIncrease,
    baselineBatch: baseline.batchSize,
    peakBatch: peak.batchSize,
  }
}

export function isTrendHealthy(sweep: ModelSweep): boolean {
  const degradation = measureLoadDegradation(sweep)
  if (degradation?.severe) return false

  const sharpDrop = sweep.rows.some((row, index, arr) => {
    if (index === 0) return false
    const prev = arr[index - 1]
    return row.batchSize > prev.batchSize && row.genSpeedPerUser < prev.genSpeedPerUser * 0.7
  })

  const latencyOk = sweep.rows.every((row) => row.maxMs <= row.targetMaxMs)
  return !sharpDrop && latencyOk
}

export function computeStabilityScore(sweep: ModelSweep): number {
  const degradation = measureLoadDegradation(sweep)
  if (!degradation) return 1
  if (degradation.severe) return 0
  if (degradation.throughputDropPercent > 20 || degradation.ttftIncreasePercent > 100) return 0.5
  return 1
}

function applyDegradationPenalties(baseScore: number, degradation: LoadDegradation | null): number {
  if (!degradation?.severe) return baseScore

  let score = baseScore
  if (degradation.severeThroughputDrop) score -= 20
  if (degradation.severeTtftIncrease) score -= 20

  // Severe load degradation caps at CONDITIONAL even when the reference row passes all targets.
  score = Math.min(score, 84)
  score = Math.max(score, 70)
  return score
}

function decisionFromScore(score: number, degradation: LoadDegradation | null): GoNoGoDecision {
  if (degradation?.severe) return 'CONDITIONAL'
  if (score >= 85) return 'GO'
  if (score >= 65) return 'CONDITIONAL'
  return 'NOT GO'
}

export function computeMetricScores(
  sweep: ModelSweep,
  requirements: CustomerRequirements,
): MetricScores {
  const row = referenceRow(sweep)
  const targetThroughput = asNumber(requirements.targetThroughputTps)

  return {
    throughput: capScore(asNumber(row.throughputTps) / targetThroughput),
    ttft: capScore(asNumber(requirements.maxTtftMs) / asNumber(row.ttftMs)),
    rpm: capScore(asNumber(row.rpm) / asNumber(requirements.targetRpm)),
    stability: computeStabilityScore(sweep),
  }
}

export function checkHardFails(
  sweep: ModelSweep,
  requirements: CustomerRequirements,
): string[] {
  const row = referenceRow(sweep)
  const fails: string[] = []

  if (asNumber(row.throughputTps) <= 0) fails.push('Throughput is zero or missing')
  if (asNumber(row.ttftMs) <= 0) fails.push('TTFT is zero or missing')
  if (asNumber(row.inputLength) < asNumber(requirements.requiredInputLength)) {
    fails.push(
      `Primary blocker: input context ${asNumber(row.inputLength).toLocaleString()} < required ${asNumber(requirements.requiredInputLength).toLocaleString()}`,
    )
  }
  if (asNumber(row.outputLength) < asNumber(requirements.requiredOutputLength)) {
    fails.push(
      `Output length ${asNumber(row.outputLength).toLocaleString()} below required ${asNumber(requirements.requiredOutputLength).toLocaleString()}`,
    )
  }

  return fails
}

function statusFromDecision(decision: GoNoGoDecision): GoNoGoStatus {
  if (decision === 'GO') return 'go'
  if (decision === 'CONDITIONAL') return 'conditional'
  return 'no-go'
}

export function computeFinalScore(scores: MetricScores, weights: WorkloadWeights): number {
  const weighted =
    scores.throughput * weights.throughput +
    scores.ttft * weights.ttft +
    scores.rpm * weights.rpm +
    scores.stability * weights.stability

  return Math.round(weighted * 100)
}

export function generateReasons(
  sweep: ModelSweep,
  requirements: CustomerRequirements,
  scores: MetricScores,
): EvaluationReason[] {
  const row = referenceRow(sweep)
  const reasons: EvaluationReason[] = []

  const throughputNum = asNumber(row.throughputTps)
  const targetThroughputNum = asNumber(requirements.targetThroughputTps)
  const throughputPass = throughputNum >= targetThroughputNum
  reasons.push({
    pass: throughputPass,
    text: throughputPass
      ? `Meets throughput target (${throughputNum.toLocaleString()} ≥ ${targetThroughputNum.toLocaleString()} tok/s)`
      : `Throughput below target (${throughputNum.toLocaleString()} < ${targetThroughputNum.toLocaleString()} tok/s)`,
  })

  const ttftNum = asNumber(row.ttftMs)
  const maxTtftNum = asNumber(requirements.maxTtftMs)
  const ttftPass = ttftNum <= maxTtftNum
  reasons.push({
    pass: ttftPass,
    text: ttftPass
      ? `Meets TTFT target (${ttftNum.toFixed(1)} ≤ ${maxTtftNum} ms)`
      : `TTFT above target (${ttftNum.toFixed(1)} > ${maxTtftNum} ms)`,
  })

  const rpmNum = asNumber(row.rpm)
  const targetRpmNum = asNumber(requirements.targetRpm)
  const rpmPass = rpmNum >= targetRpmNum
  reasons.push({
    pass: rpmPass,
    text: rpmPass
      ? `Meets RPM target (${rpmNum.toFixed(0)} ≥ ${targetRpmNum.toLocaleString()} RPM)`
      : `RPM below target (${rpmNum.toFixed(0)} < ${targetRpmNum.toLocaleString()} RPM)`,
  })

  const inputLengthNum = asNumber(row.inputLength)
  const requiredInputNum = asNumber(requirements.requiredInputLength)
  const contextPass = inputLengthNum >= requiredInputNum
  reasons.push({
    pass: contextPass,
    text: contextPass
      ? `Meets input context requirement (${inputLengthNum.toLocaleString()} tok)`
      : `Input context below requirement (${inputLengthNum.toLocaleString()} < ${requiredInputNum.toLocaleString()} tok)`,
  })

  const outputLengthNum = asNumber(row.outputLength)
  const requiredOutputNum = asNumber(requirements.requiredOutputLength)
  const outputPass = outputLengthNum >= requiredOutputNum
  reasons.push({
    pass: outputPass,
    text: outputPass
      ? `Meets output length requirement (${outputLengthNum.toLocaleString()} tok)`
      : `Output length below requirement (${outputLengthNum.toLocaleString()} < ${requiredOutputNum.toLocaleString()} tok)`,
  })

  const stabilityPass = scores.stability >= 1
  const degradation = measureLoadDegradation(sweep)

  if (degradation?.severeThroughputDrop) {
    reasons.push({
      pass: false,
      text: `Throughput drops ${Math.round(degradation.throughputDropPercent)}% from batch ${degradation.baselineBatch} → ${degradation.peakBatch}`,
    })
  }

  if (degradation?.severeTtftIncrease) {
    reasons.push({
      pass: false,
      text: `TTFT increases ${degradation.ttftMultiplier.toFixed(0)}× from batch ${degradation.baselineBatch} → ${degradation.peakBatch}`,
    })
  }

  if (!degradation?.severe) {
    reasons.push({
      pass: stabilityPass,
      text: stabilityPass ? 'Stable performance trend' : 'Performance degrades at higher batch sizes',
    })
  } else {
    reasons.push({
      pass: false,
      text: 'Severe load degradation — capped at CONDITIONAL despite strong reference-row metrics',
    })
  }

  return reasons
}

function buildEvaluationFields(
  sweep: ModelSweep,
  row: ReturnType<typeof referenceRow>,
): Pick<
  WorkloadEvaluation,
  | 'throughputTps'
  | 'genSpeedPerUser'
  | 'ttftMs'
  | 'rpm'
  | 'contextTokens'
  | 'outputTokens'
  | 'cachePct'
  | 'costEfficiency'
  | 'maxLatencyMs'
  | 'targetLatencyMs'
> {
  return {
    throughputTps: asNumber(row.throughputTps),
    genSpeedPerUser: asNumber(row.genSpeedPerUser),
    ttftMs: asNumber(row.ttftMs),
    rpm: asNumber(row.rpm),
    contextTokens: asNumber(row.inputLength),
    outputTokens: asNumber(row.outputLength),
    cachePct: asNumber(row.cachePct),
    costEfficiency: computeCostEfficiency(row),
    maxLatencyMs: asNumber(row.maxMs),
    targetLatencyMs: asNumber(row.targetMaxMs),
  }
}

export function evaluateSweep(
  sweep: ModelSweep,
  requirements: CustomerRequirements,
  workloadType: WorkloadType = requirements.workloadType,
): WorkloadEvaluation {
  const row = referenceRow(sweep)
  const weights = WORKLOAD_WEIGHTS[workloadType]
  const hardFailReasons = checkHardFails(sweep, requirements)
  const degradation = measureLoadDegradation(sweep)
  const metricScores = computeMetricScores(sweep, requirements)
  const reasons = generateReasons(sweep, requirements, metricScores)
  const fields = buildEvaluationFields(sweep, row)

  if (hardFailReasons.length > 0) {
    return {
      modelId: sweep.modelId,
      profile: sweep.profile,
      sweepId: sweep.id,
      status: 'no-go',
      decision: 'NOT GO',
      finalScore: 0,
      reasons,
      hardFailReasons,
      metricScores,
      weights,
      workloadType,
      ...fields,
    }
  }

  const baseScore = computeFinalScore(metricScores, weights)
  const finalScore = applyDegradationPenalties(baseScore, degradation)
  const decision = decisionFromScore(finalScore, degradation)

  return {
    modelId: sweep.modelId,
    profile: sweep.profile,
    sweepId: sweep.id,
    status: statusFromDecision(decision),
    decision,
    finalScore,
    reasons,
    hardFailReasons,
    metricScores,
    weights,
    workloadType,
    ...fields,
  }
}

export function buildCustomerSummary(
  sweep: ModelSweep,
  requirements: CustomerRequirements,
): WorkloadEvaluation {
  return evaluateSweep(sweep, requirements)
}

export function recommendBestModel(
  evaluations: WorkloadEvaluation[],
): WorkloadEvaluation | null {
  if (evaluations.length === 0) return null
  return [...evaluations].sort((a, b) => b.finalScore - a.finalScore)[0]
}

export function compareModels(
  sweeps: ModelSweep[],
  requirements: CustomerRequirements,
): ModelComparisonResult {
  const ranked = [...sweeps]
    .map((s) => evaluateSweep(s, requirements))
    .sort((a, b) => b.finalScore - a.finalScore)

  const bestForChat =
    sweeps.length === 0
      ? null
      : [...sweeps]
          .map((s) => evaluateSweep(s, requirements, 'chat'))
          .sort((a, b) => b.finalScore - a.finalScore)[0]

  const bestForBatch =
    sweeps.length === 0
      ? null
      : [...sweeps]
          .map((s) => evaluateSweep(s, requirements, 'batch'))
          .sort((a, b) => b.finalScore - a.finalScore)[0]

  const bestOverall = ranked[0] ?? null

  return { ranked, bestForChat, bestForBatch, bestOverall }
}

export function formatEvaluationSummary(evaluation: WorkloadEvaluation): string {
  if (evaluation.hardFailReasons.length > 0) {
    return evaluation.hardFailReasons.join('; ')
  }
  return `${evaluation.decision} — score ${evaluation.finalScore}/100`
}
