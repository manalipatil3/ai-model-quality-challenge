export type WorkloadType = 'chat' | 'batch' | 'balanced'

export type GoNoGoStatus = 'go' | 'conditional' | 'no-go'

export type GoNoGoDecision = 'GO' | 'CONDITIONAL' | 'NOT GO'

export interface CustomerRequirements {
  targetThroughputTps: number
  maxTtftMs: number
  targetRpm: number
  requiredInputLength: number
  requiredOutputLength: number
  workloadType: WorkloadType
}

export interface MetricScores {
  throughput: number
  ttft: number
  rpm: number
  stability: number
}

export interface EvaluationReason {
  pass: boolean
  text: string
}

export interface WorkloadWeights {
  throughput: number
  ttft: number
  rpm: number
  stability: number
}

export interface WorkloadEvaluation {
  modelId: string
  profile: number
  sweepId: string
  status: GoNoGoStatus
  decision: GoNoGoDecision
  finalScore: number
  reasons: EvaluationReason[]
  hardFailReasons: string[]
  metricScores: MetricScores
  weights: WorkloadWeights
  workloadType: WorkloadType
  throughputTps: number
  genSpeedPerUser: number
  ttftMs: number
  rpm: number
  contextTokens: number
  outputTokens: number
  cachePct: number
  costEfficiency: number
  maxLatencyMs: number
  targetLatencyMs: number
}

export interface ModelComparisonResult {
  ranked: WorkloadEvaluation[]
  bestForChat: WorkloadEvaluation | null
  bestForBatch: WorkloadEvaluation | null
  bestOverall: WorkloadEvaluation | null
}

/** @deprecated Use WorkloadEvaluation — kept for gradual migration */
export type CustomerSummary = WorkloadEvaluation

export interface SweepRow {
  inputLength: number
  outputLength: number
  cachePct: number
  batchSize: number
  maxMs: number
  targetMaxMs: number
  promptOnlyTps: number
  genOnlyTps: number
  throughputTps: number
  throughputPerBox: number
  uncachedTps: number
  uncachedTpsPerBox: number
  cachedTps: number
  cachedTpsPerBox: number
  ttftMs: number
  realPromptSpeed: number
  promptSpeedQueued: number
  genSpeedPerUser: number
  rpm: number
}

export interface ModelSweep {
  id: string
  modelId: string
  profile: number
  sourceFile: string
  rows: SweepRow[]
}

export interface Anomaly {
  severity: 'warning' | 'critical'
  message: string
  sweepId: string
  modelId: string
  profile: number
}

export interface Insight {
  type: 'best' | 'worst' | 'notable'
  metric: string
  message: string
  modelId: string
  profile?: number
  value: number
}

export type ViewTab = 'customer' | 'engineer' | 'compare'

export const DEFAULT_CUSTOMER_REQUIREMENTS: CustomerRequirements = {
  targetThroughputTps: 150_000,
  maxTtftMs: 50,
  targetRpm: 2_500,
  requiredInputLength: 10_000,
  requiredOutputLength: 333,
  workloadType: 'balanced',
}

export const WORKLOAD_WEIGHTS: Record<WorkloadType, WorkloadWeights> = {
  chat: { ttft: 0.45, throughput: 0.25, rpm: 0.2, stability: 0.1 },
  batch: { throughput: 0.5, rpm: 0.25, ttft: 0.15, stability: 0.1 },
  balanced: { throughput: 0.35, ttft: 0.3, rpm: 0.25, stability: 0.1 },
}

export const WORKLOAD_LABELS: Record<WorkloadType, string> = {
  chat: 'Chat / Realtime',
  batch: 'Batch Processing',
  balanced: 'Balanced',
}
