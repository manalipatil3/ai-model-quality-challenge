import { describe, expect, it } from 'vitest'
import type { CustomerRequirements, ModelSweep, SweepRow } from '../types'
import {
  computeFinalScore,
  computeMetricScores,
  evaluateSweep,
  compareModels,
  measureLoadDegradation,
} from './workloadScoring'

function mockRow(overrides: Partial<SweepRow> = {}): SweepRow {
  return {
    inputLength: 10_000,
    outputLength: 333,
    cachePct: 0.5,
    batchSize: 10,
    maxMs: 1000,
    targetMaxMs: 2000,
    promptOnlyTps: 100_000,
    genOnlyTps: 50_000,
    throughputTps: 200_000,
    throughputPerBox: 30_000,
    uncachedTps: 80_000,
    uncachedTpsPerBox: 12_000,
    cachedTps: 70_000,
    cachedTpsPerBox: 10_000,
    ttftMs: 20,
    realPromptSpeed: 500_000,
    promptSpeedQueued: 400_000,
    genSpeedPerUser: 1200,
    rpm: 3000,
    ...overrides,
  }
}

function mockSweep(rows: SweepRow[] = [mockRow()]): ModelSweep {
  return {
    id: 'T-profile-1',
    modelId: 'T',
    profile: 1,
    sourceFile: 'Model T profile 1.xlsx',
    rows,
  }
}

const reqs: CustomerRequirements = {
  targetThroughputTps: 150_000,
  maxTtftMs: 50,
  targetRpm: 2500,
  requiredInputLength: 10_000,
  requiredOutputLength: 333,
  workloadType: 'balanced',
}

describe('workload scoring — hard fails', () => {
  it('NOT GO when throughput <= 0', () => {
    const ev = evaluateSweep(mockSweep([mockRow({ throughputTps: 0 })]), reqs)
    expect(ev.decision).toBe('NOT GO')
    expect(ev.finalScore).toBe(0)
    expect(ev.hardFailReasons.some((r) => r.includes('Throughput'))).toBe(true)
  })

  it('NOT GO when TTFT <= 0', () => {
    const ev = evaluateSweep(mockSweep([mockRow({ ttftMs: 0 })]), reqs)
    expect(ev.decision).toBe('NOT GO')
    expect(ev.hardFailReasons.some((r) => r.includes('TTFT'))).toBe(true)
  })

  it('NOT GO when input length below required', () => {
    const ev = evaluateSweep(mockSweep([mockRow({ inputLength: 5000 })]), reqs)
    expect(ev.decision).toBe('NOT GO')
    expect(ev.hardFailReasons.some((r) => r.includes('input context'))).toBe(true)
  })

  it('NOT GO when output length below required', () => {
    const ev = evaluateSweep(mockSweep([mockRow({ outputLength: 100 })]), reqs)
    expect(ev.decision).toBe('NOT GO')
    expect(ev.hardFailReasons.some((r) => r.includes('Output length'))).toBe(true)
  })
})

describe('workload scoring — metric scores', () => {
  it('caps throughput score at 1', () => {
    const scores = computeMetricScores(mockSweep([mockRow({ throughputTps: 500_000 })]), reqs)
    expect(scores.throughput).toBe(1)
  })

  it('computes TTFT score as target / actual capped at 1', () => {
    const scores = computeMetricScores(mockSweep([mockRow({ ttftMs: 25 })]), reqs)
    expect(scores.ttft).toBe(1)
  })

  it('computes weighted final score 0-100', () => {
    const scores = { throughput: 1, ttft: 1, rpm: 1, stability: 1 }
    expect(computeFinalScore(scores, { throughput: 0.35, ttft: 0.3, rpm: 0.25, stability: 0.1 })).toBe(100)
  })
})

describe('workload scoring — decisions', () => {
  it('GO when score >= 85', () => {
    const ev = evaluateSweep(mockSweep(), reqs)
    expect(ev.finalScore).toBeGreaterThanOrEqual(85)
    expect(ev.decision).toBe('GO')
    expect(ev.status).toBe('go')
  })

  it('CONDITIONAL for borderline metrics', () => {
    const borderline = mockSweep([
      mockRow({
        throughputTps: 100_000,
        ttftMs: 49,
        rpm: 1800,
      }),
    ])
    // stability 0.5 if batch trend unhealthy — use single row (healthy) so manually expect ~76
    const ev = evaluateSweep(borderline, reqs)
    expect(ev.decision).toBe('CONDITIONAL')
    expect(ev.finalScore).toBeGreaterThanOrEqual(65)
    expect(ev.finalScore).toBeLessThan(85)
  })

  it('NOT GO when score < 65', () => {
    const weak = mockSweep([
      mockRow({
        throughputTps: 50_000,
        ttftMs: 80,
        rpm: 800,
      }),
    ])
    const ev = evaluateSweep(weak, reqs)
    expect(ev.finalScore).toBeLessThan(65)
    expect(ev.decision).toBe('NOT GO')
  })

  it('generates pass/fail reasons', () => {
    const ev = evaluateSweep(mockSweep(), reqs)
    expect(ev.reasons.some((r) => r.pass && r.text.toLowerCase().includes('throughput'))).toBe(true)
    expect(ev.reasons.some((r) => r.pass && r.text.toLowerCase().includes('ttft'))).toBe(true)
  })

  it('marks throughput pass when displayed value exceeds target (user card scenario)', () => {
    const ev = evaluateSweep(
      mockSweep([
        mockRow({
          throughputTps: 199_500,
          ttftMs: 18,
          rpm: 1260,
          inputLength: 4096,
          outputLength: 333,
        }),
      ]),
      {
        targetThroughputTps: 30_000,
        maxTtftMs: 50,
        targetRpm: 2000,
        requiredInputLength: 5000,
        requiredOutputLength: 333,
        workloadType: 'balanced',
      },
    )

    const throughputReason = ev.reasons.find((r) => r.text.toLowerCase().includes('throughput target'))
    expect(throughputReason?.pass).toBe(true)
    expect(throughputReason?.text).toContain('Meets throughput target')
    expect(ev.throughputTps).toBe(199_500)
    expect(ev.decision).toBe('NOT GO')
    expect(ev.hardFailReasons[0]).toContain('Primary blocker')
    expect(ev.hardFailReasons[0]).toContain('4,096')
    expect(ev.reasons.some((r) => !r.pass && r.text.toLowerCase().includes('rpm below'))).toBe(true)
    expect(ev.reasons.some((r) => !r.pass && r.text.toLowerCase().includes('input context below'))).toBe(true)
  })
})

describe('workload scoring — compare models', () => {
  it('ranks models by final score', () => {
    const fast = mockSweep([mockRow({ throughputTps: 300_000, ttftMs: 10 })])
    fast.id = 'A-profile-1'
    fast.modelId = 'A'
    const slow = mockSweep([mockRow({ throughputTps: 80_000, ttftMs: 60 })])
    slow.id = 'B-profile-1'
    slow.modelId = 'B'

    const result = compareModels([fast, slow], reqs)
    expect(result.ranked[0].modelId).toBe('A')
    expect(result.bestOverall?.modelId).toBe('A')
    expect(result.bestForChat).toBeTruthy()
    expect(result.bestForBatch).toBeTruthy()
  })
})

describe('workload scoring — workload weights', () => {
  it('chat workload weights TTFT highest', () => {
    const base = { throughputTps: 160_000, rpm: 2600, inputLength: 10_000, outputLength: 333 }
    const lowTtft = mockSweep([mockRow({ ...base, ttftMs: 5 })])
    lowTtft.modelId = 'FAST'
    const highTtft = mockSweep([mockRow({ ...base, ttftMs: 55 })])
    highTtft.modelId = 'SLOW'

    const chatLow = evaluateSweep(lowTtft, reqs, 'chat')
    const chatHigh = evaluateSweep(highTtft, reqs, 'chat')
    expect(chatLow.finalScore).toBeGreaterThan(chatHigh.finalScore)
  })
})

describe('workload scoring — load degradation', () => {
  it('detects severe throughput drop and TTFT increase across batch sizes', () => {
    const sweep = mockSweep([
      mockRow({ batchSize: 10, throughputTps: 300_000, ttftMs: 5, rpm: 3000 }),
      mockRow({ batchSize: 20, throughputTps: 250_000, ttftMs: 10, rpm: 2800 }),
      mockRow({ batchSize: 30, throughputTps: 180_000, ttftMs: 20, rpm: 2600 }),
      mockRow({ batchSize: 40, throughputTps: 120_000, ttftMs: 50, rpm: 2400 }),
    ])
    sweep.modelId = 'Z'

    const degradation = measureLoadDegradation(sweep)
    expect(degradation?.throughputDropPercent).toBeCloseTo(60, 0)
    expect(degradation?.ttftMultiplier).toBeCloseTo(10, 0)
    expect(degradation?.severe).toBe(true)
  })

  it('caps Model Z at CONDITIONAL despite strong batch-10 metrics', () => {
    const sweep = mockSweep([
      mockRow({ batchSize: 10, throughputTps: 300_000, ttftMs: 5, rpm: 3000 }),
      mockRow({ batchSize: 20, throughputTps: 250_000, ttftMs: 10, rpm: 2800 }),
      mockRow({ batchSize: 30, throughputTps: 180_000, ttftMs: 20, rpm: 2600 }),
      mockRow({ batchSize: 40, throughputTps: 120_000, ttftMs: 50, rpm: 2400 }),
    ])
    sweep.modelId = 'Z'

    const ev = evaluateSweep(sweep, reqs)
    expect(ev.decision).toBe('CONDITIONAL')
    expect(ev.status).toBe('conditional')
    expect(ev.finalScore).toBeGreaterThanOrEqual(70)
    expect(ev.finalScore).toBeLessThanOrEqual(84)
    expect(ev.reasons.some((r) => r.pass && r.text.includes('Meets throughput target'))).toBe(true)
    expect(ev.reasons.some((r) => !r.pass && r.text.includes('Throughput drops'))).toBe(true)
    expect(ev.reasons.some((r) => !r.pass && r.text.includes('TTFT increases'))).toBe(true)
  })

  it('still allows GO when degradation is mild', () => {
    const sweep = mockSweep([
      mockRow({ batchSize: 10, throughputTps: 200_000, ttftMs: 10, rpm: 3000 }),
      mockRow({ batchSize: 20, throughputTps: 180_000, ttftMs: 12, rpm: 2900 }),
    ])
    const ev = evaluateSweep(sweep, reqs)
    expect(ev.decision).toBe('GO')
  })
})
