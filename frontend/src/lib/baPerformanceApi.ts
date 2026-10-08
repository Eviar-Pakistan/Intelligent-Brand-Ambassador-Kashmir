/**
 * Head Office Dashboard — live BA performance aggregates.
 */

import { apiRequest, isApiAuthenticated } from './api'

export type BaPerformanceFiltersPayload = {
  towns: string[]
  storesByTown: Record<string, string[]>
  months: string[]
  monthLabels: Record<string, string>
  categories: string[]
  brands: string[]
  skus: string[]
}

export type BaPerformanceKpis = {
  customersIntercepted: number
  productiveCalls: number
  productivePct: number
  targetLtrKg: number
  salesLtrKg: number
  achievementPct: number
}

export type BaStatusCity = {
  city: string
  stores: number
  active: number
  break: number
  offline: number
  total: number
}

export type ActiveBaRow = {
  id: number
  name: string
  store: string
  city: string
}

export type BaStatusPayload = {
  days: number
  total: number
  active: number
  break: number
  offline: number
  cities: BaStatusCity[]
  /** Live checked-in BA's (same set as `active` count). */
  activeBas?: ActiveBaRow[]
}

export type AttendanceRowLive = {
  ba: string
  store: string
  city: string
  days: number
  checkIn: string
  checkOut: string
  hours: number
  status: 'Active' | 'Checked Out' | null
}

export type WorkingHoursLive = {
  avgHours: number | null
  points: { label: string; hours: number; count: number }[]
}

export type TargetVsAchievementRow = {
  ambassadorId: string
  ambassador: string
  store: string
  city: string
  target: number
  sales: number
  achievement: number | null
}

export type TargetVsAchievementPayload = {
  month: string
  monthLabel: string
  rows: TargetVsAchievementRow[]
}

export type BaPerformanceDashboard = {
  filters: BaPerformanceFiltersPayload
  range: { from: string; to: string; days: number }
  kpis: BaPerformanceKpis
  categorySales: { name: string; value: number }[]
  townTargetVsSales: { town: string; target: number; sales: number }
  topStores: { store: string; sales: number }[]
  topSkus: { sku: string; sales: number }[]
  periodSales: { label: string; sales: number; target: number }[]
  baStatus: BaStatusPayload
  attendance: AttendanceRowLive[]
  workingHours: WorkingHoursLive
  targetVsAchievement?: TargetVsAchievementPayload
}

export type FetchBaPerformanceParams = {
  town?: string | null
  store?: string | null
  month?: string | null
  from?: string | null
  to?: string | null
  category?: string | null
  sku?: string | null
  salesPeriod?: 'wow' | 'mom' | 'ytd'
  targetMonth?: string | null
}

export async function fetchBaPerformanceDashboard(
  params: FetchBaPerformanceParams = {},
): Promise<BaPerformanceDashboard | null> {
  if (!isApiAuthenticated()) return null
  const qs = new URLSearchParams()
  if (params.town) qs.set('town', params.town)
  if (params.store) qs.set('store', params.store)
  if (params.month) qs.set('month', params.month)
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  if (params.category) qs.set('category', params.category)
  if (params.sku) qs.set('sku', params.sku)
  if (params.salesPeriod) qs.set('sales_period', params.salesPeriod)
  if (params.targetMonth) qs.set('target_month', params.targetMonth)
  const q = qs.toString()
  const path = q
    ? `/api/intelligence/ba-performance/?${q}`
    : '/api/intelligence/ba-performance/'
  return apiRequest<BaPerformanceDashboard>(path)
}

export type BaPerformanceDownloadMeta = {
  dateLabel: string
  town?: string | null
  store?: string | null
  category?: string | null
  sku?: string | null
  targetMonth?: string | null
}

/** Excel export of the currently filtered dashboard payload (kg sales). */
export async function downloadBaPerformanceExcel(
  dash: BaPerformanceDashboard,
  meta: BaPerformanceDownloadMeta,
) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const from = dash.range?.from || 'start'
  const to = dash.range?.to || 'end'

  const summary = [
    { Field: 'Date range', Value: meta.dateLabel || `${from} → ${to}` },
    { Field: 'From', Value: from },
    { Field: 'To', Value: to },
    { Field: 'Town', Value: meta.town || 'All' },
    { Field: 'Store', Value: meta.store || 'All' },
    { Field: 'Category', Value: meta.category || 'All' },
    { Field: 'SKU', Value: meta.sku || 'All' },
    { Field: 'Target month', Value: meta.targetMonth || dash.targetVsAchievement?.month || '—' },
    { Field: "Total BA's", Value: dash.baStatus?.total ?? 0 },
    { Field: "Active BA's", Value: dash.baStatus?.active ?? 0 },
    { Field: "Offline BA's", Value: dash.baStatus?.offline ?? 0 },
    { Field: "On Break BA's", Value: dash.baStatus?.break ?? 0 },
    { Field: 'Customers Intercepted', Value: dash.kpis.customersIntercepted },
    { Field: 'Productive Calls', Value: dash.kpis.productiveCalls },
    { Field: 'Productive %', Value: dash.kpis.productivePct },
    { Field: 'Target (Ltr/Kg)', Value: dash.kpis.targetLtrKg },
    { Field: 'Sales (Ltr/Kg)', Value: dash.kpis.salesLtrKg },
    { Field: 'Achievement %', Value: dash.kpis.achievementPct },
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary')

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      (dash.baStatus?.cities ?? []).map((c) => ({
        City: c.city,
        Stores: c.stores,
        Active: c.active,
        'On Break': c.break,
        Offline: c.offline,
        Total: c.total,
      })),
    ),
    'BA Status by City',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      (dash.attendance ?? []).map((r) => ({
        BA: r.ba,
        Store: r.store,
        City: r.city,
        Days: r.days,
        'Check In': r.checkIn,
        'Check Out': r.checkOut,
        Hours: r.hours,
        Status: r.status ?? '',
      })),
    ),
    'Attendance',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      (dash.categorySales ?? []).map((c) => ({
        Category: c.name,
        'Sales (Kg)': c.value,
      })),
    ),
    'Category Sales',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      (dash.topStores ?? []).map((s) => ({
        Store: s.store,
        'Sales (Kg)': s.sales,
      })),
    ),
    'Top Stores',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      (dash.topSkus ?? []).map((s) => ({
        SKU: s.sku,
        'Sales (Kg)': s.sales,
      })),
    ),
    'Top SKUs',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      (dash.periodSales ?? []).map((p) => ({
        Period: p.label,
        'Sales (Kg)': p.sales,
        'Target (Kg)': p.target,
      })),
    ),
    'Period Sales',
  )

  if (dash.targetVsAchievement?.rows?.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        dash.targetVsAchievement.rows.map((r) => ({
          Month: dash.targetVsAchievement?.monthLabel || dash.targetVsAchievement?.month || '',
          BA: r.ambassador,
          Store: r.store,
          City: r.city,
          'Target (Kg)': r.target,
          'Sales (Kg)': r.sales,
          'Achievement %': r.achievement ?? '',
        })),
      ),
      'Target vs Achievement',
    )
  }

  if (dash.workingHours?.points?.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        dash.workingHours.points.map((p) => ({
          Label: p.label,
          'Avg Hours': p.hours,
          Visits: p.count,
        })),
      ),
      'Working Hours',
    )
  }

  const name =
    from === to
      ? `ba_performance_${from}.xlsx`
      : `ba_performance_${from}_to_${to}.xlsx`
  XLSX.writeFile(wb, name)
}
