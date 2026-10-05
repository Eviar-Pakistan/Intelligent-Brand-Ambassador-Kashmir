import { useSyncExternalStore } from 'react'
import { stores, type Store } from '../data/mock'

/**
 * Stores created in HO (form or Excel). Synced to Django when authenticated;
 * also cached in localStorage so the shared `stores` list stays available offline.
 */

export type Footfall = Store['footfall']

export type StoreInput = {
  /** Required business store code (e.g. 33991, DTR000297). Duplicates become code-1. */
  code: string
  name: string
  city: string
  footfall: Footfall
  address: string
  latitude: number | null
  longitude: number | null
  peakHours: string
  contactPerson?: string
  contactPhone?: string
}

export type CreatedStore = StoreInput & { id: number; slug: string; createdAt: string }

export const CITIES = [
  'Lahore',
  'Karachi',
  'Islamabad',
  'Rawalpindi',
  'Faisalabad',
  'Multan',
  'Peshawar',
  'Quetta',
  'Sialkot',
  'Gujranwala',
  'Hyderabad',
  'Sargodha',
  'Wah Cantt',
  'Gujrat',
  'Jehlum',
  'Kharian',
  'Abbottabad',
]
export const FOOTFALLS: Footfall[] = ['High', 'Medium', 'Low']
export const DEFAULT_PEAK_HOURS = '5 PM — 9 PM'

const STORAGE_KEY = 'created-stores-v1'

function toStore(c: CreatedStore): Store {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    code: c.code || '',
    footfall: c.footfall,
    bas: 0,
    coverage: 0,
    status: 'NEEDS BA',
    todayFootfall: 0,
    engagement: 0,
    conversion: 0,
    peak: c.peakHours ? [c.peakHours] : [],
    assigned: [],
    qrCode: c.slug,
  }
}

function load(): CreatedStore[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as CreatedStore[]) : []
  } catch {
    return []
  }
}

let created = load()
/** Bumps on every persist so useSyncExternalStore always sees a new snapshot. */
let storeEpoch = 0
const listeners = new Set<() => void>()

for (const c of created) if (!stores.some((s) => s.id === c.id)) stores.push(toStore(c))

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useCreatedStores() {
  // Snapshot must change when live `stores[]` metrics (bas/status) update in place;
  // mutating `created` alone keeps the same array ref and React skips re-render.
  useSyncExternalStore(subscribe, () => storeEpoch)
  return created
}

export function findCreatedStore(id: number) {
  return created.find((c) => c.id === id) ?? null
}

const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

export function storeExists(name: string, city: string) {
  return stores.some((s) => norm(s.name) === norm(name) && norm(s.city) === norm(city))
}

function randomSuffix() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('')
}

/** Adds the stores to the app. Returns them with their new ids and shopper slugs. */
export function createStores(inputs: StoreInput[]): CreatedStore[] {
  const added: CreatedStore[] = []
  const usedCodes = new Set(
    stores.map((s) => (s.code || '').trim().toUpperCase()).filter(Boolean),
  )
  for (const input of inputs) {
    const id = Math.max(99, ...stores.map((s) => s.id)) + 1
    let code = (input.code || '').trim()
    if (!code) throw new Error('Store code is required.')
    const base = code
    let n = 1
    while (usedCodes.has(code.toUpperCase())) {
      code = `${base}-${n}`
      n += 1
    }
    usedCodes.add(code.toUpperCase())
    const record: CreatedStore = {
      ...input,
      code,
      name: input.name.trim(),
      city: input.city.trim(),
      contactPerson: input.contactPerson?.trim() || '',
      contactPhone: input.contactPhone?.trim() || '',
      id,
      slug: `s${id}-${randomSuffix()}`,
      createdAt: new Date().toISOString(),
    }
    stores.push(toStore(record))
    added.push(record)
  }
  created = [...added.slice().reverse(), ...created]
  storeEpoch += 1
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(created))
  } catch {
    // keep in memory for this session
  }
  listeners.forEach((l) => l())
  return added
}

// ─── Backend API (Django) ────────────────────────────────────────────────────

type ApiAssignedBa = {
  id: string
  name: string
  code?: string
  state?: 'Active' | 'Break' | 'Offline' | string
}

type ApiStore = {
  id: number
  code?: string
  name: string
  city: string
  address: string
  footfall: Footfall
  peak_hours?: string
  contact_name?: string
  contact_phone?: string
  status?: string
  bas?: number
  coverage?: number
  today_footfall?: number
  engagement?: number
  conversion?: number
  latitude?: string | number | null
  longitude?: string | number | null
  qr_slug?: string
  created_at?: string
  assigned?: ApiAssignedBa[]
  assigned_bas?: number
}

function mapAssigned(list?: ApiAssignedBa[]): Store['assigned'] {
  if (!Array.isArray(list)) return []
  return list
    .filter((a) => a && a.id && a.name)
    .map((a) => {
      const state = a.state === 'Active' || a.state === 'Break' ? a.state : 'Offline'
      const code = a.code ? String(a.code).trim() : ''
      return { id: String(a.id), name: String(a.name), ...(code ? { code } : {}), state }
    })
}

function mapApiStatus(status?: string, basCount = 0): Store['status'] {
  // Live BA roster wins: no BAs → needs BA; has BAs → covered (unless API says partial)
  if (basCount <= 0) return 'NEEDS BA'
  if (status === 'PARTIAL') return 'PARTIAL'
  if (status === 'INACTIVE') return 'NEEDS BA'
  return 'Covered'
}

function apiStoreToCreated(s: ApiStore): CreatedStore {
  return {
    id: s.id,
    name: s.name,
    city: s.city,
    footfall: s.footfall || 'Medium',
    address: s.address || '',
    latitude: s.latitude == null || s.latitude === '' ? null : Number(s.latitude),
    longitude: s.longitude == null || s.longitude === '' ? null : Number(s.longitude),
    peakHours: s.peak_hours || DEFAULT_PEAK_HOURS,
    contactPerson: '',
    contactPhone: '',
    slug: s.qr_slug || `s${s.id}-demo`,
    createdAt: s.created_at || new Date().toISOString(),
    code: s.code || '',
  }
}

function mergeStoreIntoApp(record: CreatedStore, api?: ApiStore) {
  const view = toStore(record)
  if (api) {
    view.assigned = mapAssigned(api.assigned)
    // Prefer live roster count over stale Store.bas column
    view.bas = Math.max(
      view.assigned.length,
      typeof api.assigned_bas === 'number' ? api.assigned_bas : 0,
      typeof api.bas === 'number' ? api.bas : 0,
    )
    view.coverage = api.coverage ?? view.coverage
    view.todayFootfall = api.today_footfall ?? view.todayFootfall
    view.engagement = api.engagement ?? view.engagement
    view.conversion = api.conversion ?? view.conversion
    view.status = mapApiStatus(api.status, view.bas)
    view.qrCode = record.slug
    view.code = record.code || api.code || view.code
  }
  const idx = stores.findIndex((s) => s.id === record.id)
  if (idx >= 0) stores[idx] = { ...stores[idx], ...view }
  else stores.push(view)

  const cIdx = created.findIndex((c) => c.id === record.id)
  if (cIdx >= 0) created[cIdx] = record
  else created = [record, ...created]
}

function persistCreated() {
  storeEpoch += 1
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(created))
  } catch {
    // ignore
  }
  listeners.forEach((l) => l())
}

/** Pull stores from Django and replace the shared list (drops deleted/local-only rows). */
export async function syncStoresFromApi() {
  const { apiRequest, isApiAuthenticated } = await import('./api')
  if (!isApiAuthenticated()) return []
  const list = await apiRequest<ApiStore[]>('/api/stores/')
  const nextIds = new Set(list.map((s) => s.id))

  // Remove stores that no longer exist on the server
  for (let i = stores.length - 1; i >= 0; i -= 1) {
    if (!nextIds.has(stores[i].id)) stores.splice(i, 1)
  }

  created = []
  for (const s of list) mergeStoreIntoApp(apiStoreToCreated(s), s)
  persistCreated()
  return list
}

/** Create stores via API when logged in; otherwise local-only. */
export async function createStoresAsync(
  inputs: StoreInput[],
  opts?: { onProgress?: (done: number, total: number, name: string) => void },
): Promise<CreatedStore[]> {
  const { apiRequest, isApiAuthenticated } = await import('./api')
  if (!isApiAuthenticated()) {
    const local = createStores(inputs)
    opts?.onProgress?.(local.length, local.length, '')
    return local
  }

  const added: CreatedStore[] = []
  const total = inputs.length
  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i]
    opts?.onProgress?.(i, total, input.name.trim())
    const s = await apiRequest<ApiStore>('/api/stores/', {
      method: 'POST',
      body: {
        code: input.code.trim(),
        name: input.name.trim(),
        city: input.city.trim(),
        address: input.address.trim() || `${input.city.trim()}`,
        footfall: input.footfall,
        peak_hours: input.peakHours.trim() || DEFAULT_PEAK_HOURS,
        contact_name: '',
        contact_phone: '',
        latitude: input.latitude,
        longitude: input.longitude,
      },
    })
    const record = apiStoreToCreated(s)
    mergeStoreIntoApp(record, s)
    added.push(record)
    opts?.onProgress?.(i + 1, total, input.name.trim())
  }
  persistCreated()
  return added
}

// ─── Shopper journey link + QR ───────────────────────────────────────────────

/** Path segment that identifies a store in its shopper link. */
export function storeSlug(store: Pick<Store, 'id' | 'qrCode'>) {
  return findCreatedStore(store.id)?.slug ?? `s${store.id}-demo`
}

/**
 * Link a shopper opens (by scanning the QR) to start that store's journey. The store name and
 * city ride along so the journey can greet the shopper even on a phone that has never seen
 * this browser's store list.
 */
export function shopperPath(store: Pick<Store, 'id' | 'qrCode' | 'name' | 'city'>) {
  const query = new URLSearchParams({ store: store.name, city: store.city })
  return `/shopper/${storeSlug(store)}?${query}`
}

export function shopperLink(store: Pick<Store, 'id' | 'qrCode' | 'name' | 'city'>) {
  return `${window.location.origin}${shopperPath(store)}`
}

export type ShopperStore = { id: number | null; name: string; city: string; slug: string }

const SHOPPER_KEY = 'shopper-store'

/** Works out which store a scanned link is for, and remembers it for this shopper session. */
export function enterShopperStore(slug: string, params: URLSearchParams): ShopperStore | null {
  const cleanSlug = (slug || '').trim()
  const id = Number(/^s(\d+)-/.exec(cleanSlug)?.[1])
  const known = Number.isFinite(id) ? stores.find((s) => s.id === id) : undefined
  const name = known?.name ?? params.get('store') ?? ''
  const city = known?.city ?? params.get('city') ?? ''
  if (!cleanSlug && !name) return null
  const shopperStore: ShopperStore = {
    id: known?.id ?? (Number.isFinite(id) ? id : null),
    name: name || cleanSlug,
    city,
    slug: cleanSlug || (known ? storeSlug(known) : ''),
  }
  try {
    sessionStorage.setItem(SHOPPER_KEY, JSON.stringify(shopperStore))
  } catch {
    // ignore
  }
  return shopperStore
}

export function getShopperStore(): ShopperStore | null {
  try {
    const raw = sessionStorage.getItem(SHOPPER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ShopperStore>
    if (!parsed || (!parsed.slug && !parsed.name)) return null
    // Backfill slug for older sessions that only stored name/city
    let slug = parsed.slug || ''
    if (!slug && parsed.id != null) {
      const known = stores.find((s) => s.id === parsed.id)
      if (known) slug = storeSlug(known)
    }
    return {
      id: parsed.id ?? null,
      name: parsed.name || slug,
      city: parsed.city || '',
      slug,
    }
  } catch {
    return null
  }
}

export async function qrDataUrl(text: string, width = 320) {
  const mod = (await import('qrcode')) as unknown as {
    toDataURL?: (t: string, o: object) => Promise<string>
    default?: { toDataURL: (t: string, o: object) => Promise<string> }
  }
  const toDataURL = mod.toDataURL ?? mod.default!.toDataURL
  return toDataURL(text, { width, margin: 1, errorCorrectionLevel: 'M' })
}

// ─── Excel template + bulk upload ────────────────────────────────────────────

const SHEET = 'Stores'
const COLUMNS = [
  { key: 'code', header: 'Store Code *', width: 16 },
  { key: 'name', header: 'Store name *', width: 30 },
  { key: 'city', header: 'City *', width: 16 },
  { key: 'footfall', header: 'Footfall', width: 12 },
  { key: 'latitude', header: 'Latitude', width: 12 },
  { key: 'longitude', header: 'Longitude', width: 12 },
] as const

const PEAK_HOUR_OPTIONS = [
  '10 AM — 1 PM',
  '12 PM — 3 PM',
  '2 PM — 6 PM',
  '4 PM — 8 PM',
  '5 PM — 9 PM',
  '6 PM — 10 PM',
  '11 AM — 2 PM',
  '3 PM — 7 PM',
] as const

function randomPeakHours() {
  return PEAK_HOUR_OPTIONS[Math.floor(Math.random() * PEAK_HOUR_OPTIONS.length)]
}

/** Downloads the .xlsx a user fills in to create many stores at once. */
export async function downloadStoreTemplate() {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c.header)])
  sheet['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))

  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill the store template'],
    [],
    [`1. Add one store per row on the "${SHEET}" sheet, starting on row 2. Do not change the header row.`],
    ['2. Required columns: Store Code, Store name, City.'],
    ['3. Store Code — your business code (e.g. 33991, DTR000297). If a code already exists, the app saves it as code-1, code-2, …'],
    ['4. Footfall is optional (High / Medium / Low). Blank = Medium.'],
    ['5. Address defaults to the city. Peak hours are assigned randomly.'],
    ['6. Latitude and Longitude are optional. Blank or "-" creates the store without map coordinates.'],
    ['7. A store that already exists (same name and city) is skipped.'],
    ['8. Save the file, then upload it on the Stores page. Each store gets its own shopper QR code.'],
    [],
    COLUMNS.map((c) => c.header),
    ['33991', 'Carrefour Johar Town', 'Lahore', 'High', 31.4697, 74.2728],
    ['DTR000297', 'Al-Fatah Blue Area', 'Islamabad', 'Medium', 33.7294, 73.0931],
  ])
  help['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, SHEET)
  XLSX.utils.book_append_sheet(wb, help, 'Instructions')
  XLSX.writeFile(wb, 'Kashmir_Store_Creation_Template.xlsx')
}

export type ParsedStoreRow = { row: number; input: StoreInput }
export type StoreParseResult = {
  rows: ParsedStoreRow[]
  errors: string[]
  /** Rows skipped because lat/lng were "-" or blank. */
  skippedNoCoords?: number
}

const headerKey = (h: unknown) => String(h ?? '').replace('*', '').trim().toLowerCase()

function cellByHeaders(r: unknown[], col: Map<string, number>, headers: string[]) {
  for (const header of headers) {
    const i = col.get(header)
    if (i == null || i < 0) continue
    const v = r[i]
    const s = v === undefined || v === null ? '' : String(v).trim()
    if (s) return s
  }
  return ''
}

/** Blank, dash, or N/A → no coordinates (skip store). */
function isMissingCoord(raw: string) {
  const t = raw.trim().toLowerCase()
  return !t || t === '-' || t === '—' || t === '–' || t === 'n/a' || t === 'na' || t === 'null' || t === 'none'
}

/** Reads a filled template. Valid rows are returned even when others have problems. */
export async function parseStoreFile(file: File): Promise<StoreParseResult> {
  const XLSX = await import('xlsx')

  let table: unknown[][]
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const name = wb.SheetNames.includes(SHEET) ? SHEET : wb.SheetNames[0]
    table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: '', raw: true })
  } catch {
    return { rows: [], errors: ['This file could not be read. Please upload the downloaded .xlsx template.'] }
  }

  const headerAt = table.findIndex((r) =>
    r.some((c) => {
      const k = headerKey(c)
      return k === 'store name' || k === 'name' || k === 'store'
    }),
  )
  if (headerAt === -1) {
    return {
      rows: [],
      errors: ['This is not the store template (no "Store name" column). Download the template and fill that.'],
    }
  }
  const col = new Map<string, number>()
  table[headerAt].forEach((h, i) => col.set(headerKey(h), i))

  const rows: ParsedStoreRow[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  const seenCodes = new Set<string>()

  table.slice(headerAt + 1).forEach((r, i) => {
    const rowNo = headerAt + i + 2
    if (r.every((c) => String(c ?? '').trim() === '')) return

    const code = cellByHeaders(r, col, ['store code', 'code', 'storecode', 'outlet code'])
    const name = cellByHeaders(r, col, ['store name', 'name', 'store'])
    const city = cellByHeaders(r, col, ['city', 'town'])
    const problems: string[] = []
    if (!code) problems.push('Store Code is required')
    if (!name) problems.push('Store name is required')
    if (!city) problems.push('City is required')

    // Footfall from Excel when present; blank → Medium. Address ignored.
    const footRaw = cellByHeaders(r, col, ['footfall', 'foot fall', 'traffic'])
    let footfall: Footfall = 'Medium'
    if (footRaw && !isMissingCoord(footRaw)) {
      const matched = FOOTFALLS.find((f) => f.toLowerCase() === footRaw.toLowerCase())
      if (matched) footfall = matched
      else problems.push(`Footfall must be High, Medium or Low (found "${footRaw}")`)
    }

    const latRaw = cellByHeaders(r, col, ['latitude', 'lat'])
    const lngRaw = cellByHeaders(r, col, ['longitude', 'long', 'lng', 'lon'])

    let latitude: number | null = null
    let longitude: number | null = null

    // "-" / blank → create store without coordinates
    if (!isMissingCoord(latRaw) || !isMissingCoord(lngRaw)) {
      const parseCoord = (text: string, limit: number, label: string) => {
        if (isMissingCoord(text)) return null
        const n = Number(text)
        if (!Number.isFinite(n) || Math.abs(n) > limit) {
          problems.push(`${label} must be a number between -${limit} and ${limit} (found "${text}")`)
          return null
        }
        return n
      }
      if (!isMissingCoord(latRaw) && !isMissingCoord(lngRaw)) {
        latitude = parseCoord(latRaw, 90, 'Latitude')
        longitude = parseCoord(lngRaw, 180, 'Longitude')
      } else if (!isMissingCoord(latRaw) || !isMissingCoord(lngRaw)) {
        latitude = null
        longitude = null
      }
    }

    // Deduplicate codes within the file → code-1, code-2 (same rule as the API)
    let finalCode = code
    if (code) {
      const base = code
      let n = 1
      while (seenCodes.has(finalCode.toUpperCase())) {
        finalCode = `${base}-${n}`
        n += 1
      }
      seenCodes.add(finalCode.toUpperCase())
    }

    if (name && city) {
      const key = `${norm(name)}|${norm(city)}`
      if (seen.has(key)) problems.push('Duplicate of an earlier row in this file')
      else if (storeExists(name, city)) problems.push('A store with this name and city already exists')
      seen.add(key)
    }

    if (problems.length > 0) {
      errors.push(`Row ${rowNo}${name ? ` (${name})` : ''}: ${problems.join('; ')}.`)
      return
    }
    rows.push({
      row: rowNo,
      input: {
        code: finalCode,
        name,
        city,
        footfall,
        address: city,
        latitude,
        longitude,
        peakHours: randomPeakHours(),
      },
    })
  })

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No stores found. Add one store per row under the header.')
  }
  return { rows, errors, skippedNoCoords: 0 }
}

/** Downloads a sheet of store names with their shopper links, e.g. to print QR posters. */
export async function downloadStoreLinks(list: Pick<Store, 'id' | 'qrCode' | 'name' | 'city'>[]) {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Store ID', 'Store', 'City', 'Shopper link'],
    ...list.map((s) => [s.id, s.name, s.city, shopperLink(s)]),
  ])
  sheet['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 16 }, { wch: 90 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Shopper links')
  XLSX.writeFile(wb, 'Kashmir_Store_Shopper_Links.xlsx')
}
