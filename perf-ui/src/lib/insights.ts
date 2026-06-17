import type { CustomerRequirements, Insight, ModelSweep } from '../types'
import { buildCustomerSummary } from './goNoGo'

export function generateInsights(
  sweeps: ModelSweep[],
  profileFilter?: number,
  requirements?: CustomerRequirements,
): Insight[] {
  const filtered = profileFilter
    ? sweeps.filter((s) => s.profile === profileFilter)
    : sweeps

  if (filtered.length === 0 || !requirements) return []

  const evaluations = filtered.map((s) => buildCustomerSummary(s, requirements))
  const insights: Insight[] = []

  const byScore = [...evaluations].sort((a, b) => b.finalScore - a.finalScore)
  const best = byScore[0]
  const worst = byScore[byScore.length - 1]

  if (best && worst && best.modelId !== worst.modelId) {
    insights.push({
      type: 'best',
      metric: 'final score',
      message: `Model ${best.modelId} leads with score ${best.finalScore} (${best.decision})${profileFilter ? ` on profile ${profileFilter}` : ''}.`,
      modelId: best.modelId,
      profile: best.profile,
      value: best.finalScore,
    })
  }

  const byTtft = [...evaluations].sort((a, b) => a.ttftMs - b.ttftMs)
  if (byTtft[0] && byTtft.length > 1) {
    insights.push({
      type: 'best',
      metric: 'TTFT',
      message: `Model ${byTtft[0].modelId} has the lowest TTFT (${byTtft[0].ttftMs.toFixed(1)} ms).`,
      modelId: byTtft[0].modelId,
      profile: byTtft[0].profile,
      value: byTtft[0].ttftMs,
    })
  }

  const goModels = evaluations.filter((s) => s.status === 'go')
  if (goModels.length > 0) {
    const fastest = [...goModels].sort((a, b) => b.throughputTps - a.throughputTps)[0]
    insights.push({
      type: 'notable',
      metric: 'go recommendation',
      message: `Among GO-rated sweeps, Model ${fastest.modelId} delivers the highest throughput.`,
      modelId: fastest.modelId,
      profile: fastest.profile,
      value: fastest.throughputTps,
    })
  }

  const noGoCount = evaluations.filter((s) => s.status === 'no-go').length
  if (noGoCount > 0) {
    insights.push({
      type: 'notable',
      metric: 'risk',
      message: `${noGoCount} sweep${noGoCount > 1 ? 's' : ''} scored NOT GO against your requirements.`,
      modelId: evaluations.find((s) => s.status === 'no-go')!.modelId,
      value: noGoCount,
    })
  }

  const conditionalCount = evaluations.filter((s) => s.status === 'conditional').length
  if (conditionalCount > 0) {
    insights.push({
      type: 'notable',
      metric: 'conditional',
      message: `${conditionalCount} model${conditionalCount > 1 ? 's' : ''} are CONDITIONAL — review tradeoffs before committing.`,
      modelId: evaluations.find((s) => s.status === 'conditional')!.modelId,
      value: conditionalCount,
    })
  }

  return insights.slice(0, 8)
}
