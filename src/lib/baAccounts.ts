import { useSyncExternalStore } from 'react'
import type { AnswerMetrics, AssessmentResult } from './baAssessment'
import { generatePassword, hashPassword } from './supervisors'

/**
 * Ambassadors Head Office creates, each with their own sign-in (set at creation time, no
 * invite link). A newly created BA can only use Training — video, then verbal assessment —
 * until they are certified; after that they sign in to the full BA app.
 *
 * There is no backend, so accounts and the signed-in session live in this browser's
 * localStorage. Passwords are salted and hashed rather than stored as text, but this is
 * demo-grade access control: anyone with access to the browser can read or change the data.
 */

export type BaStatus = 'Invited' | 'Training' | 'Certified'

export type BaAccount = {
  id: string
  name: string
  city: string
  email: string
  phone: string
  createdAt: string
  status: BaStatus
  videoWatched: boolean
  /** Answers submitted so far (one per assessment question) */
  answers: AnswerMetrics[]
  result: AssessmentResult | null
  passwordSalt: string
  passwordHash: string
}

export { generatePassword }

const STORAGE_KEY = 'ba-accounts-v1'
const SESSION_KEY = 'ba-session-v1'

function load(): BaAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as BaAccount[]) : []
  } catch {
    return []
  }
}

let accounts = load()
const listeners = new Set<() => void>()

function commit(next: BaAccount[]) {
  accounts = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
  } catch {
    // keep in memory for this session
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // pick up changes made in another tab
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      accounts = load()
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useBaAccounts() {
  return useSyncExternalStore(subscribe, () => accounts)
}

const normEmail = (email: string) => email.trim().toLowerCase()

/** True when another ambassador already signs in with this email. */
export function baEmailInUse(email: string, exceptId?: string) {
  const e = normEmail(email)
  return !!e && accounts.some((a) => a.id !== exceptId && normEmail(a.email) === e)
}

function newCredentials(password: string) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')
  return { passwordSalt: salt, passwordHash: hashPassword(salt, password) }
}

export type BaAccountFields = { name: string; city: string; email: string; phone: string; password: string }

function toAccount(fields: BaAccountFields): BaAccount {
  return {
    id: `ba-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: fields.name.trim(),
    city: fields.city.trim(),
    email: fields.email.trim(),
    phone: fields.phone.trim(),
    createdAt: new Date().toISOString(),
    status: 'Invited',
    videoWatched: false,
    answers: [],
    result: null,
    ...newCredentials(fields.password),
  }
}

export function createBaAccount(fields: BaAccountFields): BaAccount {
  const account = toAccount(fields)
  commit([account, ...accounts])
  return account
}

/** Creates many accounts at once, e.g. from a bulk Excel upload. Returns them in input order. */
export function createBaAccounts(fields: BaAccountFields[]): BaAccount[] {
  const added = fields.map(toAccount)
  commit([...added.slice().reverse(), ...accounts])
  return added
}

export function updateBaAccount(id: string, patch: Partial<BaAccount>) {
  commit(accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)))
}

/** Sets (or resets) the email and password an ambassador signs in with. */
export function setBaLogin(id: string, email: string, password: string) {
  commit(accounts.map((a) => (a.id === id ? { ...a, email: email.trim(), ...newCredentials(password) } : a)))
}

// ─── Signing in ──────────────────────────────────────────────────────────────

/** The ambassador these credentials belong to, or null. */
export function authenticateBa(email: string, password: string): BaAccount | null {
  const found = accounts.find((a) => normEmail(a.email) === normEmail(email))
  if (!found || !found.passwordHash) return null
  return hashPassword(found.passwordSalt, password) === found.passwordHash ? found : null
}

const sessionListeners = new Set<() => void>()
let sessionCache: string | null | undefined

function readRaw() {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

export function baSignIn(id: string) {
  try {
    localStorage.setItem(SESSION_KEY, id)
  } catch {
    // ignore
  }
  sessionCache = undefined
  sessionListeners.forEach((l) => l())
}

export function baSignOut() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
  sessionCache = undefined
  sessionListeners.forEach((l) => l())
}

/** Who is signed in to the BA app on this browser (null when nobody is, or the account was deleted). */
export function useBaSession() {
  const list = useBaAccounts()
  const id = useSyncExternalStore(
    (l) => {
      sessionListeners.add(l)
      window.addEventListener('storage', l)
      return () => {
        sessionListeners.delete(l)
        window.removeEventListener('storage', l)
      }
    },
    () => (sessionCache === undefined ? (sessionCache = readRaw()) : sessionCache),
  )
  const account = id ? (list.find((a) => a.id === id) ?? null) : null
  return { account }
}

// ─── Excel template + bulk upload ────────────────────────────────────────────

const SHEET = 'Ambassadors'
const COLUMNS = [
  { key: 'name', header: 'Name *', width: 26 },
  { key: 'city', header: 'City', width: 16 },
  { key: 'email', header: 'Email *', width: 28 },
  { key: 'phone', header: 'Phone', width: 18 },
  { key: 'password', header: 'Password', width: 18 },
] as const

/** Downloads the .xlsx a user fills in to create many ambassador accounts at once. */
export async function downloadAmbassadorTemplate() {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c.header)])
  sheet['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))

  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill the ambassador template'],
    [],
    [`1. Add one ambassador per row on the "${SHEET}" sheet, starting on row 2. Do not change the header row.`],
    ['2. Name and Email are required — the BA signs in with their email. City and Phone are optional.'],
    ['3. Password is optional. Leave it blank and one is generated automatically; or set your own (6+ characters).'],
    ['4. An email already used by another ambassador is skipped.'],
    ['5. Save the file, then upload it on the Ambassadors page. Sign-in details can be downloaded after creation.'],
    [],
    COLUMNS.map((c) => c.header),
    ['Ayesha Khan', 'Lahore', 'ayesha.khan@example.com', '0300-1234567', ''],
  ])
  help['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, SHEET)
  XLSX.utils.book_append_sheet(wb, help, 'Instructions')
  XLSX.writeFile(wb, 'Kashmir_Ambassador_Bulk_Upload_Template.xlsx')
}

export type ParsedAmbassadorRow = { row: number; input: BaAccountFields }
export type AmbassadorParseResult = { rows: ParsedAmbassadorRow[]; errors: string[] }

const headerKey = (h: unknown) => String(h ?? '').replace('*', '').trim().toLowerCase()
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

/** Reads a filled template. Valid rows are returned even when others have problems. */
export async function parseAmbassadorFile(file: File): Promise<AmbassadorParseResult> {
  const XLSX = await import('xlsx')

  let table: unknown[][]
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const name = wb.SheetNames.includes(SHEET) ? SHEET : wb.SheetNames[0]
    table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: '', raw: true })
  } catch {
    return { rows: [], errors: ['This file could not be read. Please upload the downloaded .xlsx template.'] }
  }

  const headerAt = table.findIndex((r) => r.some((c) => headerKey(c) === 'name'))
  if (headerAt === -1) {
    return {
      rows: [],
      errors: ['This is not the ambassador template (no "Name" column). Download the template and fill that.'],
    }
  }
  const col = new Map<string, number>()
  table[headerAt].forEach((h, i) => col.set(headerKey(h), i))
  const cell = (r: unknown[], header: string) => {
    const v = r[col.get(header) ?? -1]
    return v === undefined || v === null ? '' : String(v).trim()
  }

  const rows: ParsedAmbassadorRow[] = []
  const errors: string[] = []
  const seen = new Set<string>()

  table.slice(headerAt + 1).forEach((r, i) => {
    const rowNo = headerAt + i + 2
    if (r.every((c) => String(c ?? '').trim() === '')) return

    const name = cell(r, 'name')
    const city = cell(r, 'city')
    const email = cell(r, 'email')
    const phone = cell(r, 'phone')
    const password = cell(r, 'password') || generatePassword()
    const problems: string[] = []
    if (!name) problems.push('Name is required')
    if (!email) problems.push('Email is required')
    else if (!validEmail(email)) problems.push(`Email looks invalid (found "${email}")`)
    if (password.length < 6) problems.push('Password must be at least 6 characters')

    if (email) {
      const key = normEmail(email)
      if (seen.has(key)) problems.push('Duplicate of an earlier row in this file')
      else if (baEmailInUse(email)) problems.push('An ambassador with this email already exists')
      seen.add(key)
    }

    if (problems.length > 0) {
      errors.push(`Row ${rowNo}${name ? ` (${name})` : ''}: ${problems.join('; ')}.`)
      return
    }
    rows.push({ row: rowNo, input: { name, city, email, phone, password } })
  })

  if (rows.length === 0 && errors.length === 0) errors.push('No ambassadors found. Add one per row under the header.')
  return { rows, errors }
}

/** Downloads a sheet of ambassador sign-in details, shown only once — passwords are hashed after this. */
export async function downloadBaCredentials(list: { name: string; email: string; password: string }[]) {
  const XLSX = await import('xlsx')
  const url = `${window.location.origin}/login`
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Name', 'Email', 'Password', 'Sign in at'],
    ...list.map((a) => [a.name, a.email, a.password, url]),
  ])
  sheet['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 18 }, { wch: 36 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Sign-in details')
  XLSX.writeFile(wb, 'Kashmir_Ambassador_Sign_In_Details.xlsx')
}
