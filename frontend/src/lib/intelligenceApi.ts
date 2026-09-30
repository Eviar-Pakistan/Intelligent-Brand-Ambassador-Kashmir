/**
 * Head Office Command Center — live intelligence aggregates.
 */

import { apiRequest, isApiAuthenticated } from './api'

export type InsightRow = { name: string; value: number }

export type IntelligenceOverview = {
  kpis: {
    shoppers_engaged: number
    active_stores: number
    engagement_rate: number
    conversion_rate: number
    total_stores: number
    total_footfall: number
    total_bas: number
    consented: number
    with_feedback: number
  }
  engagement_trend: { day: string; date: string; engagement: number; conversion: number }[]
  consumer_insights: {
    preferredTea: InsightRow[]
    familySize: InsightRow[]
    purchaseFrequency: InsightRow[]
    priceSensitivity: InsightRow[]
    healthPreference: InsightRow[]
  }
  insights_by_question: {
    question_id: number
    order: number
    title: string
    rows: InsightRow[]
  }[]
  shopper_intelligence: {
    footfall: string
    engagement_rate: string
    purchase_intent: string
    conversion_rate: string
  }
}

export type StoreMapPin = {
  id: number
  name: string
  city: string
  address: string
  status: string
  lat: number
  lng: number
  level: 'high' | 'medium' | 'low' | string
  shoppers: number
  engagement_rate: number
  conversion_rate: number
  today_footfall: number
}

export type LeaderboardRow = {
  id: number
  name: string
  city: string
  status: string
  store_id: number | null
  store_name: string | null
  overall_score: number
  points: number
  conversion: number
  interactions: number
  shifts_this_week: number
  check_ins_this_week: number
  customer_rating: number
  conversation_rate: number
  rank: number
}

export type LeaderboardResponse = {
  week_start: string
  week_end: string
  week_label: string
  results: LeaderboardRow[]
}

export type ManagerOverview = {
  today: string
  summary: {
    stores: number
    active_bas: number
    gps_online: number
    avg_coverage: number
    today_footfall: number
    shoppers_today: number
    shifts_today: number
  }
  live_bas: {
    shift_id: string | null
    ambassador_id: number | null
    checked_in_at: string | null
    checked_out_at: string | null
    gps: string
    status: string
  }[]
  attendance: { checked_in_at: string | null }[]
}

export type CommandCenterLive = {
  overview: IntelligenceOverview
  pins: StoreMapPin[]
  leaderboard: LeaderboardRow[]
  manager: ManagerOverview | null
}

export async function fetchCommandCenterLive(): Promise<CommandCenterLive | null> {
  if (!isApiAuthenticated()) return null

  const [overview, mapRes, board, manager] = await Promise.all([
    apiRequest<IntelligenceOverview>('/api/intelligence/overview/'),
    apiRequest<{ pins: StoreMapPin[] }>('/api/intelligence/store-map/'),
    apiRequest<LeaderboardResponse>('/api/intelligence/leaderboard/'),
    apiRequest<ManagerOverview>('/api/manager/overview/').catch(() => null),
  ])

  return {
    overview,
    pins: mapRes.pins ?? [],
    leaderboard: board.results ?? [],
    manager,
  }
}

export async function fetchQuestionInsights(storeId?: number | 'all') {
  if (!isApiAuthenticated()) return null
  const qs =
    storeId !== undefined && storeId !== 'all'
      ? `?store=${encodeURIComponent(String(storeId))}`
      : ''
  return apiRequest<QuestionInsightsResponse>(`/api/intelligence/question-insights/${qs}`)
}

export type QuestionInsight = {
  question_id: number
  store_id: number | null
  store_name: string | null
  store_city: string | null
  order: number
  title: string
  options: string[]
  responses: number
  store_count?: number
  aggregated?: boolean
  rows: InsightRow[]
}

export type RecentShopper = {
  id: number
  name: string
  phone: string
  store_id: number | null
  store_name: string | null
  store_city: string | null
  consent: boolean
  answers_count: number
  answers: Record<string, string>
  feedback_rating: number | null
  created_at: string | null
}

export type QuestionInsightsResponse = {
  store_id: number | null
  shoppers: number
  results: QuestionInsight[]
  comparisons: QuestionInsight[]
  recent_shoppers?: RecentShopper[]
}

/** Project lat/lng into a 12–88% box for the stylized map widget. */
export function pinsToMapLayout(pins: StoreMapPin[]) {
  if (!pins.length) return []

  const lats = pins.map((p) => p.lat)
  const lngs = pins.map((p) => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latSpan = Math.max(maxLat - minLat, 0.01)
  const lngSpan = Math.max(maxLng - minLng, 0.01)

  return pins.map((p) => {
    const x = 12 + ((p.lng - minLng) / lngSpan) * 76
    const y = 12 + (1 - (p.lat - minLat) / latSpan) * 76
    return {
      id: p.id,
      x,
      y,
      level: (p.level === 'high' || p.level === 'medium' || p.level === 'low' ? p.level : 'low') as
        | 'high'
        | 'medium'
        | 'low',
      label: `#${p.id} ${p.city || p.name}`,
      conversion: p.conversion_rate,
      name: p.name,
      city: p.city,
    }
  })
}

export function preferredBrandRows(overview: IntelligenceOverview): InsightRow[] {
  const fromQ1 = overview.insights_by_question?.find((q) => q.order === 1)?.rows
  if (fromQ1?.length) return fromQ1
  return overview.consumer_insights?.preferredTea ?? []
}

export function operationsFromManager(manager: ManagerOverview | null) {
  if (!manager) {
    return { activeBas: 0, gpsOnline: 0, attendance: '—', storeCoverage: '—' }
  }
  const { summary, attendance } = manager
  const scheduled = summary.shifts_today || attendance.length
  const present = attendance.filter((a) => a.checked_in_at).length
  const attendancePct = scheduled > 0 ? Math.round((present / scheduled) * 100) : 0
  return {
    activeBas: summary.active_bas,
    gpsOnline: summary.gps_online,
    attendance: `${attendancePct}%`,
    storeCoverage: `${summary.avg_coverage}%`,
  }
}
