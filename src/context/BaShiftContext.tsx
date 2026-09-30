import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  baCheckInApi,
  baCheckOutApi,
  fetchBaTodayShift,
  type BaTodayShiftResponse,
  type BaUpcomingShift,
} from '../lib/baAttendanceApi'

const SHIFT_START_HOUR = 8
const SHIFT_END_HOUR = 20
const SHIFT_END_MINUTE = 0
/** Check Out becomes available this many ms after check-in */
const CHECKOUT_UNLOCK_AFTER_MS = 10_000
const FALLBACK_CITY = 'Lahore'

export type BaShiftState = {
  city: string
  storeLabel: string
  shiftLabel: string
  shiftEndLabel: string
  storeLat: number | null
  storeLng: number | null
  checkInLat: number | null
  checkInLng: number | null
  hasShift: boolean
  shiftMessage: string | null
  loading: boolean
  busy: boolean
  error: string | null
  upcoming: BaUpcomingShift[]
  checkedIn: boolean
  checkedOut: boolean
  checkInAt: Date | null
  canCheckOut: boolean
  reportSubmitted: boolean
  isEarlyCheckout: boolean
  checkIn: () => void
  checkOut: (earlyLeaveReason?: string) => void
  markReportSubmitted: () => void
  refresh: () => Promise<void>
}

const BaShiftContext = createContext<BaShiftState | null>(null)

export function isAtOrPastShiftEnd(now: Date) {
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= SHIFT_END_HOUR * 60 + SHIFT_END_MINUTE
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
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
    upcoming: (v: BaUpcomingShift[]) => void
    checkedIn: (v: boolean) => void
    checkInAt: (v: Date | null) => void
    checkedOut: (v: boolean) => void
    reportSubmitted: (v: boolean) => void
  },
) {
  const shift = data.shift
  set.hasShift(data.has_shift)
  set.shiftMessage(data.message)
  set.upcoming(data.upcoming || [])

  if (!shift) {
    set.city(data.ambassador.city || FALLBACK_CITY)
    set.storeLabel(
      data.ambassador.store_name
        ? data.ambassador.store_id
          ? `#${data.ambassador.store_id} ${data.ambassador.store_name}`
          : data.ambassador.store_name
        : 'No store assigned',
    )
    set.shiftLabel('No shift today')
    set.storeLat(numOrNull(data.ambassador.storeLat))
    set.storeLng(numOrNull(data.ambassador.storeLng))
    set.checkInLat(null)
    set.checkInLng(null)
    set.checkedIn(false)
    set.checkInAt(null)
    set.checkedOut(false)
    return
  }

  set.city(shift.city || FALLBACK_CITY)
  set.storeLabel(shift.storeLabel || `${shift.storeName}, ${shift.city}`)
  set.shiftLabel(shift.shift || 'Shift')
  set.storeLat(numOrNull(shift.storeLat))
  set.storeLng(numOrNull(shift.storeLng))
  set.checkInLat(numOrNull(shift.checkInLat))
  set.checkInLng(numOrNull(shift.checkInLng))
  set.checkedIn(!!shift.checkedIn)
  set.checkInAt(shift.checkedInAt ? new Date(shift.checkedInAt) : null)
  set.checkedOut(!!shift.checkedOut)
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
  const [hasShift, setHasShift] = useState(!apiMode)
  const [shiftMessage, setShiftMessage] = useState<string | null>(null)
  const [city, setCity] = useState(FALLBACK_CITY)
  const [storeLabel, setStoreLabel] = useState(`Store #12, ${FALLBACK_CITY}`)
  const [shiftLabel, setShiftLabel] = useState('')
  const [storeLat, setStoreLat] = useState<number | null>(null)
  const [storeLng, setStoreLng] = useState<number | null>(null)
  const [checkInLat, setCheckInLat] = useState<number | null>(null)
  const [checkInLng, setCheckInLng] = useState<number | null>(null)
  const [upcoming, setUpcoming] = useState<BaUpcomingShift[]>([])
  const [checkedIn, setCheckedIn] = useState(false)
  const [checkInAt, setCheckInAt] = useState<Date | null>(null)
  const [checkedOut, setCheckedOut] = useState(false)
  const [reportSubmitted, setReportSubmitted] = useState(false)

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
      upcoming: setUpcoming,
      checkedIn: setCheckedIn,
      checkInAt: setCheckInAt,
      checkedOut: setCheckedOut,
      reportSubmitted: setReportSubmitted,
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
    } finally {
      setLoading(false)
    }
  }, [apiMode, inviteToken, applySetters])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const atShiftEnd = isAtOrPastShiftEnd(now)
  const isEarlyCheckout = checkedIn && !checkedOut && !atShiftEnd
  const canCheckOut =
    checkedIn &&
    !checkedOut &&
    !reportSubmitted &&
    !!checkInAt &&
    now.getTime() - checkInAt.getTime() >= CHECKOUT_UNLOCK_AFTER_MS

  const checkIn = useCallback(() => {
    if (apiMode && inviteToken) {
      if (!hasShift || checkedIn || checkedOut || busy) return
      setBusy(true)
      setError(null)
      void baCheckInApi(inviteToken)
        .then((data) => applyTodayShift(data, applySetters))
        .catch((err) => setError(err instanceof Error ? err.message : 'Check-in failed'))
        .finally(() => setBusy(false))
      return
    }
    if (checkedOut) return
    setCheckedIn(true)
    setCheckInAt(new Date())
    setCheckedOut(false)
    setReportSubmitted(false)
  }, [apiMode, inviteToken, hasShift, checkedIn, checkedOut, busy, applySetters])

  const checkOut = useCallback(
    (earlyLeaveReason?: string) => {
      if (apiMode && inviteToken) {
        if (!checkedIn || checkedOut || busy) return
        setBusy(true)
        setError(null)
        void baCheckOutApi(inviteToken, earlyLeaveReason)
          .then((data) => {
            applyTodayShift(data, applySetters)
            setReportSubmitted(true)
          })
          .catch((err) => setError(err instanceof Error ? err.message : 'Check-out failed'))
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

  const shiftEndLabel = `${String(SHIFT_END_HOUR % 12 || 12).padStart(2, '0')}:${String(
    SHIFT_END_MINUTE,
  ).padStart(2, '0')} PM`
  const displayShiftLabel =
    shiftLabel || `${String(SHIFT_START_HOUR).padStart(2, '0')}:00 AM – ${shiftEndLabel}`

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
      hasShift,
      shiftMessage,
      loading,
      busy,
      error,
      upcoming,
      checkedIn,
      checkedOut,
      checkInAt,
      canCheckOut,
      reportSubmitted,
      isEarlyCheckout,
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
      hasShift,
      shiftMessage,
      loading,
      busy,
      error,
      upcoming,
      checkedIn,
      checkedOut,
      checkInAt,
      canCheckOut,
      reportSubmitted,
      isEarlyCheckout,
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
