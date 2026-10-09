import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ApiError } from '../lib/api'
import {
  baCheckInApi,
  baCheckOutApi,
  fetchBaTodayShift,
  type BaAttendanceType,
  type BaTodayShiftResponse,
  type BaUpcomingShift,
} from '../lib/baAttendanceApi'

export type { BaAttendanceType }

const DEFAULT_SHIFT_START_MINUTES = 8 * 60
const DEFAULT_SHIFT_END_MINUTES = 20 * 60
const DEFAULT_SHIFT_END_LABEL = '08:00 PM'
const DEFAULT_SHIFT_START_LABEL = '08:00 AM'
const SHIFT_TIME_RE = /(\d{1,2}):(\d{2})\s*(AM|PM)/gi
/** Check Out becomes available this many ms after check-in */
const CHECKOUT_UNLOCK_AFTER_MS = 10_000
/** Shown when city/store/shift is unknown (loading failure or no data yet). */
const PLACEHOLDER = '-'

type ShiftBounds = {
  startMinutes: number
  endMinutes: number
  startLabel: string
  endLabel: string
}

function parseClockToken(hour: string, minute: string, ampm: string): number {
  let h = Number.parseInt(hour, 10) % 12
  if (ampm.toUpperCase() === 'PM') h += 12
  return h * 60 + Number.parseInt(minute, 10)
}

function formatClockLabel(hour: string, minute: string, ampm: string): string {
  const h = Number.parseInt(hour, 10)
  return `${String(h).padStart(2, '0')}:${minute} ${ampm.toUpperCase()}`
}

function parseShiftBounds(label: string): ShiftBounds | null {
  const parts = [...(label || '').matchAll(SHIFT_TIME_RE)]
  if (parts.length === 0) return null

  const startMinutes = parseClockToken(parts[0][1], parts[0][2], parts[0][3])
  const endMinutes =
    parts.length >= 2
      ? parseClockToken(parts[1][1], parts[1][2], parts[1][3])
      : DEFAULT_SHIFT_END_MINUTES

  return {
    startMinutes,
    endMinutes,
    startLabel: formatClockLabel(parts[0][1], parts[0][2], parts[0][3]),
    endLabel:
      parts.length >= 2
        ? formatClockLabel(parts[1][1], parts[1][2], parts[1][3])
        : DEFAULT_SHIFT_END_LABEL,
  }
}

function defaultShiftBounds(): ShiftBounds {
  return {
    startMinutes: DEFAULT_SHIFT_START_MINUTES,
    endMinutes: DEFAULT_SHIFT_END_MINUTES,
    startLabel: DEFAULT_SHIFT_START_LABEL,
    endLabel: DEFAULT_SHIFT_END_LABEL,
  }
}

function resolveShiftBounds(shiftLabel: string): ShiftBounds {
  return parseShiftBounds(shiftLabel) ?? defaultShiftBounds()
}

export type BaShiftState = {
  city: string
  storeLabel: string
  shiftLabel: string
  shiftEndLabel: string
  storeLat: number | null
  storeLng: number | null
  checkInLat: number | null
  checkInLng: number | null
  checkOutLat: number | null
  checkOutLng: number | null
  hasShift: boolean
  shiftMessage: string | null
  loading: boolean
  busy: boolean
  error: string | null
  /** Geofence / GPS popup message (store region). */
  regionNotice: string | null
  clearRegionNotice: () => void
  upcoming: BaUpcomingShift[]
  checkedIn: boolean
  checkedOut: boolean
  checkInAt: Date | null
  canCheckOut: boolean
  reportSubmitted: boolean
  isEarlyCheckout: boolean
  attendanceType: BaAttendanceType | null
  isTrainingAttendance: boolean
  checkIn: (type?: BaAttendanceType) => void
  checkOut: (earlyLeaveReason?: string) => void
  markReportSubmitted: () => void
  refresh: () => Promise<void>
}

export function regionMessageFromError(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null
  const body = err.body as { code?: string; detail?: string } | null
  const code = body && typeof body === 'object' ? body.code : undefined
  if (code === 'outside_store_region' || code === 'store_region_gps_required') {
    return err.message
  }
  const msg = err.message || ''
  if (/outside the store region|location is required to check/i.test(msg)) {
    return msg
  }
  return null
}

const BaShiftContext = createContext<BaShiftState | null>(null)

export function isAtOrPastShiftEnd(now: Date, shiftLabel = '') {
  const { startMinutes, endMinutes } = resolveShiftBounds(shiftLabel)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  // Overnight shift (e.g. 10:00 PM – 06:00 AM): past end when between end and start.
  if (endMinutes < startMinutes) {
    return nowMinutes >= endMinutes && nowMinutes < startMinutes
  }

  return nowMinutes >= endMinutes
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normalizeAttendanceType(raw: unknown): BaAttendanceType | null {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'store' || v === 'training') return v
  return null
}

function applyTodayShift(
  data: BaTodayShiftResponse,
  set: {
    hasShift: (v: boolean) => void
    shiftMessage: (v: string | null) => void
    city: (v: string) => void
    storeLabel: (v: string) => void
    shiftLabel: (v: string) => void
    storeLat: (v: number | null) => void
    storeLng: (v: number | null) => void
    checkInLat: (v: number | null) => void
    checkInLng: (v: number | null) => void
    checkOutLat: (v: number | null) => void
    checkOutLng: (v: number | null) => void
    upcoming: (v: BaUpcomingShift[]) => void
    checkedIn: (v: boolean) => void
    checkInAt: (v: Date | null) => void
    checkedOut: (v: boolean) => void
    reportSubmitted: (v: boolean) => void
    attendanceType: (v: BaAttendanceType | null) => void
  },
) {
  const shift = data.shift
  set.hasShift(data.has_shift)
  set.shiftMessage(data.message)
  set.upcoming(data.upcoming || [])

  if (!shift) {
    set.city(data.ambassador.city || PLACEHOLDER)
    set.storeLabel(
      data.ambassador.store_name
        ? data.ambassador.store_id
          ? `#${data.ambassador.store_id} ${data.ambassador.store_name}`
          : data.ambassador.store_name
        : PLACEHOLDER,
    )
    set.shiftLabel('No shift today')
    set.storeLat(numOrNull(data.ambassador.storeLat))
    set.storeLng(numOrNull(data.ambassador.storeLng))
    set.checkInLat(null)
    set.checkInLng(null)
    set.checkOutLat(null)
    set.checkOutLng(null)
    set.checkedIn(false)
    set.checkInAt(null)
    set.checkedOut(false)
    set.attendanceType(null)
    return
  }

  set.city(shift.city || PLACEHOLDER)
  set.storeLabel(
    shift.storeLabel ||
      (shift.storeName
        ? shift.city
          ? `${shift.storeName}, ${shift.city}`
          : shift.storeName
        : PLACEHOLDER),
  )
  set.shiftLabel(shift.shift || PLACEHOLDER)
  set.storeLat(numOrNull(shift.storeLat))
  set.storeLng(numOrNull(shift.storeLng))
  set.checkInLat(numOrNull(shift.checkInLat))
  set.checkInLng(numOrNull(shift.checkInLng))
  set.checkOutLat(numOrNull(shift.checkOutLat))
  set.checkOutLng(numOrNull(shift.checkOutLng))
  set.checkedIn(!!shift.checkedIn)
  set.checkInAt(shift.checkedInAt ? new Date(shift.checkedInAt) : null)
  set.checkedOut(!!shift.checkedOut)
  set.attendanceType(normalizeAttendanceType(shift.baAttendanceType))
  if (shift.checkedOut) set.reportSubmitted(true)
}

export function BaShiftProvider({
  children,
  inviteToken,
  enabled = true,
}: {
  children: ReactNode
  inviteToken?: string | null
  enabled?: boolean
}) {
  const apiMode = Boolean(enabled && inviteToken && !inviteToken.startsWith('demo-'))

  const [now, setNow] = useState(() => new Date())
  const [loading, setLoading] = useState(apiMode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [regionNotice, setRegionNotice] = useState<string | null>(null)
  const [hasShift, setHasShift] = useState(!apiMode)
  const [shiftMessage, setShiftMessage] = useState<string | null>(null)
  const [city, setCity] = useState(PLACEHOLDER)
  const [storeLabel, setStoreLabel] = useState(PLACEHOLDER)
  const [shiftLabel, setShiftLabel] = useState(PLACEHOLDER)
  const [storeLat, setStoreLat] = useState<number | null>(null)
  const [storeLng, setStoreLng] = useState<number | null>(null)
  const [checkInLat, setCheckInLat] = useState<number | null>(null)
  const [checkInLng, setCheckInLng] = useState<number | null>(null)
  const [checkOutLat, setCheckOutLat] = useState<number | null>(null)
  const [checkOutLng, setCheckOutLng] = useState<number | null>(null)
  const [upcoming, setUpcoming] = useState<BaUpcomingShift[]>([])
  const [checkedIn, setCheckedIn] = useState(false)
  const [checkInAt, setCheckInAt] = useState<Date | null>(null)
  const [checkedOut, setCheckedOut] = useState(false)
  const [reportSubmitted, setReportSubmitted] = useState(false)
  const [attendanceType, setAttendanceType] = useState<BaAttendanceType | null>(null)

  const applySetters = useMemo(
    () => ({
      hasShift: setHasShift,
      shiftMessage: setShiftMessage,
      city: setCity,
      storeLabel: setStoreLabel,
      shiftLabel: setShiftLabel,
      storeLat: setStoreLat,
      storeLng: setStoreLng,
      checkInLat: setCheckInLat,
      checkInLng: setCheckInLng,
      checkOutLat: setCheckOutLat,
      checkOutLng: setCheckOutLng,
      upcoming: setUpcoming,
      checkedIn: setCheckedIn,
      checkInAt: setCheckInAt,
      checkedOut: setCheckedOut,
      reportSubmitted: setReportSubmitted,
      attendanceType: setAttendanceType,
    }),
    [],
  )

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const refresh = useCallback(async () => {
    if (!apiMode || !inviteToken) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      applyTodayShift(await fetchBaTodayShift(inviteToken), applySetters)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load today's shift")
      setHasShift(false)
      setShiftMessage('Could not load shift from server.')
      setCity(PLACEHOLDER)
      setStoreLabel(PLACEHOLDER)
      setShiftLabel(PLACEHOLDER)
      setStoreLat(null)
      setStoreLng(null)
      setCheckInLat(null)
      setCheckInLng(null)
      setCheckOutLat(null)
      setCheckOutLng(null)
      setUpcoming([])
      setCheckedIn(false)
      setCheckInAt(null)
      setCheckedOut(false)
      setAttendanceType(null)
    } finally {
      setLoading(false)
    }
  }, [apiMode, inviteToken, applySetters])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const isTrainingAttendance = attendanceType === 'training'
  const shiftBounds = useMemo(() => resolveShiftBounds(shiftLabel), [shiftLabel])
  const atShiftEnd = isAtOrPastShiftEnd(now, shiftLabel)
  // Training checkout skips early-leave + report forms.
  const isEarlyCheckout =
    checkedIn && !checkedOut && !atShiftEnd && attendanceType !== 'training'
  const canCheckOut =
    checkedIn &&
    !checkedOut &&
    (isTrainingAttendance || !reportSubmitted) &&
    !!checkInAt &&
    now.getTime() - checkInAt.getTime() >= CHECKOUT_UNLOCK_AFTER_MS

  const clearRegionNotice = useCallback(() => setRegionNotice(null), [])

  const checkIn = useCallback(
    (type: BaAttendanceType = 'store') => {
      if (apiMode && inviteToken) {
        if (!hasShift || checkedIn || checkedOut || busy) return
        setBusy(true)
        setError(null)
        setRegionNotice(null)
        void baCheckInApi(inviteToken, type)
          .then((data) => applyTodayShift(data, applySetters))
          .catch((err) => {
            const region = regionMessageFromError(err)
            if (region) {
              setRegionNotice(region)
              setError(null)
            } else {
              setError(err instanceof Error ? err.message : 'Check-in failed')
            }
          })
          .finally(() => setBusy(false))
        return
      }
      if (checkedOut) return
      setCheckedIn(true)
      setCheckInAt(new Date())
      setCheckedOut(false)
      setReportSubmitted(false)
      setAttendanceType(type)
    },
    [apiMode, inviteToken, hasShift, checkedIn, checkedOut, busy, applySetters],
  )

  const checkOut = useCallback(
    (earlyLeaveReason?: string) => {
      if (apiMode && inviteToken) {
        if (!checkedIn || checkedOut || busy) return
        setBusy(true)
        setError(null)
        setRegionNotice(null)
        void baCheckOutApi(inviteToken, earlyLeaveReason)
          .then((data) => {
            applyTodayShift(data, applySetters)
            setReportSubmitted(true)
          })
          .catch((err) => {
            const region = regionMessageFromError(err)
            if (region) {
              setRegionNotice(region)
              setError(null)
            } else {
              setError(err instanceof Error ? err.message : 'Check-out failed')
            }
          })
          .finally(() => setBusy(false))
        return
      }
      setCheckedOut(true)
    },
    [apiMode, inviteToken, checkedIn, checkedOut, busy, applySetters],
  )

  const markReportSubmitted = useCallback(() => {
    setReportSubmitted(true)
  }, [])

  const shiftEndLabel = shiftBounds.endLabel
  const displayShiftLabel =
    shiftLabel || `${shiftBounds.startLabel} – ${shiftBounds.endLabel}`

  const value = useMemo(
    () => ({
      city,
      storeLabel,
      shiftLabel: displayShiftLabel,
      shiftEndLabel,
      storeLat,
      storeLng,
      checkInLat,
      checkInLng,
      checkOutLat,
      checkOutLng,
      hasShift,
      shiftMessage,
      loading,
      busy,
      error,
      regionNotice,
      clearRegionNotice,
      upcoming,
      checkedIn,
      checkedOut,
      checkInAt,
      canCheckOut,
      reportSubmitted,
      isEarlyCheckout,
      attendanceType,
      isTrainingAttendance,
      checkIn,
      checkOut,
      markReportSubmitted,
      refresh,
    }),
    [
      city,
      storeLabel,
      displayShiftLabel,
      shiftEndLabel,
      storeLat,
      storeLng,
      checkInLat,
      checkInLng,
      checkOutLat,
      checkOutLng,
      hasShift,
      shiftMessage,
      loading,
      busy,
      error,
      regionNotice,
      clearRegionNotice,
      upcoming,
      checkedIn,
      checkedOut,
      checkInAt,
      canCheckOut,
      reportSubmitted,
      isEarlyCheckout,
      attendanceType,
      isTrainingAttendance,
      checkIn,
      checkOut,
      markReportSubmitted,
      refresh,
    ],
  )

  return <BaShiftContext.Provider value={value}>{children}</BaShiftContext.Provider>
}

export function useBaShift() {
  const ctx = useContext(BaShiftContext)
  if (!ctx) throw new Error('useBaShift must be used within BaShiftProvider')
  return ctx
}

export function formatTime(date: Date) {
  return date.toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

export function formatDate(date: Date) {
  return date.toLocaleDateString('en-PK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatCoord(value: number | null | undefined, digits = 5) {
  if (value == null || Number.isNaN(value)) return null
  return value.toFixed(digits)
}
