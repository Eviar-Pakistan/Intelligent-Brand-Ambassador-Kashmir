/**
 * Supervisors oversee assigned stores (+ BAs in those stores).
 * When HO is authenticated, CRUD + overview hit Django; login uses JWT (user_type=5).
 */

import { useEffect, useSyncExternalStore } from 'react'
import { ambassadors, baRanking, stores, type Store } from '../data/mock'
import { apiRequest, isApiAuthenticated } from './api'
import { loginWithEmail, logoutApi, type AuthUser } from './auth'
import { getBaAccounts } from './baAccounts'
import { sha256Hex } from './sha256'

function baCodeForRow(id: string, code?: string | null): string {
  const direct = (code || '').trim()
  if (direct) return direct
  const fromAccount = getBaAccounts().find((a) => a.id === String(id))?.code
  return (fromAccount || '').trim()
}

export type Supervisor = {
  id: string
  name: string
  phone: string
  /** Also the sign-in name */
  email: string
  city: string
  storeIds: number[]
  createdAt: string
  passwordSalt: string
  /** non-empty when a password is set (API users always "set") */
  passwordHash: string
  /** Last password HO set — shown on Login screen (auth uses the hash). */
  loginPassword: string
}

const STORAGE_KEY = 'supervisors-v2'
const LEGACY_KEY = 'supervisors-v1'
const SESSION_KEY = 'supervisor-session'

/** Kept for offline seed password hashing demos */
export const hashPassword = (salt: string, password: string) => sha256Hex(`${salt}:${password}`)

const seed: Supervisor[] = []

function read(key: string): Partial<Supervisor>[] | null {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function mapApi(row: Record<string, unknown>): Supervisor {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    city: String(row.city ?? ''),
    storeIds: Array.isArray(row.storeIds) ? row.storeIds.map((x) => Number(x)) : [],
    createdAt: String(row.createdAt ?? new Date().toISOString()),
    passwordSalt: '',
    passwordHash: (row.passwordHash || row.hasPassword) ? 'set' : '',
    loginPassword: String(row.loginPassword ?? ''),
  }
}

function loadLocal(): Supervisor[] {
  const stored = read(STORAGE_KEY) ?? read(LEGACY_KEY)
  if (!stored) return seed
  return stored.map((s) => ({
    id: s.id ?? `sup-${Math.random().toString(36).slice(2, 8)}`,
    name: s.name ?? 'Supervisor',
    phone: s.phone ?? '',
    email: s.email ?? '',
    city: s.city ?? '',
    storeIds: s.storeIds ?? [],
    createdAt: s.createdAt ?? new Date().toISOString(),
    passwordSalt: s.passwordSalt ?? '',
    passwordHash: s.passwordHash ?? '',
    loginPassword: s.loginPassword ?? '',
  }))
}

let supervisors = loadLocal()
const listeners = new Set<() => void>()

function commit(next: Supervisor[], persistLocal = true) {
  supervisors = next
  if (persistLocal) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(supervisors))
    } catch {
      // keep in memory
    }
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useSupervisors() {
  return useSyncExternalStore(subscribe, () => supervisors)
}

export function getSupervisors() {
  return supervisors
}

export async function syncSupervisorsFromApi(): Promise<Supervisor[]> {
  if (!isApiAuthenticated()) return supervisors
  try {
    const data = await apiRequest<{ results: Record<string, unknown>[] }>('/api/supervisors/')
    const rows = (data.results ?? []).map(mapApi)
    commit(rows)
    return rows
  } catch {
    return supervisors
  }
}

/** Refresh list when HO supervisors pages mount. */
export function useSupervisorsSync() {
  const list = useSupervisors()
  useEffect(() => {
    void syncSupervisorsFromApi()
  }, [])
  return list
}

const normEmail = (email: string) => email.trim().toLowerCase()

export const SUPERVISOR_EMAIL_DOMAIN = 'kashmir.pk'

/** Turn "Ali Raza" into local-part "ali.raza". */
export function slugFromName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
  return slug || 'supervisor'
}

/** Unique sign-in email from name (checks in-memory supervisor list). */
export function generateSupervisorEmail(name: string, exceptId?: string) {
  const base = slugFromName(name)
  let candidate = `${base}@${SUPERVISOR_EMAIL_DOMAIN}`
  let n = 2
  while (emailInUse(candidate, exceptId)) {
    candidate = `${base}${n}@${SUPERVISOR_EMAIL_DOMAIN}`
    n += 1
  }
  return candidate
}

export function emailInUse(email: string, exceptId?: string) {
  const e = normEmail(email)
  return supervisors.some((s) => s.id !== exceptId && normEmail(s.email) === e)
}

export type SupervisorLoginOption = { email: string; name: string }

/** Public directory for the login dropdown (no auth). */
export async function fetchSupervisorLoginOptions(): Promise<SupervisorLoginOption[]> {
  try {
    const data = await apiRequest<{ results: SupervisorLoginOption[] }>('/api/supervisor-logins/', { auth: false })
    return (data.results ?? []).map((r) => ({
      email: String(r.email ?? '').trim().toLowerCase(),
      name: String(r.name ?? '').trim() || String(r.email ?? ''),
    }))
  } catch {
    // Offline fallback: local supervisors already in memory
    return supervisors
      .filter((s) => s.email)
      .map((s) => ({ email: normEmail(s.email), name: s.name }))
  }
}

export function generatePassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => chars[b % chars.length]).join('')
}

export async function createSupervisor(
  fields: { name: string; phone: string; email: string; city: string; password: string },
  storeIds: number[],
): Promise<Supervisor> {
  if (isApiAuthenticated()) {
    const created = await apiRequest<Record<string, unknown>>('/api/supervisors/', {
      method: 'POST',
      body: {
        name: fields.name.trim(),
        phone: fields.phone.trim(),
        email: fields.email.trim(),
        city: fields.city.trim(),
        password: fields.password,
        storeIds,
      },
    })
    const mapped = mapApi(created)
    commit([mapped, ...supervisors.filter((s) => s.id !== mapped.id)])
    return mapped
  }

  // Offline fallback (local only)
  const supervisor: Supervisor = {
    id: `sup-${Date.now().toString(36)}`,
    name: fields.name.trim(),
    phone: fields.phone.trim(),
    email: fields.email.trim(),
    city: fields.city.trim(),
    storeIds,
    createdAt: new Date().toISOString(),
    passwordSalt: 'local',
    passwordHash: hashPassword('local', fields.password),
    loginPassword: fields.password,
  }
  commit([supervisor, ...supervisors.filter((s) => s.id !== supervisor.id)])
  return supervisor
}

export async function setLogin(supervisorId: string, email: string, password: string) {
  if (isApiAuthenticated()) {
    const saved = await apiRequest<Record<string, unknown>>(`/api/supervisors/${supervisorId}/set-login/`, {
      method: 'POST',
      body: { email, password },
    })
    const mapped = mapApi(saved)
    commit(supervisors.map((s) => (s.id === supervisorId ? mapped : s)))
    return
  }
  commit(
    supervisors.map((s) =>
      s.id === supervisorId
        ? {
            ...s,
            email: email.trim(),
            passwordSalt: 'local',
            passwordHash: hashPassword('local', password),
            loginPassword: password,
          }
        : s,
    ),
  )
}

/** Excel of supervisors with email + last HO-saved password (empty if never saved for viewing). */
export async function downloadSupervisorLogins(
  list: { name: string; email: string; password: string }[],
) {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Name', 'Email', 'Password'],
    ...list.map((s) => [s.name, s.email, s.password || '']),
  ])
  sheet['!cols'] = [{ wch: 24 }, { wch: 32 }, { wch: 18 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Supervisor logins')
  XLSX.writeFile(wb, 'Kashmir_Supervisor_Logins.xlsx')
}

export async function assignStores(supervisorId: string, storeIds: number[]) {
  if (isApiAuthenticated()) {
    const saved = await apiRequest<Record<string, unknown>>(`/api/supervisors/${supervisorId}/assign-stores/`, {
      method: 'POST',
      body: { storeIds },
    })
    const mapped = mapApi(saved)
    // exclusivity is enforced on server; refresh list lightly
    commit(
      supervisors.map((s) => {
        if (s.id === supervisorId) return mapped
        return { ...s, storeIds: s.storeIds.filter((id) => !storeIds.includes(id)) }
      }),
    )
    return
  }
  commit(
    supervisors.map((s) =>
      s.id === supervisorId
        ? { ...s, storeIds }
        : { ...s, storeIds: s.storeIds.filter((id) => !storeIds.includes(id)) },
    ),
  )
}

export async function deleteSupervisor(supervisorId: string) {
  if (isApiAuthenticated()) {
    await apiRequest(`/api/supervisors/${supervisorId}/`, { method: 'DELETE' })
  }
  commit(supervisors.filter((s) => s.id !== supervisorId))
  if (readSession()?.id === supervisorId) signOut()
}

export function supervisorOfStore(storeId: number) {
  return supervisors.find((s) => s.storeIds.includes(storeId)) ?? null
}

// ─── Signing in ──────────────────────────────────────────────────────────────

export type SupervisorSession = { id: string; preview: boolean }

const sessionListeners = new Set<() => void>()
let sessionCache: string | null | undefined

function readRaw() {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

function readSession(): SupervisorSession | null {
  try {
    const raw = readRaw()
    return raw ? (JSON.parse(raw) as SupervisorSession) : null
  } catch {
    return null
  }
}

export function signIn(id: string, preview = false) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id, preview } satisfies SupervisorSession))
  } catch {
    // ignore
  }
  sessionCache = undefined
  sessionListeners.forEach((l) => l())
}

export function signOut() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
  sessionCache = undefined
  sessionListeners.forEach((l) => l())
}

/** JWT login for supervisor accounts (user_type = 5). */
export async function loginSupervisorWithApi(email: string, password: string): Promise<Supervisor | null> {
  const { user } = await loginWithEmail(email, password)
  if (user.user_type !== 5) {
    logoutApi()
    return null
  }
  const profile = await apiRequest<Record<string, unknown>>('/api/supervisor/me/')
  const mapped = mapApi(profile)
  commit([mapped, ...supervisors.filter((s) => s.id !== mapped.id)])
  signIn(mapped.id, false)
  return mapped
}

/** Load profile for current JWT if supervisor. */
export async function hydrateSupervisorFromToken(user?: AuthUser | null): Promise<Supervisor | null> {
  if (!isApiAuthenticated()) return null
  try {
    const me = user ?? (await apiRequest<AuthUser>('/auth/users/me/'))
    if (me.user_type !== 5) return null
    const profile = await apiRequest<Record<string, unknown>>('/api/supervisor/me/')
    const mapped = mapApi(profile)
    commit([mapped, ...supervisors.filter((s) => s.id !== mapped.id)])
    signIn(mapped.id, false)
    return mapped
  } catch {
    return null
  }
}

/** Legacy local authenticate (offline seed only). */
export function authenticate(email: string, password: string): Supervisor | null {
  const found = supervisors.find((s) => normEmail(s.email) === normEmail(email))
  if (!found || !found.passwordHash || !found.passwordSalt) return null
  return hashPassword(found.passwordSalt, password) === found.passwordHash ? found : null
}

export function useSupervisorSession() {
  const list = useSupervisors()
  const raw = useSyncExternalStore(
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
  let session: SupervisorSession | null = null
  try {
    session = raw ? (JSON.parse(raw) as SupervisorSession) : null
  } catch {
    session = null
  }
  const supervisor = session ? (list.find((s) => s.id === session.id) ?? null) : null
  return { supervisor, preview: !!session?.preview }
}

// ─── Overview ────────────────────────────────────────────────────────────────

export type SupervisorBa = {
  id: string
  name: string
  code?: string
  storeId: number
  store: string
  state: 'Active' | 'Break' | 'Offline'
  conversion: number
  points: number
  sessions: number
  score: number
  /** Monthly target kg from Ambassadors (BaTarget). null when unset. */
  targetKg: number | null
  /** Checkout form sales total (LTR/KG) for the month. */
  salesKg: number
  /** salesKg / targetKg * 100. null when no target set. */
  targetAchievement: number | null
}

export type SupervisorOverview = {
  stores: Store[]
  bas: SupervisorBa[]
  teamConversion: number
  coverage: number
  todayFootfall: number
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

/** Local/mock fallback overview. */
export function supervisorOverview(supervisor: Supervisor): SupervisorOverview {
  const mine = stores.filter((s) => supervisor.storeIds.includes(s.id))

  const bas: SupervisorBa[] = mine.flatMap((store) =>
    store.assigned.map((a) => {
      const ranked = baRanking.find((b) => b.id === a.id)
      const profile = ambassadors.find((p) => p.id === a.id)
      const code = baCodeForRow(a.id, a.code)
      return {
        id: a.id,
        name: a.name,
        ...(code ? { code } : {}),
        storeId: store.id,
        store: store.name,
        state: a.state,
        conversion: ranked?.conversion ?? profile?.today.rate ?? 0,
        points: ranked?.points ?? profile?.points ?? 0,
        sessions: profile?.today.interactions ?? 0,
        score: profile?.score ?? 0,
        targetKg: profile?.score ?? null,
        salesKg: 0,
        targetAchievement: profile?.score ?? null,
      }
    }),
  )

  const uniqueBas = new Map(bas.map((b) => [b.id, b]))
  return {
    stores: mine,
    bas,
    teamConversion: Math.round(mean([...uniqueBas.values()].map((b) => b.conversion)) * 10) / 10,
    coverage: Math.round(mean(mine.map((s) => s.coverage)) * 10) / 10,
    todayFootfall: mine.reduce((s, x) => s + x.todayFootfall, 0),
  }
}

function mapOverview(data: Record<string, unknown>): SupervisorOverview {
  const storesRaw = Array.isArray(data.stores) ? data.stores : []
  const basRaw = Array.isArray(data.bas) ? data.bas : []
  const mappedStores: Store[] = storesRaw.map((s) => {
    const row = s as Record<string, unknown>
    return {
      id: Number(row.id),
      name: String(row.name ?? ''),
      city: String(row.city ?? ''),
      footfall: (row.footfall as Store['footfall']) || 'Medium',
      bas: Number(row.bas ?? 0),
      coverage: Number(row.coverage ?? 0),
      status: (row.status as Store['status']) || 'PARTIAL',
      todayFootfall: Number(row.todayFootfall ?? 0),
      engagement: Number(row.engagement ?? 0),
      conversion: Number(row.conversion ?? 0),
      peak: Array.isArray(row.peak) ? (row.peak as string[]) : [],
      assigned: Array.isArray(row.assigned)
        ? (row.assigned as Store['assigned']).map((a) => {
            const id = String(a.id)
            const code = baCodeForRow(id, a.code)
            return {
              id,
              name: String(a.name),
              ...(code ? { code } : {}),
              state:
                a.state === 'Active' || a.state === 'Break'
                  ? a.state
                  : ('Offline' as const),
            }
          })
        : [],
      qrCode: String(row.qrCode ?? ''),
    }
  })
  const bas: SupervisorBa[] = basRaw.map((b) => {
    const row = b as Record<string, unknown>
    const state = String(row.state ?? 'Offline')
    const id = String(row.id ?? '')
    const code = baCodeForRow(id, row.code == null ? '' : String(row.code))
    return {
      id,
      name: String(row.name ?? ''),
      ...(code ? { code } : {}),
      storeId: Number(row.storeId ?? 0),
      store: String(row.store ?? ''),
      state: state === 'Active' || state === 'Break' ? state : 'Offline',
      conversion: Number(row.conversion ?? 0),
      points: Number(row.points ?? 0),
      sessions: Number(row.sessions ?? 0),
      score: Number(row.score ?? 0),
      targetKg:
        row.targetKg == null || row.targetKg === '' ? null : Number(row.targetKg),
      salesKg: Number(row.salesKg ?? 0),
      targetAchievement:
        row.targetAchievement == null || row.targetAchievement === ''
          ? null
          : Number(row.targetAchievement),
    }
  })
  return {
    stores: mappedStores,
    bas,
    teamConversion: Number(data.teamConversion ?? 0),
    coverage: Number(data.coverage ?? 0),
    todayFootfall: Number(data.todayFootfall ?? 0),
  }
}

export async function fetchSupervisorOverview(supervisorId: string): Promise<SupervisorOverview | null> {
  if (!isApiAuthenticated()) return null
  const data = await apiRequest<Record<string, unknown>>(`/api/supervisors/${supervisorId}/overview/`)
  return mapOverview(data)
}

export async function fetchMySupervisorOverview(): Promise<SupervisorOverview | null> {
  if (!isApiAuthenticated()) return null
  const data = await apiRequest<Record<string, unknown>>('/api/supervisor/me/overview/')
  return mapOverview(data)
}

export type SupervisorBaDailyReport = {
  baId: string
  baCode: string
  baName: string
  storeName: string
  city: string
  /** False when this BA is under the supervisor but did not submit for the date. */
  submitted: boolean
  source: string
  stock: Record<string, string>
  sales: Record<string, string | number>
  otherBrands: { id?: string; name?: string; price?: string }[]
}

export async function fetchSupervisorReportDates(
  mode: 'ho' | 'me',
  supervisorId: string,
): Promise<string[]> {
  if (!isApiAuthenticated()) return []
  const path =
    mode === 'me'
      ? '/api/supervisor/me/report-dates/'
      : `/api/supervisors/${supervisorId}/report-dates/`
  const data = await apiRequest<{ dates?: string[] }>(path)
  return Array.isArray(data.dates) ? data.dates.map(String) : []
}

export async function fetchSupervisorReportsForDate(
  mode: 'ho' | 'me',
  supervisorId: string,
  date: string,
): Promise<{ date: string; reports: SupervisorBaDailyReport[] }> {
  if (!isApiAuthenticated()) return { date, reports: [] }
  const path =
    mode === 'me'
      ? `/api/supervisor/me/reports/?date=${encodeURIComponent(date)}`
      : `/api/supervisors/${supervisorId}/reports/?date=${encodeURIComponent(date)}`
  const data = await apiRequest<{ date?: string; reports?: unknown[] }>(path)
  const reports: SupervisorBaDailyReport[] = (Array.isArray(data.reports) ? data.reports : []).map(
    (raw) => {
      const row = raw as Record<string, unknown>
      const stock =
        row.stock && typeof row.stock === 'object' && !Array.isArray(row.stock)
          ? (row.stock as Record<string, string>)
          : {}
      const sales =
        row.sales && typeof row.sales === 'object' && !Array.isArray(row.sales)
          ? (row.sales as Record<string, string | number>)
          : {}
      const otherBrands = Array.isArray(row.otherBrands)
        ? (row.otherBrands as SupervisorBaDailyReport['otherBrands'])
        : []
      const submitted =
        typeof row.submitted === 'boolean'
          ? row.submitted
          : Object.keys(stock).length > 0 ||
            Object.keys(sales).length > 0 ||
            otherBrands.length > 0
      return {
        baId: String(row.baId ?? ''),
        baCode: String(row.baCode ?? ''),
        baName: String(row.baName ?? ''),
        storeName: String(row.storeName ?? ''),
        city: String(row.city ?? ''),
        submitted,
        source: String(row.source ?? ''),
        stock,
        sales,
        otherBrands,
      }
    },
  )
  return { date: String(data.date ?? date), reports }
}

function excelSheetName(baCode: string, baName: string, used: Set<string>): string {
  const base = `${baCode || 'BA'} ${baName}`.replace(/[\\/?*[\]:]/g, ' ').trim() || 'BA'
  let name = base.slice(0, 31)
  let n = 2
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n})`
    name = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`
    n += 1
  }
  used.add(name.toLowerCase())
  return name
}

/** Build multi-sheet workbook: one sheet per BA for the selected date. */
export async function downloadSupervisorBaReportsExcel(
  date: string,
  reports: SupervisorBaDailyReport[],
  supervisorName: string,
) {
  const { stockSections, salesSections } = await import('./baReport')
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const usedNames = new Set<string>()

  if (!reports.length) {
    const empty = XLSX.utils.aoa_to_sheet([
      ['No ambassadors under this supervisor.'],
      ['Date', date],
      ['Supervisor', supervisorName],
    ])
    XLSX.utils.book_append_sheet(wb, empty, 'No BAs')
  } else {
    for (const report of reports) {
      const displayName = report.baName || report.baCode || 'This BA'
      let rows: (string | number)[][]

      if (!report.submitted) {
        rows = [
          ['BA Code', report.baCode],
          ['BA Name', report.baName],
          ['Store', report.storeName],
          ['City', report.city],
          ['Date', date],
          [],
          [
            `${displayName} did not submit a daily report for this date.`,
          ],
          ['No checkout / stock / sales data is available for this BA.'],
        ]
      } else {
        rows = [
          ['BA Code', report.baCode],
          ['BA Name', report.baName],
          ['Store', report.storeName],
          ['City', report.city],
          ['Date', date],
          ['Source', report.source],
          [],
          ['Section', 'Item', 'Value'],
        ]

        for (const section of stockSections) {
          for (const field of section.fields) {
            rows.push([`Stock – ${section.title}`, field.label, report.stock[field.key] ?? ''])
          }
        }
        for (const section of salesSections) {
          for (const field of section.fields) {
            const val = report.sales[field.key]
            rows.push([
              `Daily Sales – ${section.title}`,
              field.label,
              val == null || val === '' ? '' : val,
            ])
          }
        }
        const brands =
          report.otherBrands.length > 0 ? report.otherBrands : [{ name: '', price: '' }]
        for (const brand of brands) {
          rows.push(['Other Brands', String(brand.name ?? ''), String(brand.price ?? '')])
        }
      }

      const sheet = XLSX.utils.aoa_to_sheet(rows)
      sheet['!cols'] = [{ wch: 28 }, { wch: 42 }, { wch: 22 }]
      XLSX.utils.book_append_sheet(
        wb,
        sheet,
        excelSheetName(report.baCode, report.baName, usedNames),
      )
    }
  }

  const safeSup =
    supervisorName
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 60) || 'Supervisor'
  XLSX.writeFile(wb, `${safeSup}_BA_Daily_Reports_${date}.xlsx`)
}
