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

export type ProductCategory = 'Cooking Oil' | 'Banaspati Ghee'

export const baPerformanceCategories: ProductCategory[] = ['Cooking Oil', 'Banaspati Ghee']
export const baPerformanceBrands = ['Kashmir'] as const

/** SKU names as they appear in performance source data, grouped by category. */
const OIL_SKUS = [
  'Pouch 1LTR',
  'POUCH 1KG',
  'SUP 1LTR',
  'BTL 3LTR',
  'BTL 4.5LTR',
  'CAN 10LTR',
  'TIN 5LTR',
] as const

const GHEE_SKUS = [
  'POUCH 1 KG',
  'POUCH 1X5 KG Box',
  'BKT 2.5KG',
  'BKT 5KG',
  'BKT 10KG',
  'BUCKET 5 KG',
] as const

export type ProductFilters = {
  category: ProductCategory | null
  brand: string | null
  sku: string | null
}

export function getSkusForCategory(category: ProductCategory | null): string[] {
  if (category === 'Cooking Oil') return [...OIL_SKUS]
  if (category === 'Banaspati Ghee') return [...GHEE_SKUS]
  return [...OIL_SKUS, ...GHEE_SKUS]
}

function skuBelongsToCategory(sku: string, category: ProductCategory | null) {
  if (!category) return true
  return getSkusForCategory(category).includes(sku)
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
  product: ProductFilters = { category: null, brand: null, sku: null },
): BaPerformanceAggregate {
  const townLabel = town ?? 'All towns'
  if (records.length === 0) return emptyAggregate(townLabel)

  const customersIntercepted = records.reduce((s, r) => s + r.customersIntercepted, 0)
  const productiveCalls = records.reduce((s, r) => s + r.productiveCalls, 0)

  const oil = records.reduce((s, r) => s + r.oilSales, 0)
  const ghee = records.reduce((s, r) => s + r.gheeSales, 0)
  const waadi = records.reduce((s, r) => s + r.waadiSales, 0)

  /** Sales attributable to the active product filters (category / SKU). */
  function scopedSales(r: BaPerformanceRecord) {
    if (product.sku) {
      return r.skuSales.find((s) => s.sku === product.sku)?.sales ?? 0
    }
    if (product.category === 'Cooking Oil') return r.oilSales
    if (product.category === 'Banaspati Ghee') return r.gheeSales
    return r.salesLtrKg
  }

  function scopedTarget(r: BaPerformanceRecord) {
    if (product.sku) {
      const skuAmt = r.skuSales.find((s) => s.sku === product.sku)?.sales ?? 0
      return r.salesLtrKg > 0 ? r.targetLtrKg * (skuAmt / r.salesLtrKg) : 0
    }
    if (product.category === 'Cooking Oil') {
      const cat = r.oilSales + r.gheeSales + r.waadiSales
      return cat > 0 ? r.targetLtrKg * (r.oilSales / cat) : 0
    }
    if (product.category === 'Banaspati Ghee') {
      const cat = r.oilSales + r.gheeSales + r.waadiSales
      return cat > 0 ? r.targetLtrKg * (r.gheeSales / cat) : 0
    }
    return r.targetLtrKg
  }

  const salesLtrKg = Math.round(records.reduce((s, r) => s + scopedSales(r), 0) * 10) / 10
  const targetLtrKg = Math.round(records.reduce((s, r) => s + scopedTarget(r), 0))

  const weekMap = new Map<number, number>()
  for (const r of records) {
    const factor =
      r.salesLtrKg > 0 ? scopedSales(r) / r.salesLtrKg : product.category || product.sku ? 0 : 1
    for (const w of r.weekSales) {
      weekMap.set(w.week, (weekMap.get(w.week) ?? 0) + w.sales * factor)
    }
  }
  const weekSales = [...weekMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, sales]) => ({ week, sales: Math.round(sales * 10) / 10 }))

  const storeMap = new Map<string, number>()
  for (const r of records) {
    storeMap.set(r.store, (storeMap.get(r.store) ?? 0) + scopedSales(r))
  }
  const topStores = [...storeMap.entries()]
    .map(([store, sales]) => ({ store, sales: Math.round(sales * 10) / 10 }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5)

  const skuMap = new Map<string, number>()
  for (const r of records) {
    for (const sku of r.skuSales) {
      if (product.sku && sku.sku !== product.sku) continue
      if (!skuBelongsToCategory(sku.sku, product.category)) continue
      skuMap.set(sku.sku, (skuMap.get(sku.sku) ?? 0) + sku.sales)
    }
  }
  const topSkus = [...skuMap.entries()]
    .map(([sku, sales]) => ({ sku, sales: Math.round(sales * 10) / 10 }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5)

  const oilRounded = Math.round(oil * 10) / 10
  const gheeRounded = Math.round(ghee * 10) / 10
  const waadiRounded = Math.round(waadi * 10) / 10

  let categorySales: { name: string; value: number }[]
  if (product.category === 'Cooking Oil') {
    categorySales = [{ name: 'OIL SALES', value: oilRounded }]
  } else if (product.category === 'Banaspati Ghee') {
    categorySales = [{ name: 'GHEE-SALES', value: gheeRounded }]
  } else {
    categorySales = [
      { name: 'OIL SALES', value: oilRounded },
      { name: 'GHEE-SALES', value: gheeRounded },
      { name: 'WAADI-SALES', value: waadiRounded },
    ]
  }

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
    categorySales,
    townTargetVsSales: { town: townLabel, target: targetLtrKg, sales: salesLtrKg },
    weekSales,
    topStores,
    topSkus,
  }
}

/** A month of source data, optionally narrowed to some of its days. */
export type DataPeriod = { month: string | null; share: PeriodShare | null }

/**
 * Splits a date range into the source months it touches. Months without data are skipped
 * (never substituted with another month's figures) and reported in `missing`.
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

  for (const [monthIdx, days] of byMonth) {
    const wanted = MONTH_ORDER[monthIdx]
    if (baPerformanceMonths.includes(wanted)) {
      periods.push({ month: wanted, share: periodShareForDays(wanted, [...days]) })
    } else {
      missing.push(wanted)
    }
  }

  return { periods, missing }
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

export type SalesPeriodMode = 'wow' | 'mom' | 'yoy'

export type SalesTargetPoint = { label: string; sales: number; target: number }

/** Sales vs target series for WoW / MoM / YoY chart beside dashboard filters. */
export function buildSalesTargetSeries(
  filters: { town: string | null; store: string | null },
  product: ProductFilters,
  mode: SalesPeriodMode,
  /** Active month filter — used for WoW week breakdown within that month (or all months). */
  month: string | null = null,
): SalesTargetPoint[] {
  if (mode === 'wow') {
    const months = month ? [month] : baPerformanceMonths
    const records = months.flatMap((m) =>
      filterBaPerformanceRecords({ ...filters, month: m }),
    )
    const agg = aggregateBaPerformance(records, filters.town, product)
    const weekCount = Math.max(agg.weekSales.length, 1)
    const targetPerWeek = agg.targetLtrKg / weekCount
    return agg.weekSales.map((w) => ({
      label: `W${w.week}`,
      sales: w.sales,
      target: Math.round(targetPerWeek * 10) / 10,
    }))
  }

  // MoM and YoY both plot month labels; YoY uses every available data month (year view).
  const months =
    mode === 'yoy'
      ? baPerformanceMonths
      : month
        ? baPerformanceMonths.filter((m) => MONTH_ORDER.indexOf(m) <= MONTH_ORDER.indexOf(month))
        : baPerformanceMonths

  return months
    .map((m) => {
      const records = filterBaPerformanceRecords({ ...filters, month: m })
      const agg = aggregateBaPerformance(records, filters.town, product)
      return {
        label: m.slice(0, 3),
        sales: agg.salesLtrKg,
        target: agg.targetLtrKg,
      }
    })
    .filter((p) => p.sales > 0 || p.target > 0)
}
