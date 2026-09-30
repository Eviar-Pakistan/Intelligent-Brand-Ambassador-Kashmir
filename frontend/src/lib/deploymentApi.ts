import { apiRequest, isApiAuthenticated } from './api'
import type { ShiftSlot } from '../data/mock'

export type WeekDay = {
  key: string
  label: string
  date: string
  iso: string
}

export type ApiShift = {
  id: string
  day: string
  date: string
  dateIso: string
  storeId: number
  storeName: string
  city: string
  shift: string
  peakRecommended: boolean
  baId: string | null
  baName: string | null
  status: 'Scheduled' | 'Open' | 'Conflict' | string
  checkedIn?: boolean
  checkedOut?: boolean
  checkedInAt?: string | null
  checkedOutAt?: string | null
}

export type WeekShiftsResponse = {
  week_start: string
  week_end: string
  week_label: string
  days: WeekDay[]
  results: ApiShift[]
}

const DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function mondayOf(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  const day = (x.getDay() + 6) % 7 // Mon=0
  x.setDate(x.getDate() - day)
  return x
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Build Mon–Sun week board (local), matching Django `build_week_days`. */
export function buildWeekDays(weekStart = mondayOf()): WeekDay[] {
  const start = mondayOf(weekStart)
  return DAY_KEYS.map((key, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return {
      key,
      label: key,
      date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      iso: toIsoDate(d),
    }
  })
}

export function apiShiftToSlot(s: ApiShift): ShiftSlot {
  return {
    id: String(s.id),
    day: s.day,
    date: s.date,
    dateIso: s.dateIso,
    storeId: s.storeId,
    storeName: s.storeName,
    city: s.city,
    shift: s.shift,
    peakRecommended: !!s.peakRecommended,
    baId: s.baId,
    baName: s.baName,
    status:
      s.status === 'Open' || s.status === 'Conflict' || s.status === 'Scheduled'
        ? s.status
        : s.baId
          ? 'Scheduled'
          : 'Open',
  }
}

export async function fetchWeekShifts(weekStartIso?: string): Promise<WeekShiftsResponse> {
  const qs = weekStartIso ? `?week_start=${encodeURIComponent(weekStartIso)}` : ''
  return apiRequest<WeekShiftsResponse>(`/api/shifts/${qs}`)
}

/** Load all shifts for a calendar month (YYYY-MM). */
export async function fetchMonthShifts(monthYm: string): Promise<WeekShiftsResponse> {
  return apiRequest<WeekShiftsResponse>(`/api/shifts/?month=${encodeURIComponent(monthYm)}`)
}

/** All shifts for one ambassador (past + upcoming), newest first. */
export async function fetchAmbassadorShifts(ambassadorId: string | number): Promise<ApiShift[]> {
  const data = await apiRequest<{ results?: ApiShift[] }>(
    `/api/shifts/?ambassador=${encodeURIComponent(String(ambassadorId))}&all=1`,
  )
  return Array.isArray(data?.results) ? data.results : []
}

export type AttendanceDayRow = {
  date: string
  day: string
  storeId: number | null
  storeName: string
  city: string
  shift: string
  checkedInAt: string | null
  checkedOutAt: string | null
  status: 'Present' | 'Absent' | 'Scheduled' | string
}

export type AttendanceChartResponse = {
  days: number
  present: number
  absent: number
  results: AttendanceDayRow[]
}

/** Last N days Present/Absent attendance for one BA (persisted in DB). */
export async function fetchAmbassadorAttendance(
  ambassadorId: string | number,
  days = 30,
): Promise<AttendanceChartResponse> {
  return apiRequest<AttendanceChartResponse>(
    `/api/ambassadors/${encodeURIComponent(String(ambassadorId))}/attendance/?days=${days}`,
  )
}

export async function deployAmbassador(ambassadorId: string | number, storeId: number) {
  return apiRequest(`/api/ambassadors/${ambassadorId}/deploy/`, {
    method: 'POST',
    body: { store_id: storeId },
  })
}

/** Clear BA home store (Deployed → Certified, store=null). */
export async function undeployAmbassador(ambassadorId: string | number) {
  return apiRequest(`/api/ambassadors/${ambassadorId}/undeploy/`, {
    method: 'POST',
    body: {},
  })
}

export async function createShift(input: {
  storeId: number
  ambassadorId: string | number | null
  dateIso: string
  shift: string
  peakRecommended?: boolean
}) {
  return apiRequest<ApiShift>('/api/shifts/', {
    method: 'POST',
    body: {
      store_id: input.storeId,
      ambassador_id: input.ambassadorId == null ? null : Number(input.ambassadorId),
      date_iso: input.dateIso,
      shift: input.shift,
      peakRecommended: input.peakRecommended ?? false,
    },
  })
}

export async function updateShift(
  id: string,
  input: {
    storeId?: number
    ambassadorId?: string | number | null
    dateIso?: string
    shift?: string
    peakRecommended?: boolean
  },
) {
  const body: Record<string, unknown> = {}
  if (input.storeId !== undefined) body.store_id = input.storeId
  if (input.ambassadorId !== undefined) {
    body.ambassador_id = input.ambassadorId == null ? null : Number(input.ambassadorId)
  }
  if (input.dateIso !== undefined) body.date_iso = input.dateIso
  if (input.shift !== undefined) body.shift = input.shift
  if (input.peakRecommended !== undefined) body.peakRecommended = input.peakRecommended
  return apiRequest<ApiShift>(`/api/shifts/${id}/`, { method: 'PATCH', body })
}

export async function clearShiftBa(id: string) {
  return updateShift(id, { ambassadorId: null })
}

export async function deleteShift(id: string) {
  return apiRequest(`/api/shifts/${id}/`, { method: 'DELETE' })
}

/**
 * Deploy BA to store then create/update the shift.
 * When replacing another BA, undeploy the previous one (store → null).
 */
export async function assignBaToStoreShift(opts: {
  shiftId?: string | null
  storeId: number
  ambassadorId: string | number
  previousAmbassadorId?: string | number | null
  dateIso: string
  shift: string
  peakRecommended?: boolean
}) {
  if (!isApiAuthenticated()) {
    throw new Error('Sign in to Head Office to save deployment.')
  }

  const prevId =
    opts.previousAmbassadorId != null && String(opts.previousAmbassadorId) !== String(opts.ambassadorId)
      ? opts.previousAmbassadorId
      : null

  await deployAmbassador(opts.ambassadorId, opts.storeId)

  let shift: ApiShift
  if (opts.shiftId) {
    shift = await updateShift(opts.shiftId, {
      storeId: opts.storeId,
      ambassadorId: opts.ambassadorId,
      dateIso: opts.dateIso,
      shift: opts.shift,
      peakRecommended: opts.peakRecommended,
    })
  } else {
    shift = await createShift({
      storeId: opts.storeId,
      ambassadorId: opts.ambassadorId,
      dateIso: opts.dateIso,
      shift: opts.shift,
      peakRecommended: opts.peakRecommended,
    })
  }

  // Only undeploy the previous BA when they no longer have this shift.
  // Backend reconcile restores them if they still have other scheduled shifts.
  if (prevId != null) {
    await undeployAmbassador(prevId).catch(() => {
      // Shift already reassigned; store clear is best-effort.
    })
  }

  return shift
}
