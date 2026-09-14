import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { initialSchedule, type ShiftSlot } from '../data/mock'

type ScheduleContextValue = {
  schedule: ShiftSlot[]
  setSchedule: Dispatch<SetStateAction<ShiftSlot[]>>
  addShift: (slot: Omit<ShiftSlot, 'id'> & { id?: string }) => ShiftSlot
  updateShift: (id: string, patch: Partial<ShiftSlot>) => void
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

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [schedule, setSchedule] = useState<ShiftSlot[]>(initialSchedule)

  const addShift = useCallback((slot: Omit<ShiftSlot, 'id'> & { id?: string }) => {
    const next: ShiftSlot = {
      ...slot,
      id: slot.id ?? `s${Date.now()}`,
    }
    setSchedule((prev) => [...prev, next])
    return next
  }, [])

  const updateShift = useCallback((id: string, patch: Partial<ShiftSlot>) => {
    setSchedule((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }, [])

  const clearBaFromSlot = useCallback((id: string) => {
    setSchedule((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, baId: null, baName: null, status: 'Open' as const } : s,
      ),
    )
  }, [])

  const value = useMemo(
    () => ({ schedule, setSchedule, addShift, updateShift, clearBaFromSlot }),
    [schedule, addShift, updateShift, clearBaFromSlot],
  )

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>
}

export function useSchedule() {
  const ctx = useContext(ScheduleContext)
  if (!ctx) throw new Error('useSchedule must be used within ScheduleProvider')
  return ctx
}
