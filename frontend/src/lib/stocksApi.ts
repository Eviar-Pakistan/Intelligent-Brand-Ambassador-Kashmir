/**
 * Head Office stock matrix: latest BA stock status per store × SKU.
 */

import { apiRequest, isApiAuthenticated } from './api'

export type StockStatus = 'in_stock' | 'near_out' | 'out_of_stock'

export type StockMatrixSku = { key: string; label: string }

export type StockMatrixStore = {
  storeId: number
  storeName: string
  storeCode: string
  city: string
  baId: number | null
  baName: string
  baCode: string
  reportId: number | null
  reportDate: string | null
  checkedOutAt: string | null
  submittedAt: string | null
}

export type StockMatrixCell = {
  status: StockStatus | null
  label: string
}

export type StockMatrixPayload = {
  skus: StockMatrixSku[]
  stores: StockMatrixStore[]
  cells: Record<string, Record<string, StockMatrixCell>>
  legend: { status: StockStatus; label: string }[]
}

export async function fetchStockMatrix(): Promise<StockMatrixPayload | null> {
  if (!isApiAuthenticated()) return null
  return apiRequest<StockMatrixPayload>('/api/stock-matrix/')
}
