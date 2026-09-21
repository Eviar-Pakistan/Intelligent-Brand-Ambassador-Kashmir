import generated from './baPerformance.generated.json'

/** Towns in source data outside the Kashmir programme scope */
const EXCLUDED_TOWNS = new Set(['Daska', 'Muridke'])

export type BaPerformanceRecord = {
  town: string
  month: string
  store: string
  customersIntercepted: number
  productiveCalls: number
  targetLtrKg: number
  salesLtrKg: number
  oilSales: number
  gheeSales: number
  waadiSales: number
  weekSales: { week: number; sales: number }[]
  skuSales: { sku: string; sales: number }[]
}

export const baPerformanceTowns = (generated.towns as string[]).filter((t) => !EXCLUDED_TOWNS.has(t))
export const baPerformanceMonths = generated.months as string[]
export const baPerformanceStoresByTown = Object.fromEntries(
  Object.entries(generated.storesByTown as Record<string, string[]>).filter(
    ([town]) => !EXCLUDED_TOWNS.has(town),
  ),
)
export const baPerformanceRecords = (generated.records as BaPerformanceRecord[]).filter(
  (r) => !EXCLUDED_TOWNS.has(r.town),
)

export type BaPerformanceFilters = {
  town: string | null
  month: string | null
  store: string | null
}

export type BaPerformanceAggregate = {
  customersIntercepted: number
  productiveCalls: number
  productivePct: number
  targetLtrKg: number
  salesLtrKg: number
  achievementPct: number
  categorySales: { name: string; value: number }[]
  townTargetVsSales: { town: string; target: number; sales: number }
  weekSales: { week: number; sales: number }[]
  topStores: { store: string; sales: number }[]
  topSkus: { sku: string; sales: number }[]
}

export const MONTH_ORDER = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * The source data is monthly, so day-level figures are derived: each day gets a
 * deterministic weight (0.6–1.4, mean ≈ 1) and takes its share of the month.
 */
function dayWeight(monthIdx: number, day: number) {
  const seed = Math.imul((monthIdx + 1) * 100 + day, 2654435761) >>> 0
  return 0.6 + (((seed >>> 8) % 1000) / 1000) * 0.8
}

export type PeriodShare = {
  /** Fraction of the month's activity (sales, customers, calls) */
  sales: number
  /** Fraction of the month's target (targets accrue evenly per day) */
  target: number
  /** Fraction of the i-th of n weekly buckets that the period covers */
  weekFactor: (index: number, count: number) => number
}

/** Share of `month` covered by the given days of the month (1-based). */
export function periodShareForDays(month: string, days: number[]): PeriodShare {
  const monthIdx = MONTH_ORDER.indexOf(month)
  const dim = DAYS_IN_MONTH[monthIdx] ?? 30
  const weights = Array.from({ length: dim }, (_, i) => dayWeight(monthIdx, i + 1))
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  const inRange = new Set(days.map((d) => Math.min(Math.max(d, 1), dim)))
  const rangeWeight = [...inRange].reduce((s, d) => s + weights[d - 1], 0)

  return {
    sales: rangeWeight / totalWeight,
    target: inRange.size / dim,
    weekFactor: (index, count) => {
      let chunk = 0
      let covered = 0
      for (let d = 1; d <= dim; d += 1) {
        if (Math.floor(((d - 1) * count) / dim) !== index) continue
        chunk += weights[d - 1]
        if (inRange.has(d)) covered += weights[d - 1]
      }
      return chunk > 0 ? covered / chunk : 0
    },
  }
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

export function scaleRecordsToPeriod(records: BaPerformanceRecord[], share: PeriodShare) {
  return records.map<BaPerformanceRecord>((r) => {
    const weeks = [...r.weekSales].sort((a, b) => a.week - b.week)
    return {
      ...r,
      customersIntercepted: Math.round(r.customersIntercepted * share.sales),
      productiveCalls: Math.round(r.productiveCalls * share.sales),
      targetLtrKg: r.targetLtrKg * share.target,
      salesLtrKg: r.salesLtrKg * share.sales,
      oilSales: r.oilSales * share.sales,
      gheeSales: r.gheeSales * share.sales,
      waadiSales: r.waadiSales * share.sales,
      weekSales: weeks.flatMap((w, i) => {
        const factor = share.weekFactor(i, weeks.length)
        return factor > 0 ? [{ week: w.week, sales: round1(w.sales * factor) }] : []
      }),
      skuSales: r.skuSales.map((s) => ({ ...s, sales: s.sales * share.sales })),
    }
  })
}

/** Stores in a town that have data in any of `months` (all months when null). */
export function getStoresForTown(town: string | null, months?: string[] | null) {
  const towns = town ? [town] : baPerformanceTowns
  const storeSet = new Set<string>()
  for (const t of towns) {
    for (const s of baPerformanceStoresByTown[t] ?? []) storeSet.add(s)
  }
  const stores = [...storeSet].sort()
  if (!months) {
    if (!town) {
      // All towns + all months: any store that appears in records
      const active = new Set(
        baPerformanceRecords.filter((r) => r.store !== '__ALL__').map((r) => r.store),
      )
      return stores.filter((s) => active.has(s))
    }
    return stores
  }
  const active = new Set(
    baPerformanceRecords
      .filter(
        (r) =>
          (!town || r.town === town) && months.includes(r.month) && r.store !== '__ALL__',
      )
      .map((r) => r.store),
  )
  return stores.filter((s) => active.has(s))
}

export function filterBaPerformanceRecords(filters: BaPerformanceFilters) {
  return baPerformanceRecords.filter((r) => {
    if (filters.town && r.town !== filters.town) return false
    if (filters.month && r.month !== filters.month) return false
    if (r.store === '__ALL__') return false
    if (filters.store && r.store !== filters.store) return false
    return true
  })
}

function emptyAggregate(townLabel: string): BaPerformanceAggregate {
  return {
    customersIntercepted: 0,
    productiveCalls: 0,
    productivePct: 0,
    targetLtrKg: 0,
    salesLtrKg: 0,
    achievementPct: 0,
    categorySales: [],
    townTargetVsSales: { town: townLabel, target: 0, sales: 0 },
    weekSales: [],
    topStores: [],
    topSkus: [],
  }
}

export function aggregateBaPerformance(
  records: BaPerformanceRecord[],
  town: string | null,
): BaPerformanceAggregate {
  const townLabel = town ?? 'All towns'
  if (records.length === 0) return emptyAggregate(townLabel)

  const customersIntercepted = records.reduce((s, r) => s + r.customersIntercepted, 0)
  const productiveCalls = records.reduce((s, r) => s + r.productiveCalls, 0)
  const targetLtrKg = Math.round(records.reduce((s, r) => s + r.targetLtrKg, 0))
  const salesLtrKg = Math.round(records.reduce((s, r) => s + r.salesLtrKg, 0) * 10) / 10
  const oil = Math.round(records.reduce((s, r) => s + r.oilSales, 0) * 10) / 10
  const ghee = Math.round(records.reduce((s, r) => s + r.gheeSales, 0) * 10) / 10
  const waadi = Math.round(records.reduce((s, r) => s + r.waadiSales, 0) * 10) / 10

  const weekMap = new Map<number, number>()
  for (const r of records) {
    for (const w of r.weekSales) {
      weekMap.set(w.week, (weekMap.get(w.week) ?? 0) + w.sales)
    }
  }
  const weekSales = [...weekMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, sales]) => ({ week, sales: Math.round(sales * 10) / 10 }))

  const storeMap = new Map<string, number>()
  for (const r of records) {
    storeMap.set(r.store, (storeMap.get(r.store) ?? 0) + r.salesLtrKg)
  }
  const topStores = [...storeMap.entries()]
    .map(([store, sales]) => ({ store, sales: Math.round(sales * 10) / 10 }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5)

  const skuMap = new Map<string, number>()
  for (const r of records) {
    for (const sku of r.skuSales) {
      skuMap.set(sku.sku, (skuMap.get(sku.sku) ?? 0) + sku.sales)
    }
  }
  const topSkus = [...skuMap.entries()]
    .map(([sku, sales]) => ({ sku, sales: Math.round(sales * 10) / 10 }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5)

  return {
    customersIntercepted,
    productiveCalls,
    productivePct:
      customersIntercepted > 0
        ? Math.round((productiveCalls / customersIntercepted) * 100)
        : 0,
    targetLtrKg,
    salesLtrKg,
    achievementPct: targetLtrKg > 0 ? Math.round((salesLtrKg / targetLtrKg) * 100) : 0,
    categorySales: [
      { name: 'OIL SALES', value: oil },
      { name: 'GHEE-SALES', value: ghee },
      { name: 'WAADI-SALES', value: waadi },
    ],
    townTargetVsSales: { town: townLabel, target: targetLtrKg, sales: salesLtrKg },
    weekSales,
    topStores,
    topSkus,
  }
}

/** A month of source data, optionally narrowed to some of its days. */
export type DataPeriod = { month: string | null; share: PeriodShare | null }

/** Prefer the exact month if present in data; otherwise the nearest prior available month. */
export function resolveDataMonth(monthName: string): string | null {
  if (baPerformanceMonths.includes(monthName)) return monthName
  const idx = MONTH_ORDER.indexOf(monthName)
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (baPerformanceMonths.includes(MONTH_ORDER[i])) return MONTH_ORDER[i]
  }
  return baPerformanceMonths[0] ?? null
}

/**
 * Splits a date range into the source months it touches. A range inside one month with no
 * data falls back to the nearest earlier month; across several months, months without data
 * are skipped and reported in `missing`.
 */
export function periodsForRange(start: Date, end: Date) {
  const byMonth = new Map<number, Set<number>>()
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const days = byMonth.get(d.getMonth()) ?? new Set<number>()
    days.add(d.getDate())
    byMonth.set(d.getMonth(), days)
  }

  const periods: DataPeriod[] = []
  const missing: string[] = []
  let fallback: { wanted: string; used: string } | null = null

  for (const [monthIdx, days] of byMonth) {
    const wanted = MONTH_ORDER[monthIdx]
    let month: string | null = baPerformanceMonths.includes(wanted) ? wanted : null
    if (!month && byMonth.size === 1) {
      month = resolveDataMonth(wanted)
      if (month) fallback = { wanted, used: month }
    }
    if (month) periods.push({ month, share: periodShareForDays(month, [...days]) })
    else missing.push(wanted)
  }

  return { periods, missing, fallback }
}

/** Filtered records for each period, scaled to the days each period covers. */
export function collectPeriodRecords(
  filters: { town: string | null; store: string | null },
  periods: DataPeriod[],
) {
  return periods.flatMap((p) => {
    let records = filterBaPerformanceRecords({ ...filters, month: p.month })
    if (records.length === 0 && filters.town && !filters.store && p.month) {
      const summary = baPerformanceRecords.find(
        (r) => r.town === filters.town && r.month === p.month && r.store === '__ALL__',
      )
      if (summary) records = [{ ...summary, store: 'Summary' }]
    }
    return p.share ? scaleRecordsToPeriod(records, p.share) : records
  })
}
