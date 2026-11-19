/** Supervisor store visit check-in / check-out API client. */

import { apiRequest, ApiError } from './api'
import {
  GeoRequiredError,
  readGeoRequired,
  type GeoCoords,
} from './baAttendanceApi'
import {
  assertWithinStoreGeofence,
  deleteOfflineVisit,
  getOpenOfflineVisit,
  newOfflineLocalId,
  saveOfflineVisit,
  type OfflinePendingVisit,
} from './supervisorOfflineVisits'
import { findCreatedStore } from './storeRegistry'

/** Online attempt timeout before falling back to offline queue. */
export const VISIT_ONLINE_TIMEOUT_MS = 12_000

export type SupervisorStoreVisit = {
  id: number
  storeId: number
  storeName: string
  storeCity: string
  checkedInAt: string | null
  checkedOutAt: string | null
  isOpen: boolean
  checkInLat: number | null
  checkInLng: number | null
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

export type CheckInResult =
  | { mode: 'online'; visit: SupervisorStoreVisit }
  | { mode: 'offline'; pending: OfflinePendingVisit }

export type CheckOutResult =
  | { mode: 'online'; visit: SupervisorStoreVisit }
  | { mode: 'offline'; pending: OfflinePendingVisit }

function isNetworkishError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 0 || err.status === 408 || err.status >= 500
  }
  if (err instanceof TypeError) return true
  if (err instanceof Error) {
    const low = err.message.toLowerCase()
    return (
      low.includes('failed to fetch') ||
      low.includes('network') ||
      low.includes('timed out') ||
      low.includes('timeout') ||
      low.includes('load failed')
    )
  }
  return false
}

export async function fetchSupervisorVisits(date?: string) {
  const q = date ? `?date=${encodeURIComponent(date)}` : ''
  return apiRequest<SupervisorVisitsResponse>(`/api/supervisor/me/visits/${q}`)
}

export async function supervisorVisitCheckIn(params: {
  storeId: number
  photo: Blob
  geo: GeoCoords
  timeoutMs?: number
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
    timeoutMs: params.timeoutMs,
  })
}

export async function supervisorVisitCheckOut(params: {
  visitId?: number
  geo: GeoCoords
  timeoutMs?: number
}) {
  return apiRequest<SupervisorStoreVisit>('/api/supervisor/me/visits/check-out/', {
    method: 'POST',
    body: {
      visitId: params.visitId,
      lat: params.geo.latitude,
      lng: params.geo.longitude,
      accuracy: params.geo.accuracy,
    },
    timeoutMs: params.timeoutMs,
  })
}

/** Upload a pending offline visit — no geofence on server. */
export async function syncOfflineVisit(pending: OfflinePendingVisit) {
  const form = new FormData()
  form.append('storeId', String(pending.storeId))
  if (pending.serverVisitId) {
    form.append('visitId', String(pending.serverVisitId))
  }
  form.append('checkedInAt', pending.checkInAt)
  form.append('checkInLat', String(pending.checkInLat))
  form.append('checkInLng', String(pending.checkInLng))
  if (typeof pending.checkInAccuracy === 'number') {
    form.append('checkInAccuracy', String(pending.checkInAccuracy))
  }
  if (pending.checkInPhoto) {
    const filename =
      pending.checkInPhoto.type === 'image/png'
        ? 'checkin.png'
        : pending.checkInPhoto.type === 'image/webp'
          ? 'checkin.webp'
          : 'checkin.jpg'
    form.append('photo', pending.checkInPhoto, filename)
  }
  if (pending.checkOutAt) {
    form.append('checkedOutAt', pending.checkOutAt)
  }
  if (pending.checkOutLat != null) {
    form.append('checkOutLat', String(pending.checkOutLat))
  }
  if (pending.checkOutLng != null) {
    form.append('checkOutLng', String(pending.checkOutLng))
  }
  if (typeof pending.checkOutAccuracy === 'number') {
    form.append('checkOutAccuracy', String(pending.checkOutAccuracy))
  }
  return apiRequest<SupervisorStoreVisit>('/api/supervisor/me/visits/offline-sync/', {
    method: 'POST',
    formData: form,
    timeoutMs: 60_000,
  })
}

export async function submitOfflineVisit(localId: string) {
  const { getOfflineVisit } = await import('./supervisorOfflineVisits')
  const pending = await getOfflineVisit(localId)
  if (!pending) throw new Error('Offline visit not found.')
  const visit = await syncOfflineVisit(pending)
  await deleteOfflineVisit(localId)
  return visit
}

/**
 * Capture GPS, enforce client geofence, try online (12s), else save offline.
 */
export async function checkInWithGeo(
  storeId: number,
  photo: Blob,
  meta?: { storeName?: string; storeCity?: string },
): Promise<CheckInResult> {
  const openOffline = await getOpenOfflineVisit()
  if (openOffline) {
    throw new Error(
      `You already have an offline check-in at ${openOffline.storeName}. Check out or submit it from Offline first.`,
    )
  }

  const geo = await readGeoRequired()
  const details = findCreatedStore(storeId)
  assertWithinStoreGeofence(details?.latitude, details?.longitude, geo.latitude, geo.longitude, 'check in')

  const storeName = meta?.storeName || details?.name || `Store #${storeId}`
  const storeCity = meta?.storeCity || details?.city || ''
  const checkInAt = new Date().toISOString()

  try {
    const visit = await supervisorVisitCheckIn({
      storeId,
      photo,
      geo,
      timeoutMs: VISIT_ONLINE_TIMEOUT_MS,
    })
    return { mode: 'online', visit }
  } catch (err) {
    if (!isNetworkishError(err)) throw err
    const pending: OfflinePendingVisit = {
      localId: newOfflineLocalId(),
      storeId,
      storeName,
      storeCity,
      serverVisitId: null,
      checkInAt,
      checkInLat: geo.latitude,
      checkInLng: geo.longitude,
      checkInAccuracy: geo.accuracy ?? null,
      checkInPhoto: photo,
      checkOutAt: null,
      checkOutLat: null,
      checkOutLng: null,
      checkOutAccuracy: null,
      createdAt: checkInAt,
      updatedAt: checkInAt,
    }
    await saveOfflineVisit(pending)
    return { mode: 'offline', pending }
  }
}

/**
 * Checkout: try online for server visit; if offline open pending, update it;
 * if server checkout fails network, queue checkout against that visit.
 */
export async function checkOutWithGeo(
  visitId?: number,
  meta?: { storeId?: number; storeName?: string; storeCity?: string; openVisit?: SupervisorStoreVisit },
): Promise<CheckOutResult> {
  const geo = await readGeoRequired()
  const openOffline = await getOpenOfflineVisit()

  // Checkout against local offline check-in
  if (openOffline && (!visitId || !meta?.openVisit)) {
    const details = findCreatedStore(openOffline.storeId)
    assertWithinStoreGeofence(
      details?.latitude,
      details?.longitude,
      geo.latitude,
      geo.longitude,
      'check out',
    )
    const now = new Date().toISOString()
    const pending: OfflinePendingVisit = {
      ...openOffline,
      checkOutAt: now,
      checkOutLat: geo.latitude,
      checkOutLng: geo.longitude,
      checkOutAccuracy: geo.accuracy ?? null,
      updatedAt: now,
    }
    // Try sync full visit if online; else keep offline
    try {
      const visit = await syncOfflineVisit(pending)
      await deleteOfflineVisit(pending.localId)
      return { mode: 'online', visit }
    } catch (err) {
      if (!isNetworkishError(err)) throw err
      await saveOfflineVisit(pending)
      return { mode: 'offline', pending }
    }
  }

  const storeId = meta?.storeId ?? meta?.openVisit?.storeId
  const details = storeId != null ? findCreatedStore(storeId) : null
  assertWithinStoreGeofence(details?.latitude, details?.longitude, geo.latitude, geo.longitude, 'check out')

  try {
    const visit = await supervisorVisitCheckOut({
      visitId,
      geo,
      timeoutMs: VISIT_ONLINE_TIMEOUT_MS,
    })
    return { mode: 'online', visit }
  } catch (err) {
    if (!isNetworkishError(err)) throw err
    const open = meta?.openVisit
    if (!open || !open.checkedInAt) {
      throw err instanceof Error ? err : new Error('Check-out failed and could not save offline.')
    }
    const now = new Date().toISOString()
    const pending: OfflinePendingVisit = {
      localId: newOfflineLocalId(),
      storeId: open.storeId,
      storeName: open.storeName || meta?.storeName || `Store #${open.storeId}`,
      storeCity: open.storeCity || meta?.storeCity || '',
      serverVisitId: open.id,
      checkInAt: open.checkedInAt,
      checkInLat: open.checkInLat ?? geo.latitude,
      checkInLng: open.checkInLng ?? geo.longitude,
      checkInAccuracy: open.checkInAccuracyM ?? null,
      checkInPhoto: null,
      checkOutAt: now,
      checkOutLat: geo.latitude,
      checkOutLng: geo.longitude,
      checkOutAccuracy: geo.accuracy ?? null,
      createdAt: now,
      updatedAt: now,
    }
    await saveOfflineVisit(pending)
    return { mode: 'offline', pending }
  }
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
