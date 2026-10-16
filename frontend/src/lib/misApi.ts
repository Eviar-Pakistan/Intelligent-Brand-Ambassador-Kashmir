/**
 * MIS role APIs — edits always create server-side audit log rows.
 */

import { apiRequest, isApiAuthenticated } from './api'

export const USER_TYPE_MIS = 6
export const USER_TYPE_HO = 1

export type MisAuditLogRow = {
  id: number
  when: string
  misUser: string
  misEmail: string
  action: string
  actionLabel: string
  summary: string
  before: Record<string, unknown>
  after: Record<string, unknown>
}

export type MisSwapCandidate = {
  id: number
  ambassadorId: number
  ambassadorName: string
  storeId: number
  storeName: string
  city: string
  shiftLabel: string
  label: string
}

export async function fetchMisAuditLogs(params?: {
  from?: string
  to?: string
  q?: string
  action?: string
}): Promise<MisAuditLogRow[]> {
  if (!isApiAuthenticated()) return []
  const qs = new URLSearchParams()
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  if (params?.q) qs.set('q', params.q)
  if (params?.action) qs.set('action', params.action)
  const suffix = qs.toString() ? `?${qs}` : ''
  const data = await apiRequest<{ results: MisAuditLogRow[] }>(`/api/mis/audit-logs/${suffix}`)
  return data.results ?? []
}

export type MisReportBaOption = {
  id: number
  name: string
  code: string
  city: string
  status: string
  label: string
}

export type MisBaShiftForReport = {
  id: number
  date: string
  shiftLabel: string
  status: string
  storeId: number | null
  storeName: string
  city: string
  hasReport: boolean
  fieldReportId: number | null
  label: string
}

export async function fetchMisReportBas(): Promise<MisReportBaOption[]> {
  if (!isApiAuthenticated()) return []
  const data = await apiRequest<{ results: MisReportBaOption[] }>('/api/mis/daily-report-bas/')
  return data.results ?? []
}

export async function fetchMisBaShiftsForReport(
  ambassadorId: number | string,
): Promise<MisBaShiftForReport[]> {
  if (!isApiAuthenticated()) return []
  const data = await apiRequest<{ results: MisBaShiftForReport[] }>(
    `/api/mis/ambassadors/${encodeURIComponent(String(ambassadorId))}/shifts-for-report/`,
  )
  return data.results ?? []
}

export async function misPatchDailyReport(
  reportId: number,
  body: {
    stock?: Record<string, string>
    sales?: Record<string, string | number>
    otherBrands?: { id?: string; name?: string; price?: string }[]
  },
) {
  return apiRequest(`/api/mis/daily-reports/${reportId}/`, {
    method: 'PATCH',
    body: {
      stock: body.stock,
      sales: body.sales,
      otherBrands: body.otherBrands,
    },
  })
}

export async function misCreateDailyReport(body: {
  shiftId: number
  stock?: Record<string, string>
  sales?: Record<string, string | number>
  otherBrands?: { id?: string; name?: string; price?: string }[]
}) {
  return apiRequest<{ id: number }>('/api/mis/daily-reports/', {
    method: 'POST',
    body: {
      shiftId: body.shiftId,
      stock: body.stock,
      sales: body.sales,
      otherBrands: body.otherBrands,
    },
  })
}

export async function misPatchAmbassador(
  ambassadorId: number | string,
  body: {
    name?: string
    city?: string
    phone?: string
    email?: string
    clearCheckIn?: boolean
    clearCheckOut?: boolean
    checkedInAt?: string | null
    checkedOutAt?: string | null
  },
) {
  return apiRequest(`/api/mis/ambassadors/${ambassadorId}/`, {
    method: 'PATCH',
    body,
  })
}

export async function misPatchStore(storeId: number | string, body: Record<string, unknown>) {
  return apiRequest(`/api/mis/stores/${storeId}/`, {
    method: 'PATCH',
    body,
  })
}

export async function misPatchSupervisorStores(
  supervisorId: number | string,
  storeIds: number[],
) {
  return apiRequest(`/api/mis/supervisors/${supervisorId}/stores/`, {
    method: 'PATCH',
    body: { storeIds },
  })
}

export async function fetchMisSwapCandidates(month: string): Promise<MisSwapCandidate[]> {
  if (!isApiAuthenticated()) return []
  const data = await apiRequest<{ results: MisSwapCandidate[] }>(
    `/api/mis/swap-candidates/?month=${encodeURIComponent(month)}`,
  )
  return data.results ?? []
}

export async function misSwapBas(firstShiftId: number, secondShiftId: number) {
  return apiRequest<{ ok: boolean; effectiveFrom: string; shiftsUpdated: number }>(
    '/api/mis/swap-bas/',
    {
      method: 'POST',
      body: { firstShiftId, secondShiftId },
    },
  )
}

export type MisRevampCandidate = {
  id: number
  name: string
  code: string
  city: string
  status: string
  storeId: number | null
  storeName: string
  label: string
}

export type MisRevampPlan = {
  ok: boolean
  errors?: string[]
  collisions: {
    reports: string[]
    attendance: string[]
    shifts: string[]
    targets: string[]
    incentives: string[]
  }
  collisionMessage: string
  counts: {
    reports: number
    targets: number
    attendance: number
    shifts: number
    interceptions: number
    complaints: number
    incentives: number
  }
  old: { id: number; name: string; code: string; status: string; storeId: number | null; storeName: string } | null
  new: { id: number; name: string; code: string; status: string; storeId: number | null; storeName: string } | null
  fromDate: string | null
  toDate: string | null
  detail?: string
}

export async function fetchMisRevampCandidates(): Promise<MisRevampCandidate[]> {
  if (!isApiAuthenticated()) return []
  const data = await apiRequest<{ results: MisRevampCandidate[] }>('/api/mis/revamp-candidates/')
  return data.results ?? []
}

export async function misRevampBas(body: {
  oldAmbassadorId: number
  newAmbassadorId: number
  fromDate?: string
  toDate?: string
  confirm?: boolean
}): Promise<MisRevampPlan> {
  return apiRequest<MisRevampPlan>('/api/mis/revamp-bas/', {
    method: 'POST',
    body: {
      oldAmbassadorId: body.oldAmbassadorId,
      newAmbassadorId: body.newAmbassadorId,
      fromDate: body.fromDate || undefined,
      toDate: body.toDate || undefined,
      confirm: Boolean(body.confirm),
    },
  })
}
