/**
 * Short-lived in-memory cache for HO/MIS dashboard + daily reports.
 * Survives route changes within the SPA; cleared on HO/MIS login.
 * Polling pages still refresh ~every 30s for live BA check-in/out.
 */

import type { BaPerformanceDashboard, FetchBaPerformanceParams } from './baPerformanceApi'
import type { DailyReportBaCard } from './earlyCheckoutApi'

const FRESH_MS = 60_000

type Entry<T> = { data: T; at: number }

let dashboardByKey = new Map<string, Entry<BaPerformanceDashboard>>()
let dailyReports: Entry<DailyReportBaCard[]> | null = null

export function clearHoDataCache() {
  dashboardByKey = new Map()
  dailyReports = null
}

export function dashboardCacheKey(params: FetchBaPerformanceParams): string {
  return [
    params.town ?? '',
    params.store ?? '',
    params.month ?? '',
    params.from ?? '',
    params.to ?? '',
    params.category ?? '',
    params.sku ?? '',
    params.salesPeriod ?? '',
    params.targetMonth ?? '',
  ].join('|')
}

/** Return cached dashboard if present (may be stale — caller should revalidate). */
export function peekDashboardCache(key: string): BaPerformanceDashboard | null {
  return dashboardByKey.get(key)?.data ?? null
}

export function isDashboardCacheFresh(key: string): boolean {
  const e = dashboardByKey.get(key)
  if (!e) return false
  return Date.now() - e.at < FRESH_MS
}

export function setDashboardCache(key: string, data: BaPerformanceDashboard) {
  dashboardByKey.set(key, { data, at: Date.now() })
}

export function peekDailyReportsCache(): DailyReportBaCard[] | null {
  return dailyReports?.data ?? null
}

export function isDailyReportsCacheFresh(): boolean {
  if (!dailyReports) return false
  return Date.now() - dailyReports.at < FRESH_MS
}

export function setDailyReportsCache(data: DailyReportBaCard[]) {
  dailyReports = { data, at: Date.now() }
}
