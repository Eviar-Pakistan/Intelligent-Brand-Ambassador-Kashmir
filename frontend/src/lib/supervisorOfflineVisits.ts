/**
 * Offline supervisor visit queue (IndexedDB).
 * Stores selfie + GPS + times when check-in/out cannot reach the API.
 */

const DB_NAME = 'kashmir-supervisor-offline'
const DB_VERSION = 1
const STORE = 'pendingVisits'

export type OfflinePendingVisit = {
  localId: string
  storeId: number
  storeName: string
  storeCity: string
  /** Set when checkout failed for an already-synced open visit */
  serverVisitId?: number | null
  checkInAt: string
  checkInLat: number
  checkInLng: number
  checkInAccuracy?: number | null
  /** Required for new visits; may be null for checkout-only sync of server visit */
  checkInPhoto: Blob | null
  checkOutAt?: string | null
  checkOutLat?: number | null
  checkOutLng?: number | null
  checkOutAccuracy?: number | null
  createdAt: string
  updatedAt: string
}

type Listener = () => void
const listeners = new Set<Listener>()

function notify() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* ignore */
    }
  })
}

export function subscribeOfflineVisits(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available on this device.'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error || new Error('Could not open offline storage.'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'localId' })
      }
    }
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Offline storage transaction failed.'))
    tx.onabort = () => reject(tx.error || new Error('Offline storage transaction aborted.'))
  })
}

export function newOfflineLocalId() {
  return `off-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function listOfflineVisits(): Promise<OfflinePendingVisit[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => {
      const rows = (req.result || []) as OfflinePendingVisit[]
      rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      resolve(rows)
    }
    req.onerror = () => reject(req.error || new Error('Could not read offline visits.'))
  })
}

export async function getOfflineVisit(localId: string): Promise<OfflinePendingVisit | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(localId)
    req.onsuccess = () => resolve((req.result as OfflinePendingVisit) || null)
    req.onerror = () => reject(req.error || new Error('Could not read offline visit.'))
  })
}

export async function getOpenOfflineVisit(): Promise<OfflinePendingVisit | null> {
  const rows = await listOfflineVisits()
  return rows.find((r) => r.checkInAt && !r.checkOutAt && !r.serverVisitId) || null
}

export async function saveOfflineVisit(visit: OfflinePendingVisit): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(visit)
  await txDone(tx)
  notify()
}

export async function deleteOfflineVisit(localId: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(localId)
  await txDone(tx)
  notify()
}

export async function countOfflineVisits(): Promise<number> {
  const rows = await listOfflineVisits()
  return rows.length
}

/** Client-side geofence (same 300m rule as backend). Skip if store has no coords. */
export const STORE_GEOFENCE_M = 300

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const p1 = toRad(lat1)
  const p2 = toRad(lat2)
  const dphi = toRad(lat2 - lat1)
  const dlmb = toRad(lng2 - lng1)
  const a =
    Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlmb / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function assertWithinStoreGeofence(
  storeLat: number | null | undefined,
  storeLng: number | null | undefined,
  lat: number,
  lng: number,
  action: 'check in' | 'check out',
): void {
  if (storeLat == null || storeLng == null || Number.isNaN(storeLat) || Number.isNaN(storeLng)) {
    return
  }
  const distance = haversineM(lat, lng, storeLat, storeLng)
  if (distance <= STORE_GEOFENCE_M) return
  throw new Error(
    `You must be within ${STORE_GEOFENCE_M}m of the store to ${action}. ` +
      `You are about ${Math.round(distance)}m away.`,
  )
}
