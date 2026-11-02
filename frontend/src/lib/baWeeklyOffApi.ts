import { apiRequest } from './api'

export type BaWeeklyOffDay = {
  day: string
  label: string
  date: string
  dateLabel: string
  past?: boolean
  selectable?: boolean
}

export type BaWeeklyOffPayload = {
  weekStart: string
  weekEnd: string
  today: string
  days: BaWeeklyOffDay[]
  offDay: string | null
  offDate: string | null
  locked: boolean
  status: string
}

export async function fetchBaWeeklyOff(token: string): Promise<BaWeeklyOffPayload> {
  return apiRequest<BaWeeklyOffPayload>(
    `/api/ba/weekly-off/?token=${encodeURIComponent(token)}`,
  )
}

export async function saveBaWeeklyOff(
  token: string,
  offDay: string,
): Promise<BaWeeklyOffPayload> {
  return apiRequest<BaWeeklyOffPayload>(`/api/ba/weekly-off/`, {
    method: 'POST',
    body: { token, offDay },
  })
}
