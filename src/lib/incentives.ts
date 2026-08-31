import { ambassadors, baRanking } from '../data/mock'

export type IncentiveBreakdown = {
  baId: string
  name: string
  city: string
  rank: number
  points: number
  conversion: number
  interactions: number
  base: number
  conversionPay: number
  pointsPay: number
  sessionPay: number
  rankBonus: number
  totalPkr: number
}

/** Performance → PKR incentive rules (mock showcase rates). */
export function calculateIncentive(input: {
  baId: string
  name: string
  city: string
  rank: number
  points: number
  conversion: number
  interactions: number
}): IncentiveBreakdown {
  const base = 1_000
  const conversionPay = Math.round(input.conversion * 80)
  const pointsPay = Math.round(input.points * 1.5)
  const sessionPay = input.interactions * 25
  const rankBonus =
    input.rank === 1 ? 3_000 : input.rank === 2 ? 2_000 : input.rank === 3 ? 1_000 : 0

  return {
    ...input,
    base,
    conversionPay,
    pointsPay,
    sessionPay,
    rankBonus,
    totalPkr: base + conversionPay + pointsPay + sessionPay + rankBonus,
  }
}

export function formatPkr(amount: number) {
  return `Rs. ${amount.toLocaleString('en-PK')}`
}

export function buildIncentiveRoster(): IncentiveBreakdown[] {
  return baRanking.map((b, i) => {
    const profile = ambassadors.find((a) => a.id === b.id)
    return calculateIncentive({
      baId: b.id,
      name: b.name,
      city: b.city,
      rank: i + 1,
      points: b.points,
      conversion: b.conversion,
      interactions: profile?.today.interactions ?? Math.round(b.points / 30),
    })
  })
}

export const incentiveRules = [
  { label: 'Base active pay', detail: 'Rs. 1,000 flat for scheduled week' },
  { label: 'Conversion bonus', detail: 'Conversion % × Rs. 80' },
  { label: 'Points bonus', detail: 'Leaderboard points × Rs. 1.5' },
  { label: 'Session bonus', detail: 'Interactions × Rs. 25' },
  { label: 'Rank bonus', detail: '1st Rs. 3,000 · 2nd Rs. 2,000 · 3rd Rs. 1,000' },
]
