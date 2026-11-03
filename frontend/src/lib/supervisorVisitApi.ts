/** Supervisor store visit check-in / check-out API client. */

import { apiRequest, ApiError } from './api'
import {
  GeoRequiredError,
  readGeoRequired,
  type GeoCoords,
} from './baAttendanceApi'

export type SupervisorStoreVisit = {
  id: number
  storeId: number
  storeName: string
  storeCity: string
  checkedInAt: string | null
  checkedOutAt: string | null
  isOpen: boolean
  checkInLat: number
  checkInLng: number
  checkInAccuracyM?: number | null
  checkOutLat?: number | null
  checkOutLng?: number | null
  checkOutAccuracyM?: number | null
  checkInPhotoUrl?: string | null
}

export type SupervisorVisitsResponse = {
  date: string
  openVisit: SupervisorStoreVisit | null
  visits: SupervisorStoreVisit[]
}

export async function fetchSupervisorVisits(date?: string) {
  const q = date ? `?date=${encodeURIComponent(date)}` : ''
  return apiRequest<SupervisorVisitsResponse>(`/api/supervisor/me/visits/${q}`)
}

export async function supervisorVisitCheckIn(params: {
  storeId: number
  photo: Blob
  geo: GeoCoords
}) {
  const form = new FormData()
  form.append('storeId', String(params.storeId))
  form.append('lat', String(params.geo.latitude))
  form.append('lng', String(params.geo.longitude))
  if (typeof params.geo.accuracy === 'number') {
    form.append('accuracy', String(params.geo.accuracy))
  }
  const filename =
    params.photo.type === 'image/png'
      ? 'checkin.png'
      : params.photo.type === 'image/webp'
        ? 'checkin.webp'
        : 'checkin.jpg'
  form.append('photo', params.photo, filename)
  return apiRequest<SupervisorStoreVisit>('/api/supervisor/me/visits/check-in/', {
    method: 'POST',
    formData: form,
  })
}

export async function supervisorVisitCheckOut(params: {
  visitId?: number
  geo: GeoCoords
}) {
  return apiRequest<SupervisorStoreVisit>('/api/supervisor/me/visits/check-out/', {
    method: 'POST',
    body: {
      visitId: params.visitId,
      lat: params.geo.latitude,
      lng: params.geo.longitude,
      accuracy: params.geo.accuracy,
    },
  })
}

export async function checkInWithGeo(storeId: number, photo: Blob) {
  const geo = await readGeoRequired()
  return supervisorVisitCheckIn({ storeId, photo, geo })
}

export async function checkOutWithGeo(visitId?: number) {
  const geo = await readGeoRequired()
  return supervisorVisitCheckOut({ visitId, geo })
}

export function visitApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof GeoRequiredError) return err.message
  if (err instanceof ApiError) return err.message
  if (err instanceof TypeError) {
    return 'Network issue. Check your internet connection and try again.'
  }
  if (err instanceof Error) return err.message || fallback
  return fallback
}
