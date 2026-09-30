import { apiRequest } from './api'

export type BaShiftPayload = {
  id: string
  date: string
  day: string
  shift: string
  storeId: number
  storeName: string
  city: string
  storeLabel: string
  peakRecommended?: boolean
  status: string
  checkedIn: boolean
  checkedOut: boolean
  isLive?: boolean
  checkedInAt: string | null
  checkedOutAt: string | null
  checkInLat?: number | null
  checkInLng?: number | null
  storeLat?: number | null
  storeLng?: number | null
}

export type BaUpcomingShift = {
  id: string
  date: string
  dateIso: string
  day: string
  shift: string
  storeId: number
  storeName: string
  city: string
  storeLabel: string
  checkedIn: boolean
  checkedOut: boolean
  isToday: boolean
}

export type BaTodayShiftResponse = {
  has_shift: boolean
  message: string | null
  shift: BaShiftPayload | null
  upcoming: BaUpcomingShift[]
  ambassador: {
    id: number
    name: string
    initials: string
    status: string
    store_id: number | null
    store_name: string | null
    city?: string | null
    storeLat?: number | null
    storeLng?: number | null
  }
}

function readGeo(): Promise<{ latitude?: number; longitude?: number; accuracy?: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({})
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    )
  })
}

export async function fetchBaTodayShift(token: string) {
  return apiRequest<BaTodayShiftResponse>(
    `/api/ba/today-shift/?token=${encodeURIComponent(token)}`,
    { auth: false },
  )
}

export async function baCheckInApi(token: string) {
  const geo = await readGeo()
  return apiRequest<BaTodayShiftResponse>('/api/ba/check-in/', {
    method: 'POST',
    auth: false,
    body: { token, ...geo },
  })
}

export async function baCheckOutApi(token: string, earlyLeaveReason?: string) {
  return apiRequest<BaTodayShiftResponse>('/api/ba/check-out/', {
    method: 'POST',
    auth: false,
    body: {
      token,
      ...(earlyLeaveReason?.trim()
        ? { early_leave_reason: earlyLeaveReason.trim() }
        : {}),
    },
  })
}
