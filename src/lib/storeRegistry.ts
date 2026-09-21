import { useSyncExternalStore } from 'react'
import { stores, type Store } from '../data/mock'

/**
 * Stores created by hand or from an Excel sheet. There is no backend, so they live in this
 * browser's localStorage and are added to the shared `stores` list at startup, which makes
 * them show up on every page that lists stores.
 */

export type Footfall = Store['footfall']

export type StoreInput = {
  name: string
  city: string
  footfall: Footfall
  address: string
  latitude: number | null
  longitude: number | null
  peakHours: string
  contactPerson: string
  contactPhone: string
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
]
export const FOOTFALLS: Footfall[] = ['High', 'Medium', 'Low']
export const DEFAULT_PEAK_HOURS = '5 PM — 9 PM'

const STORAGE_KEY = 'created-stores-v1'

function toStore(c: CreatedStore): Store {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
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
const listeners = new Set<() => void>()

for (const c of created) if (!stores.some((s) => s.id === c.id)) stores.push(toStore(c))

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useCreatedStores() {
  return useSyncExternalStore(subscribe, () => created)
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
  for (const input of inputs) {
    const id = Math.max(99, ...stores.map((s) => s.id)) + 1
    const record: CreatedStore = {
      ...input,
      name: input.name.trim(),
      city: input.city.trim(),
      id,
      slug: `s${id}-${randomSuffix()}`,
      createdAt: new Date().toISOString(),
    }
    stores.push(toStore(record))
    added.push(record)
  }
  created = [...added.slice().reverse(), ...created]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(created))
  } catch {
    // keep in memory for this session
  }
  listeners.forEach((l) => l())
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

export type ShopperStore = { id: number | null; name: string; city: string }

const SHOPPER_KEY = 'shopper-store'

/** Works out which store a scanned link is for, and remembers it for this shopper session. */
export function enterShopperStore(slug: string, params: URLSearchParams): ShopperStore | null {
  const id = Number(/^s(\d+)-/.exec(slug)?.[1])
  const known = Number.isFinite(id) ? stores.find((s) => s.id === id) : undefined
  const name = known?.name ?? params.get('store') ?? ''
  const shopperStore = name
    ? { id: known?.id ?? null, name, city: known?.city ?? params.get('city') ?? '' }
    : null
  try {
    if (shopperStore) sessionStorage.setItem(SHOPPER_KEY, JSON.stringify(shopperStore))
  } catch {
    // ignore
  }
  return shopperStore
}

export function getShopperStore(): ShopperStore | null {
  try {
    const raw = sessionStorage.getItem(SHOPPER_KEY)
    return raw ? (JSON.parse(raw) as ShopperStore) : null
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
  { key: 'name', header: 'Store name *', width: 30 },
  { key: 'city', header: 'City *', width: 16 },
  { key: 'footfall', header: 'Footfall', width: 12 },
  { key: 'address', header: 'Address', width: 36 },
  { key: 'latitude', header: 'Latitude', width: 12 },
  { key: 'longitude', header: 'Longitude', width: 12 },
  { key: 'peakHours', header: 'Peak hours', width: 16 },
  { key: 'contactPerson', header: 'Contact person', width: 20 },
  { key: 'contactPhone', header: 'Contact phone', width: 18 },
] as const

/** Downloads the .xlsx a user fills in to create many stores at once. */
export async function downloadStoreTemplate() {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c.header)])
  sheet['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))

  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill the store template'],
    [],
    [`1. Add one store per row on the "${SHEET}" sheet, starting on row 2. Do not change the header row.`],
    ['2. Store name and City are required. Everything else is optional.'],
    [`3. Footfall must be High, Medium or Low (blank = Medium). Peak hours is free text (blank = ${DEFAULT_PEAK_HOURS}).`],
    ['4. Latitude and Longitude are decimal numbers, e.g. 24.8607 and 67.0011.'],
    ['5. A store that already exists (same name and city) is skipped.'],
    ['6. Save the file, then upload it on the Stores page. Each store gets its own shopper QR code.'],
    [],
    COLUMNS.map((c) => c.header),
    ['Carrefour Johar Town', 'Lahore', 'High', 'Main Boulevard, Johar Town', 31.4697, 74.2728, '5 PM — 9 PM', 'Ali Raza', '0300-1234567'],
  ])
  help['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, SHEET)
  XLSX.utils.book_append_sheet(wb, help, 'Instructions')
  XLSX.writeFile(wb, 'Kashmir_Store_Creation_Template.xlsx')
}

export type ParsedStoreRow = { row: number; input: StoreInput }
export type StoreParseResult = { rows: ParsedStoreRow[]; errors: string[] }

const headerKey = (h: unknown) => String(h ?? '').replace('*', '').trim().toLowerCase()

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

  const headerAt = table.findIndex((r) => r.some((c) => headerKey(c) === 'store name'))
  if (headerAt === -1) {
    return {
      rows: [],
      errors: ['This is not the store template (no "Store name" column). Download the template and fill that.'],
    }
  }
  const col = new Map<string, number>()
  table[headerAt].forEach((h, i) => col.set(headerKey(h), i))
  const cell = (r: unknown[], header: string) => {
    const v = r[col.get(header) ?? -1]
    return v === undefined || v === null ? '' : String(v).trim()
  }

  const rows: ParsedStoreRow[] = []
  const errors: string[] = []
  const seen = new Set<string>()

  table.slice(headerAt + 1).forEach((r, i) => {
    const rowNo = headerAt + i + 2
    if (r.every((c) => String(c ?? '').trim() === '')) return

    const name = cell(r, 'store name')
    const city = cell(r, 'city')
    const problems: string[] = []
    if (!name) problems.push('Store name is required')
    if (!city) problems.push('City is required')

    const footRaw = cell(r, 'footfall')
    const footfall = FOOTFALLS.find((f) => f.toLowerCase() === footRaw.toLowerCase())
    if (footRaw && !footfall) problems.push(`Footfall must be High, Medium or Low (found "${footRaw}")`)

    const coord = (header: string, limit: number) => {
      const text = cell(r, header)
      if (!text) return null
      const n = Number(text)
      if (!Number.isFinite(n) || Math.abs(n) > limit) {
        problems.push(`${header[0].toUpperCase()}${header.slice(1)} must be a number between -${limit} and ${limit} (found "${text}")`)
        return null
      }
      return n
    }
    const latitude = coord('latitude', 90)
    const longitude = coord('longitude', 180)

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
        name,
        city,
        footfall: footfall ?? 'Medium',
        address: cell(r, 'address'),
        latitude,
        longitude,
        peakHours: cell(r, 'peak hours') || DEFAULT_PEAK_HOURS,
        contactPerson: cell(r, 'contact person'),
        contactPhone: cell(r, 'contact phone'),
      },
    })
  })

  if (rows.length === 0 && errors.length === 0) errors.push('No stores found. Add one store per row under the header.')
  return { rows, errors }
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
