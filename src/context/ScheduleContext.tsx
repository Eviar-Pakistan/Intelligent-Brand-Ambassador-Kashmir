import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { initialSchedule, type ShiftSlot } from '../data/mock'
import {
  apiShiftToSlot,
  buildWeekDays,
  fetchMonthShifts,
  fetchWeekShifts,
  mondayOf,
  toIsoDate,
  type WeekDay,
} from '../lib/deploymentApi'
import { isApiAuthenticated } from '../lib/api'

type ScheduleContextValue = {
  schedule: ShiftSlot[]
  setSchedule: Dispatch<SetStateAction<ShiftSlot[]>>
  weekDays: WeekDay[]
  weekLabel: string
  loading: boolean
  refreshSchedule: (weekOrMonth?: string) => Promise<void>
  addShift: (slot: Omit<ShiftSlot, 'id'> & { id?: string }) => ShiftSlot
  clearBaFromSlot: (id: string) => void
}

const ScheduleContext = createContext<ScheduleContextValue | null>(null)

export function formatTime12(hhmm: string) {
  const [hRaw, mRaw] = hhmm.split(':')
  const h = Number(hRaw)
  const m = Number(mRaw)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export function shiftLabelFromTimes(start: string, end: string) {
  return `${formatTime12(start)} – ${formatTime12(end)}`
}

/** Parse "12:00 PM – 3:00 PM" (or en-dash) back to 24h HH:mm for time inputs. */
export function parseShiftLabelTimes(label: string): { start: string; end: string } | null {
  const parts = label.split(/\s*[–-]\s*/).map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const to24 = (text: string): string | null => {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(text.trim())
    if (!m) {
      const m24 = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
      if (!m24) return null
      const h = Number(m24[1])
      const mm = Number(m24[2])
      if (h > 23 || mm > 59) return null
      return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    }
    let h = Number(m[1])
    const mm = Number(m[2])
    const ap = m[3].toUpperCase()
    if (ap === 'PM' && h < 12) h += 12
    if (ap === 'AM' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }
  const start = to24(parts[0])
  const end = to24(parts[1])
  if (!start || !end) return null
  return { start, end }
}

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [schedule, setSchedule] = useState<ShiftSlot[]>([])
  const [weekDays, setWeekDays] = useState<WeekDay[]>(buildWeekDays())
  const [weekLabel, setWeekLabel] = useState('This week')
  const [loading, setLoading] = useState(false)

  const refreshSchedule = useCallback(async (weekOrMonth?: string) => {
    // YYYY-MM → month board; YYYY-MM-DD → week board; empty → current week
    const isMonth = Boolean(weekOrMonth && /^\d{4}-\d{2}$/.test(weekOrMonth))
    if (!isApiAuthenticated()) {
      setSchedule(initialSchedule)
      setWeekDays(buildWeekDays())
      setWeekLabel('Demo week (sign in to sync)')
      return
    }
    setLoading(true)
    try {
      const data = isMonth
        ? await fetchMonthShifts(weekOrMonth!)
        : await fetchWeekShifts(weekOrMonth)
      setWeekLabel(data.week_label)
      setWeekDays(
        data.days?.length
          ? data.days.map((d) => ({
              key: d.key,
              label: d.label || d.key,
              date: d.date,
              iso: d.iso,
            }))
          : buildWeekDays(new Date((data.week_start || toIsoDate(mondayOf())) + 'T12:00:00')),
      )
      setSchedule((data.results || []).map(apiShiftToSlot))
    } catch {
      setWeekDays(buildWeekDays())
      setWeekLabel('Could not load shifts')
      setSchedule([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshSchedule()
  }, [refreshSchedule])

  const addShift = useCallback((slot: Omit<ShiftSlot, 'id'> & { id?: string }) => {
    const next: ShiftSlot = {
      ...slot,
      id: slot.id ?? `s${Date.now()}`,
    }
    setSchedule((prev) => [...prev, next])
    return next
  }, [])

  const clearBaFromSlot = useCallback((id: string) => {
    setSchedule((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, baId: null, baName: null, status: 'Open' as const } : s,
      ),
    )
  }, [])

  const value = useMemo(
    () => ({
      schedule,
      setSchedule,
      weekDays,
      weekLabel,
      loading,
      refreshSchedule,
      addShift,
      clearBaFromSlot,
    }),
    [schedule, weekDays, weekLabel, loading, refreshSchedule, addShift, clearBaFromSlot],
  )

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>
}

export function useSchedule() {
  const ctx = useContext(ScheduleContext)
  if (!ctx) throw new Error('useSchedule must be used within ScheduleProvider')
  return ctx
}
