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
  town: string
  month: string
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

export function getStoresForTown(town: string, month?: string) {
  const stores = baPerformanceStoresByTown[town] ?? []
  if (!month) return stores
  const active = new Set(
    baPerformanceRecords
      .filter((r) => r.town === town && r.month === month && r.store !== '__ALL__')
      .map((r) => r.store),
  )
  return stores.filter((s) => active.has(s))
}

export function filterBaPerformanceRecords(filters: BaPerformanceFilters) {
  return baPerformanceRecords.filter((r) => {
    if (r.town !== filters.town) return false
    if (r.month !== filters.month) return false
    if (r.store === '__ALL__') return false
    if (filters.store && r.store !== filters.store) return false
    return true
  })
}

function emptyAggregate(town: string): BaPerformanceAggregate {
  return {
    customersIntercepted: 0,
    productiveCalls: 0,
    productivePct: 0,
    targetLtrKg: 0,
    salesLtrKg: 0,
    achievementPct: 0,
    categorySales: [],
    townTargetVsSales: { town, target: 0, sales: 0 },
    weekSales: [],
    topStores: [],
    topSkus: [],
  }
}

export function aggregateBaPerformance(
  records: BaPerformanceRecord[],
  town: string,
  month?: string,
): BaPerformanceAggregate {
  if (records.length === 0) {
    const summary = month
      ? baPerformanceRecords.find(
          (r) => r.town === town && r.month === month && r.store === '__ALL__',
        )
      : undefined
    if (!summary) return emptyAggregate(town)
    return aggregateBaPerformance([{ ...summary, store: 'Summary' }], town)
  }

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
    townTargetVsSales: { town, target: targetLtrKg, sales: salesLtrKg },
    weekSales,
    topStores,
    topSkus,
  }
}
