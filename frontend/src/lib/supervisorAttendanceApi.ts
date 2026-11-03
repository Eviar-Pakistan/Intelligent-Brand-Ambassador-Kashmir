/** Supervisor BA attendance table API. */

import { apiRequest } from './api'

export type SupervisorAttendanceFilterStatus =
  | 'present'
  | 'on_shift'
  | 'not_checked_in'
  | 'absent'
  | 'on_leave'

export type SupervisorBaAttendanceRow = {
  date: string
  day: string
  baId: number
  baName: string
  baCode: string
  storeId: number | null
  storeName: string
  storeCode: string
  city: string
  shift: string
  checkedInAt: string | null
  checkedOutAt: string | null
  checkInLat?: number | null
  checkInLng?: number | null
  checkOutLat?: number | null
  checkOutLng?: number | null
  checkInPhotoUrl?: string | null
  reportSubmitted: boolean
  filterStatus: SupervisorAttendanceFilterStatus | string
}

export type SupervisorBaAttendanceResponse = {
  from: string
  to: string
  results: SupervisorBaAttendanceRow[]
}

export async function fetchSupervisorBaAttendance(params: {
  mode: 'me' | 'ho'
  supervisorId?: string | number
  from: string
  to: string
}) {
  const q = `?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}`
  if (params.mode === 'me') {
    return apiRequest<SupervisorBaAttendanceResponse>(`/api/supervisor/me/ba-attendance/${q}`)
  }
  const id = encodeURIComponent(String(params.supervisorId ?? ''))
  return apiRequest<SupervisorBaAttendanceResponse>(`/api/supervisors/${id}/ba-attendance/${q}`)
}
