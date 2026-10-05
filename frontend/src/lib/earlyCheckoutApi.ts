/**
 * Head Office daily reports: all BA check-outs + field reports.
 */

import { apiRequest, isApiAuthenticated } from './api'

export type DailyReportRow = {
  id: string
  date: string | null
  day: string
  shift: string
  storeId: number | null
  storeName: string
  city: string
  checkedInAt: string | null
  checkedOutAt: string | null
  earlyLeaveReason: string | null
  isEarlyCheckout: boolean
  hasFieldReport: boolean
  fieldReportId: number | null
  source: 'excel' | 'manual' | string | null
  fileName: string | null
  stock: Record<string, string> | null
  sales: Record<string, string | number> | null
  otherBrands: { id?: string; name?: string; price?: string }[] | null
  submittedAt: string | null
}

export type DailyReportBaCard = {
  baId: string
  baName: string
  baCode: string
  city: string
  reportCount: number
  earlyCount: number
  fieldReportCount: number
  latestAt: string | null
  reports: DailyReportRow[]
}

export async function fetchDailyReports(): Promise<DailyReportBaCard[]> {
  if (!isApiAuthenticated()) return []
  const data = await apiRequest<{ results: DailyReportBaCard[] }>('/api/daily-reports/')
  return data.results ?? []
}

/** @deprecated use fetchDailyReports */
export async function fetchEarlyCheckoutReports(): Promise<DailyReportBaCard[]> {
  if (!isApiAuthenticated()) return []
  const data = await apiRequest<{ results: DailyReportBaCard[] }>('/api/early-checkouts/')
  return data.results ?? []
}

export type EarlyCheckoutBaCard = DailyReportBaCard
export type EarlyCheckoutReport = DailyReportRow

export function formatReportWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export async function submitBaDailyReportApi(input: {
  token: string
  stock?: Record<string, string>
  sales?: Record<string, string | number>
  otherBrands?: { id?: string; name?: string; price?: string }[]
  source?: 'excel' | 'manual'
  fileName?: string
  storeId?: number
  /** Applied when checkout is stamped on final report submit. */
  earlyLeaveReason?: string
}) {
  return apiRequest('/api/ba/daily-report/', {
    method: 'POST',
    auth: false,
    body: {
      token: input.token,
      stock: input.stock ?? {},
      sales: input.sales ?? {},
      other_brands: input.otherBrands ?? [],
      source: input.source ?? 'manual',
      file_name: input.fileName ?? '',
      ...(input.storeId != null ? { store_id: input.storeId } : {}),
      ...(input.earlyLeaveReason?.trim()
        ? { early_leave_reason: input.earlyLeaveReason.trim() }
        : {}),
    },
  })
}
