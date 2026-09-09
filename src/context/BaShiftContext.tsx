import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const SHIFT_START_HOUR = 8
const SHIFT_END_HOUR = 20
const SHIFT_END_MINUTE = 0
/** Demo unlock: Check Out becomes available this many ms after check-in */
const CHECKOUT_UNLOCK_AFTER_MS = 10_000
const CITY = 'Lahore'

export type BaShiftState = {
  city: string
  shiftLabel: string
  shiftEndLabel: string
  checkedIn: boolean
  checkInAt: Date | null
  checkedOut: boolean
  checkOutAt: Date | null
  shiftEnded: boolean
  canCheckOut: boolean
  reportSubmitted: boolean
  checkIn: () => void
  endShift: () => void
  checkOut: () => void
  markReportSubmitted: () => void
  resetShift: () => void
}

const BaShiftContext = createContext<BaShiftState | null>(null)

/** Checkout unlocks only when the clock reaches (or passes) shift end time. */
export function isAtOrPastShiftEnd(now: Date) {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const endMinutes = SHIFT_END_HOUR * 60 + SHIFT_END_MINUTE
  return minutes >= endMinutes
}

export function BaShiftProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => new Date())
  const [checkedIn, setCheckedIn] = useState(false)
  const [checkInAt, setCheckInAt] = useState<Date | null>(null)
  const [checkedOut, setCheckedOut] = useState(false)
  const [checkOutAt, setCheckOutAt] = useState<Date | null>(null)
  const [assistShiftEnded, setAssistShiftEnded] = useState(false)
  const [reportSubmitted, setReportSubmitted] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const atShiftEnd = isAtOrPastShiftEnd(now)
  const canCheckOut =
    checkedIn &&
    !checkedOut &&
    !reportSubmitted &&
    !!checkInAt &&
    now.getTime() - checkInAt.getTime() >= CHECKOUT_UNLOCK_AFTER_MS
  const shiftEnded = atShiftEnd || assistShiftEnded || canCheckOut

  const checkIn = useCallback(() => {
    const t = new Date()
    setCheckedIn(true)
    setCheckInAt(t)
    setCheckedOut(false)
    setCheckOutAt(null)
    setReportSubmitted(false)
  }, [])

  const endShift = useCallback(() => {
    // Stops Assist live timer only; does not enable Check Out
    setAssistShiftEnded(true)
  }, [])

  const checkOut = useCallback(() => {
    setCheckedOut(true)
    setCheckOutAt(new Date())
  }, [])

  const markReportSubmitted = useCallback(() => {
    setReportSubmitted(true)
  }, [])

  const resetShift = useCallback(() => {
    setCheckedIn(false)
    setCheckInAt(null)
    setCheckedOut(false)
    setCheckOutAt(null)
    setAssistShiftEnded(false)
    setReportSubmitted(false)
  }, [])

  const shiftEndLabel = `${String(SHIFT_END_HOUR % 12 || 12).padStart(2, '0')}:${String(SHIFT_END_MINUTE).padStart(2, '0')} PM`

  const value = useMemo(
    () => ({
      city: CITY,
      shiftLabel: `${String(SHIFT_START_HOUR).padStart(2, '0')}:00 AM – ${shiftEndLabel}`,
      shiftEndLabel,
      checkedIn,
      checkInAt,
      checkedOut,
      checkOutAt,
      shiftEnded,
      canCheckOut,
      reportSubmitted,
      checkIn,
      endShift,
      checkOut,
      markReportSubmitted,
      resetShift,
    }),
    [
      shiftEndLabel,
      checkedIn,
      checkInAt,
      checkedOut,
      checkOutAt,
      shiftEnded,
      canCheckOut,
      reportSubmitted,
      checkIn,
      endShift,
      checkOut,
      markReportSubmitted,
      resetShift,
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
