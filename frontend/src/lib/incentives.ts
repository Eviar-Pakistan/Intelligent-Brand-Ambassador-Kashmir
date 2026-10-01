/**
 * BA / supervisor incentive calculations.
 * BA roster prefers live GET /api/incentives/overview/ when HO is authenticated.
 */

import { ambassadors, baRanking } from '../data/mock'
import { apiRequest, isApiAuthenticated } from './api'
import { getKpiConfig, type KpiConfig } from './kpiConfig'
import { getSupervisors, supervisorOverview, type Supervisor } from './supervisors'

export type PayoutStatus = 'Pending' | 'Approved' | 'Paid'

export type IncentiveBreakdown = {
  baId: string
  name: string
  city: string
  rank: number
  /** Legacy leaderboard conversion % */
  conversion: number
  sessions: number
  /** BA salary */
  base: number
  salary?: number
  targetAchPay?: number
  disciplinePay?: number
  travelPay?: number
  groomingPay?: number
  mobilePay?: number
  achievementPct?: number
  /** Mapped: target ach pay (legacy key) */
  conversionPay: number
  /** Mapped: travel pay (legacy key) */
  sessionPay: number
  incentive: number
  totalPkr: number
  status?: PayoutStatus
  daysWorked?: number
  rating?: number | null
  baTargetSlab90?: number
  baTargetSlab100?: number
  baTargetSlab110?: number
  baTravelPerDay?: number
  baTravelCap?: number
  baDisciplineMinDays?: number
}

/**
 * Monthly BA package from KPI settings.
 * Target Ach uses achievement % slabs (90 → 2400, 100 → 3000, 110+ → 3600, else 0).
 */
export function targetAchIncentive(achievementPct: number, config: KpiConfig = getKpiConfig()): number {
  if (achievementPct >= 110) return config.baTargetSlab110
  if (achievementPct >= 100) return config.baTargetSlab100
  if (achievementPct >= 90) return config.baTargetSlab90
  return 0
}

export function calculateIncentive(
  input: {
    baId: string
    name: string
    city: string
    rank: number
    conversion: number
    sessions: number
    achievementPct?: number
    daysWorked?: number
  },
  config: KpiConfig = getKpiConfig(),
): IncentiveBreakdown {
  const achievementPct = input.achievementPct ?? 0
  const daysWorked = input.daysWorked ?? 0
  const salary = config.baSalary
  const targetAchPay = targetAchIncentive(achievementPct, config)
  const disciplinePay = config.baDiscipline
  const travelPay = config.baTravelCap
  const groomingPay = config.baGrooming
  const mobilePay = config.baMobile
  const incentive = targetAchPay + disciplinePay + travelPay + groomingPay + mobilePay
  return {
    ...input,
    base: salary,
    salary,
    targetAchPay,
    disciplinePay,
    travelPay,
    groomingPay,
    mobilePay,
    achievementPct,
    daysWorked,
    conversionPay: targetAchPay,
    sessionPay: travelPay,
    incentive,
    totalPkr: salary + incentive,
    baTargetSlab90: config.baTargetSlab90,
    baTargetSlab100: config.baTargetSlab100,
    baTargetSlab110: config.baTargetSlab110,
    baTravelPerDay: config.baTravelPerDay,
    baTravelCap: config.baTravelCap,
    baDisciplineMinDays: config.baDisciplineMinDays,
  }
}

export function formatPkr(amount: number) {
  return `Rs. ${amount.toLocaleString('en-PK')}`
}

/** Offline / demo fallback from mock ranking. */
export function buildIncentiveRoster(config: KpiConfig = getKpiConfig()): IncentiveBreakdown[] {
  return baRanking.map((b, i) => {
    const profile = ambassadors.find((a) => a.id === b.id)
    return calculateIncentive(
      {
        baId: b.id,
        name: b.name,
        city: b.city,
        rank: i + 1,
        conversion: b.conversion,
        sessions: profile?.today.interactions ?? Math.round(b.points / 30),
      },
      config,
    )
  })
}

export type IncentivesOverview = {
  config: KpiConfig
  weekLabel?: string | null
  weekStart?: string | null
  weekEnd?: string | null
  results: IncentiveBreakdown[]
  pool: number
}

function mapApiRow(row: Record<string, unknown>): IncentiveBreakdown {
  const statusRaw = String(row.status ?? 'Pending')
  const status: PayoutStatus =
    statusRaw === 'Approved' || statusRaw === 'Paid' ? statusRaw : 'Pending'
  const salary = Number(row.salary ?? row.base ?? 0)
  const targetAchPay = Number(row.targetAchPay ?? row.conversionPay ?? 0)
  const travelPay = Number(row.travelPay ?? row.sessionPay ?? 0)
  return {
    baId: String(row.baId ?? ''),
    name: String(row.name ?? ''),
    city: String(row.city ?? ''),
    rank: Number(row.rank ?? 0),
    conversion: Number(row.conversion ?? 0),
    sessions: Number(row.sessions ?? 0),
    base: salary,
    salary,
    targetAchPay,
    disciplinePay: Number(row.disciplinePay ?? 0),
    travelPay,
    groomingPay: Number(row.groomingPay ?? 0),
    mobilePay: Number(row.mobilePay ?? 0),
    achievementPct: row.achievementPct != null ? Number(row.achievementPct) : undefined,
    conversionPay: targetAchPay,
    sessionPay: travelPay,
    incentive: Number(row.incentive ?? 0),
    totalPkr: Number(row.totalPkr ?? 0),
    status,
    daysWorked: row.daysWorked != null ? Number(row.daysWorked) : undefined,
    rating: row.rating != null ? Number(row.rating) : null,
    baTargetSlab90: row.baTargetSlab90 != null ? Number(row.baTargetSlab90) : undefined,
    baTargetSlab100: row.baTargetSlab100 != null ? Number(row.baTargetSlab100) : undefined,
    baTargetSlab110: row.baTargetSlab110 != null ? Number(row.baTargetSlab110) : undefined,
    baTravelPerDay: row.baTravelPerDay != null ? Number(row.baTravelPerDay) : undefined,
    baTravelCap: row.baTravelCap != null ? Number(row.baTravelCap) : undefined,
    baDisciplineMinDays: row.baDisciplineMinDays != null ? Number(row.baDisciplineMinDays) : undefined,
  }
}

/** Live BA incentive roster from Django (conversion + sessions from leaderboard). */
export async function fetchIncentivesOverview(): Promise<IncentivesOverview | null> {
  if (!isApiAuthenticated()) return null
  const data = await apiRequest<{
    config?: Partial<KpiConfig>
    week_label?: string
    week_start?: string
    week_end?: string
    results?: Record<string, unknown>[]
    pool?: number
  }>('/api/incentives/overview/')
  const results = (data.results ?? []).map(mapApiRow)
  return {
    config: { ...getKpiConfig(), ...(data.config || {}) },
    weekLabel: data.week_label,
    weekStart: data.week_start,
    weekEnd: data.week_end,
    results,
    pool: data.pool ?? results.reduce((s, r) => s + r.totalPkr, 0),
  }
}

export type PayoutActionResult = {
  updated: number
  results: { baId: string; status: PayoutStatus; totalPkr: number }[]
  overview: IncentivesOverview
}

function mapOverviewPayload(data: {
  overview?: {
    config?: Partial<KpiConfig>
    week_label?: string
    week_start?: string
    week_end?: string
    results?: Record<string, unknown>[]
    pool?: number
  }
  updated?: number
  results?: { baId: string; status: string; totalPkr: number }[]
}): PayoutActionResult {
  const ov = data.overview || {}
  const results = (ov.results ?? []).map(mapApiRow)
  return {
    updated: data.updated ?? 0,
    results: (data.results ?? []).map((r) => ({
      baId: String(r.baId),
      status: (r.status === 'Approved' || r.status === 'Paid' ? r.status : 'Pending') as PayoutStatus,
      totalPkr: Number(r.totalPkr ?? 0),
    })),
    overview: {
      config: { ...getKpiConfig(), ...(ov.config || {}) },
      weekLabel: ov.week_label,
      weekStart: ov.week_start,
      weekEnd: ov.week_end,
      results,
      pool: ov.pool ?? results.reduce((s, r) => s + r.totalPkr, 0),
    },
  }
}

/** Persist Approved for one or more BAs (current week). */
export async function approveIncentives(baIds: string[]): Promise<PayoutActionResult> {
  const data = await apiRequest<Parameters<typeof mapOverviewPayload>[0]>('/api/incentives/approve/', {
    method: 'POST',
    body: { baIds: baIds.map((id) => Number(id)).filter((n) => Number.isFinite(n)) },
  })
  return mapOverviewPayload(data)
}

/** Persist Approved for every currently Pending BA this week. */
export async function approveAllPendingIncentives(): Promise<PayoutActionResult> {
  const data = await apiRequest<Parameters<typeof mapOverviewPayload>[0]>('/api/incentives/approve/', {
    method: 'POST',
    body: { allPending: true },
  })
  return mapOverviewPayload(data)
}

/** Persist Paid for Approved BAs. */
export async function markIncentivesPaid(baIds: string[]): Promise<PayoutActionResult> {
  const data = await apiRequest<Parameters<typeof mapOverviewPayload>[0]>('/api/incentives/mark-paid/', {
    method: 'POST',
    body: { baIds: baIds.map((id) => Number(id)).filter((n) => Number.isFinite(n)) },
  })
  return mapOverviewPayload(data)
}

/** BA invite-token payout for one ambassador. */
export async function fetchBaOwnIncentive(token: string): Promise<IncentiveBreakdown | null> {
  const data = await apiRequest<Record<string, unknown>>(`/api/ba/incentives/?token=${encodeURIComponent(token)}`, {
    auth: false,
  })
  return mapApiRow(data)
}

export type SupervisorIncentive = {
  supervisorId: string
  name: string
  city: string
  storeCount: number
  baCount: number
  teamConversion: number
  coverage: number
  base: number
  salary: number
  fuelDa: number
  discipline: number
  mobile: number
  conversionPay: number
  coveragePay: number
  incentive: number
  totalPkr: number
}

/** Supervisor monthly package from KPI settings (fixed components). */
export function calculateSupervisorIncentive(
  supervisor: Supervisor,
  config: KpiConfig = getKpiConfig(),
): SupervisorIncentive {
  const overview = supervisorOverview(supervisor)
  const salary = config.supSalary
  const fuelDa = config.supFuelDa
  const discipline = config.supDiscipline
  const mobile = config.supMobile
  const incentive = fuelDa + discipline + mobile
  return {
    supervisorId: supervisor.id,
    name: supervisor.name,
    city: supervisor.city,
    storeCount: overview.stores.length,
    baCount: new Set(overview.bas.map((b) => b.id)).size,
    teamConversion: overview.teamConversion,
    coverage: overview.coverage,
    base: salary,
    salary,
    fuelDa,
    discipline,
    mobile,
    conversionPay: fuelDa,
    coveragePay: discipline,
    incentive,
    totalPkr: salary + incentive,
  }
}

export function buildSupervisorRoster(config: KpiConfig = getKpiConfig()) {
  return getSupervisors().map((s) => calculateSupervisorIncentive(s, config))
}
