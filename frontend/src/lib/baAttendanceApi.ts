import { apiRequest, ApiError } from './api'

export type BaAttendanceType = 'store' | 'training'

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
  baAttendanceType?: BaAttendanceType | string | null
  checkInLat?: number | null
  checkInLng?: number | null
  checkOutLat?: number | null
  checkOutLng?: number | null
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

export type GeoCoords = {
  latitude: number
  longitude: number
  accuracy?: number
}

/** Thrown when GPS is required but unavailable. */
export class GeoRequiredError extends Error {
  code: 'unsupported' | 'permission' | 'unavailable' | 'timeout'

  constructor(code: GeoRequiredError['code'], message: string) {
    super(message)
    this.name = 'GeoRequiredError'
    this.code = code
  }
}

const LOCATION_OFF_MSG =
  'Location access is off or blocked. Turn on location for this browser/app, allow access when prompted, then try again.'

const LOCATION_TIMEOUT_MSG =
  'Could not get your location in time. Check that GPS/location is on and you have a signal, then try again.'

const LOCATION_UNAVAILABLE_MSG =
  'Location is unavailable right now. Turn on location services and try again.'

const NETWORK_MSG =
  'Network issue. Check your internet connection and try again.'

export function isLocationOrNetworkErrorMessage(msg: string): boolean {
  const m = (msg || '').toLowerCase()
  return (
    m.includes('location') ||
    m.includes('gps') ||
    m.includes('network issue') ||
    m.includes('internet') ||
    m.includes('failed to fetch')
  )
}

export function readGeoRequired(): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(
        new GeoRequiredError(
          'unsupported',
          'This device/browser does not support location. Use a phone or browser with GPS enabled.',
        ),
      )
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        if (
          typeof latitude !== 'number' ||
          typeof longitude !== 'number' ||
          Number.isNaN(latitude) ||
          Number.isNaN(longitude)
        ) {
          reject(new GeoRequiredError('unavailable', LOCATION_UNAVAILABLE_MSG))
          return
        }
        resolve({ latitude, longitude, accuracy })
      },
      (err) => {
        const code = err?.code
        if (code === 1) {
          // PERMISSION_DENIED
          reject(new GeoRequiredError('permission', LOCATION_OFF_MSG))
          return
        }
        if (code === 3) {
          // TIMEOUT
          reject(new GeoRequiredError('timeout', LOCATION_TIMEOUT_MSG))
          return
        }
        // POSITION_UNAVAILABLE or unknown
        reject(new GeoRequiredError('unavailable', LOCATION_UNAVAILABLE_MSG))
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )
  })
}

function mapAttendanceError(err: unknown, fallback: string): Error {
  if (err instanceof GeoRequiredError) return err
  if (err instanceof ApiError) {
    return err
  }
  if (err instanceof TypeError) {
    // fetch() network failures often surface as TypeError: Failed to fetch
    return new Error(NETWORK_MSG)
  }
  if (err instanceof Error) {
    const low = err.message.toLowerCase()
    if (
      low.includes('failed to fetch') ||
      low.includes('networkerror') ||
      low.includes('network request failed') ||
      low.includes('load failed')
    ) {
      return new Error(NETWORK_MSG)
    }
    return err
  }
  return new Error(fallback)
}

export async function fetchBaTodayShift(token: string) {
  return apiRequest<BaTodayShiftResponse>(
    `/api/ba/today-shift/?token=${encodeURIComponent(token)}`,
    { auth: false },
  )
}

export async function baCheckInApi(
  token: string,
  attendanceType: BaAttendanceType = 'store',
  photo?: Blob,
) {
  try {
    if (!photo || photo.size < 1) {
      throw new Error('Could not capture photo. Try again.')
    }
    const geo = await readGeoRequired()
    const form = new FormData()
    form.append('token', token)
    form.append('attendance_type', attendanceType)
    form.append('latitude', String(geo.latitude))
    form.append('longitude', String(geo.longitude))
    if (typeof geo.accuracy === 'number') {
      form.append('accuracy', String(geo.accuracy))
    }
    const filename =
      photo.type === 'image/png'
        ? 'checkin.png'
        : photo.type === 'image/webp'
          ? 'checkin.webp'
          : 'checkin.jpg'
    form.append('photo', photo, filename)
    return await apiRequest<BaTodayShiftResponse>('/api/ba/check-in/', {
      method: 'POST',
      auth: false,
      formData: form,
    })
  } catch (err) {
    throw mapAttendanceError(err, 'Check-in failed')
  }
}

export async function baCheckOutApi(token: string, earlyLeaveReason?: string) {
  try {
    const geo = await readGeoRequired()
    return await apiRequest<BaTodayShiftResponse>('/api/ba/check-out/', {
      method: 'POST',
      auth: false,
      body: {
        token,
        ...geo,
        ...(earlyLeaveReason?.trim()
          ? { early_leave_reason: earlyLeaveReason.trim() }
          : {}),
      },
    })
  } catch (err) {
    throw mapAttendanceError(err, 'Check-out failed')
  }
}
