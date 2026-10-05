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

export type ProductCategory =
  | 'Kashmir Cooking Oil'
  | 'Kashmir Banaspati'
  | 'Waadi Banaspati'

export const baPerformanceCategories: ProductCategory[] = [
  'Kashmir Cooking Oil',
  'Kashmir Banaspati',
  'Waadi Banaspati',
]
export const baPerformanceBrands = ['Kashmir', 'Waadi'] as const

/** LMT SKUs — 17 packs across KCO / KBP / WBP. */
const OIL_SKUS = [
  'KPGO 10 LTR CAN Cons. RED',
  'KPGO 3.0 LTR BOTTLE (3LTR X 6) Cons. RED',
  'KPGO 4.5 LTR BOTTLE (4.5LTRX 4) Cons. RED',
  'KPGO 5 LTR TIN Cons. RED',
  'KPGO POUCH (1LTR x 5) Cons. RED',
  'KPGO Stand Up Pouch (1LTR x 5)',
  'KPGO 16 LTR BKT',
] as const

const GHEE_SKUS = [
  'KBP GOLD 10 KG BKT',
  'KBP GOLD 2.5 KG BKT',
  'KBP GOLD 5 KG BKT',
  'KBP GOLD 5 KG TIN',
  'KBP GOLD POUCH (1KG X 5)',
  'KBP 16 KG BKT',
] as const

const WAADI_SKUS = [
  'WBP 5 KG BKT',
  'WBP POUCH (1KG X 5)',
  'WBP 2.5 KG BKT',
  'WBP 16 KG BKT',
] as const

export type ProductFilters = {
  category: ProductCategory | null
  brand: string | null
  sku: string | null
}

export function getSkusForCategory(category: ProductCategory | null): string[] {
  if (category === 'Kashmir Cooking Oil') return [...OIL_SKUS]
  if (category === 'Kashmir Banaspati') return [...GHEE_SKUS]
  if (category === 'Waadi Banaspati') return [...WAADI_SKUS]
  return [...OIL_SKUS, ...GHEE_SKUS, ...WAADI_SKUS]
}

/** Full LMT catalog (17 packs) for SKU pickers. */
export function getAllSkus(): string[] {
  return [...OIL_SKUS, ...GHEE_SKUS, ...WAADI_SKUS]
}

/** Placeholder chart series until live target data is loaded (Top 10 style). */
export const DEMO_CATEGORY_SALES = [
  { name: 'Kashmir Cooking Oil', value: 11804 },
  { name: 'Kashmir Banaspati', value: 6420 },
  { name: 'Waadi Banaspati', value: 3180 },
] as const

/** Demo stores tagged by city so town filter can scope Top 10. */
export const DEMO_STORES_BY_CITY: Record<string, string[]> = {
  Lahore: [
    'Raheem Store Iqbal Town',
    'Al Fatah Gold Crest Mall',
    'Al Fatah Exclusive Mall',
    'Rahim Store Wapda Town',
    'Risen Cash & Carry Manawan',
    'Al Fazal Store',
    'Aslam Cc College Road',
    'Sana Cash & Carry',
    'Rainbow Cash & Carry',
    'Risen C&C Manawan',
    'Packages Mall Kiosk',
    'Emporium Mall Counter',
  ],
  Islamabad: [
    'C4 - WTC Islamabad',
    'Giga Mall BA Point',
    'Centaurus Counter',
    'F-10 Markaz Store',
    'Blue Area Cash & Carry',
    'I-8 Super Market',
    'Bahria Phase 7 Store',
    'PWD Sector Store',
    'G-11 Mini Mart',
    'Rawalpindi Saddar CC',
  ],
  Karachi: [
    'Dolmen Clifton Counter',
    'Lucky One Mall Store',
    'Saddar Cash & Carry',
    'Gulshan-e-Iqbal Mart',
    'North Nazimabad CC',
    'Tariq Road Emporium',
    'Bahadurabad Store',
    'Clifton Block 5 Store',
    'Korangi Industrial Mart',
    'Malir Cantt Store',
  ],
  Multan: [
    'Multan Cantt Store',
    'Gulgasht Colony Mart',
    'Bosan Road CC',
    'Shah Rukn-e-Alam Store',
    'Hussain Agahi Mart',
    'MDA Chowk Store',
    'Vehari Road CC',
    'Garden Town Multan',
    'Mumtozabad Store',
    'New Multan City Mart',
  ],
}

export const DEMO_TOP_STORES_BY_TARGET = [
  { store: 'Raheem Store Iqbal Town', sales: 3240 },
  { store: 'Al Fatah Gold Crest Mall', sales: 2980 },
  { store: 'Al Fatah Exclusive Mall', sales: 2750 },
  { store: 'Rahim Store Wapda Town', sales: 2510 },
  { store: 'Risen Cash & Carry Manawan', sales: 2380 },
  { store: 'C4 - WTC Islamabad', sales: 2210 },
  { store: 'Al Fazal Store', sales: 2090 },
  { store: 'Aslam Cc College Road', sales: 1950 },
  { store: 'Sana Cash & Carry', sales: 1820 },
  { store: 'Rainbow Cash & Carry', sales: 1710 },
] as const

export const DEMO_TOP_SKU_TARGETS = [
  { sku: 'KPGO 10 LTR CAN Cons. RED', sales: 12480 },
  { sku: 'KBP GOLD 10 KG BKT', sales: 9620 },
  { sku: 'KPGO 5 LTR TIN Cons. RED', sales: 7840 },
  { sku: 'KBP GOLD 5 KG BKT', sales: 6510 },
  { sku: 'KPGO 4.5 LTR BOTTLE (4.5LTRX 4) Cons. RED', sales: 5380 },
  { sku: 'KPGO 3.0 LTR BOTTLE (3LTR X 6) Cons. RED', sales: 4720 },
  { sku: 'KBP GOLD POUCH (1KG X 5)', sales: 3910 },
  { sku: 'WBP 5 KG BKT', sales: 3280 },
  { sku: 'KPGO Stand Up Pouch (1LTR x 5)', sales: 2650 },
  { sku: 'WBP POUCH (1KG X 5)', sales: 1890 },
] as const

function demoSeed(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function demoValue(seedText: string, min: number, max: number) {
  const t = (demoSeed(seedText) % 1000) / 1000
  return Math.round(min + t * (max - min))
}

/** Category doughnut values scoped to the active category filter. */
export function demoCategorySalesForFilters(category: ProductCategory | null, town: string | null) {
  const scope = town || 'all'
  const all = DEMO_CATEGORY_SALES.map((c) => ({
    name: c.name,
    value: demoValue(`${scope}|${c.name}`, Math.round(c.value * 0.55), Math.round(c.value * 1.15)),
  }))
  if (!category) return all
  return all.filter((c) => c.name === category)
}

/**
 * Top 10 store targets for the active town/store filters.
 * Prefers live store names from the filter panel when available.
 */
export function demoTopStoresForFilters(opts: {
  town: string | null
  store: string | null
  storeOptions: string[]
  category: ProductCategory | null
}) {
  const { town, store, storeOptions, category } = opts
  if (store) {
    return [{ store, sales: demoValue(`${town}|${store}|${category}`, 1600, 3600) }]
  }

  let names =
    storeOptions.length > 0
      ? [...storeOptions]
      : (() => {
          if (!town) return Object.values(DEMO_STORES_BY_CITY).flat()
          const hit = Object.entries(DEMO_STORES_BY_CITY).find(
            ([city]) => city.toLowerCase() === town.toLowerCase(),
          )
          return hit ? [...hit[1]] : Object.values(DEMO_STORES_BY_CITY).flat()
        })()

  // Stable unique, then score and take top 10
  names = [...new Set(names)]
  const scored = names.map((name) => ({
    store: name,
    sales: demoValue(`${town ?? 'all'}|${category ?? 'all'}|${name}`, 1400, 3600),
  }))
  scored.sort((a, b) => b.sales - a.sales)
  return scored.slice(0, 10)
}

/** Top 5 SKU targets for the active category/sku (+ town scales values). */
export function demoTopSkusForFilters(opts: {
  category: ProductCategory | null
  sku: string | null
  town: string | null
}) {
  const { category, sku, town } = opts
  const scope = `${town ?? 'all'}|${category ?? 'all'}`
  if (sku) {
    return [{ sku, sales: demoValue(`${scope}|${sku}`, 1800, 13000) }]
  }
  const pool = getSkusForCategory(category)
  const scored = pool.map((name) => ({
    sku: name,
    sales: demoValue(`${scope}|${name}`, 1200, 13000),
  }))
  scored.sort((a, b) => b.sales - a.sales)
  return scored.slice(0, 5)
}

/** Target vs sales bars for the active filter scope. Sales stays 0 until live data exists. */
export function demoTargetVsSalesForFilters(opts: {
  town: string | null
  store: string | null
  category: ProductCategory | null
  sku: string | null
}) {
  const label =
    opts.store ||
    opts.town ||
    opts.sku ||
    opts.category ||
    'All towns'
  const seed = `${opts.town}|${opts.store}|${opts.category}|${opts.sku}`
  const target = demoValue(`${seed}|target`, 3500, 12000)
  return { town: label, target, sales: 0 }
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
    if (product.category === 'Kashmir Cooking Oil') return r.oilSales
    if (product.category === 'Kashmir Banaspati') return r.gheeSales
    if (product.category === 'Waadi Banaspati') return r.waadiSales
    return r.salesLtrKg
  }

  function scopedTarget(r: BaPerformanceRecord) {
    if (product.sku) {
      const skuAmt = r.skuSales.find((s) => s.sku === product.sku)?.sales ?? 0
      return r.salesLtrKg > 0 ? r.targetLtrKg * (skuAmt / r.salesLtrKg) : 0
    }
    if (product.category === 'Kashmir Cooking Oil') {
      const cat = r.oilSales + r.gheeSales + r.waadiSales
      return cat > 0 ? r.targetLtrKg * (r.oilSales / cat) : 0
    }
    if (product.category === 'Kashmir Banaspati') {
      const cat = r.oilSales + r.gheeSales + r.waadiSales
      return cat > 0 ? r.targetLtrKg * (r.gheeSales / cat) : 0
    }
    if (product.category === 'Waadi Banaspati') {
      const cat = r.oilSales + r.gheeSales + r.waadiSales
      return cat > 0 ? r.targetLtrKg * (r.waadiSales / cat) : 0
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
    .slice(0, 10)

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
  if (product.category === 'Kashmir Cooking Oil') {
    categorySales = [{ name: 'Kashmir Cooking Oil', value: oilRounded }]
  } else if (product.category === 'Kashmir Banaspati') {
    categorySales = [{ name: 'Kashmir Banaspati', value: gheeRounded }]
  } else if (product.category === 'Waadi Banaspati') {
    categorySales = [{ name: 'Waadi Banaspati', value: waadiRounded }]
  } else {
    categorySales = [
      { name: 'Kashmir Cooking Oil', value: oilRounded },
      { name: 'Kashmir Banaspati', value: gheeRounded },
      { name: 'Waadi Banaspati', value: waadiRounded },
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
