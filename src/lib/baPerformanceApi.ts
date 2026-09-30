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

export type BaStatusPayload = {
  days: number
  active: number
  break: number
  offline: number
  cities: BaStatusCity[]
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
  const q = qs.toString()
  const path = q
    ? `/api/intelligence/ba-performance/?${q}`
    : '/api/intelligence/ba-performance/'
  return apiRequest<BaPerformanceDashboard>(path)
}
