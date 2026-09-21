import { useSyncExternalStore } from 'react'
import { ambassadors, baRanking, stores, type Store } from '../data/mock'
import { sha256Hex } from './sha256'

/**
 * Supervisors oversee a set of stores. Head Office creates them (with a login) and assigns
 * stores; a supervisor signs in and sees the BAs and characteristics of those stores only.
 *
 * There is no backend, so supervisors and their sign-in live in this browser. Passwords are
 * salted and hashed rather than stored as text, but this is demo-grade access control: anyone
 * with access to the browser can read or change the data. Real sign-in needs a server.
 */

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
  /** sha256(`${salt}:${password}`); empty when no password has been set yet */
  passwordHash: string
}

const STORAGE_KEY = 'supervisors-v2'
const LEGACY_KEY = 'supervisors-v1'
const SESSION_KEY = 'supervisor-session'

export const hashPassword = (salt: string, password: string) => sha256Hex(`${salt}:${password}`)

const seed: Supervisor[] = [
  {
    id: 'sup-imran',
    name: 'Imran Sheikh',
    phone: '0300-5551201',
    email: 'imran.sheikh@example.com',
    city: 'Lahore',
    storeIds: [12, 4],
    createdAt: new Date().toISOString(),
    passwordSalt: 'demo',
    passwordHash: 'f356d35c8674d585ecea9033ee333fa506742b0a9be832cf749f308eaa45b720', // Imran@123
  },
  {
    id: 'sup-nadia',
    name: 'Nadia Hussain',
    phone: '0321-5551202',
    email: 'nadia.hussain@example.com',
    city: 'Karachi',
    storeIds: [7, 19],
    createdAt: new Date().toISOString(),
    passwordSalt: 'demo',
    passwordHash: 'a2edd105d785b2846faa86190432da9e2320e7cb06e1ab86a0514e8d73996f12', // Nadia@123
  },
]

function read(key: string): Partial<Supervisor>[] | null {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function load(): Supervisor[] {
  // supervisors made before sign-in existed carry over, without a password until Head Office sets one
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
  }))
}

let supervisors = load()
const listeners = new Set<() => void>()

function commit(next: Supervisor[]) {
  supervisors = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(supervisors))
  } catch {
    // keep in memory for this session
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

/** A store belongs to one supervisor, so assigning it here takes it from anyone else. */
function withStoresAssigned(list: Supervisor[], supervisorId: string, storeIds: number[]) {
  return list.map((s) =>
    s.id === supervisorId
      ? { ...s, storeIds }
      : { ...s, storeIds: s.storeIds.filter((id) => !storeIds.includes(id)) },
  )
}

const normEmail = (email: string) => email.trim().toLowerCase()

/** True when another supervisor already signs in with this email. */
export function emailInUse(email: string, exceptId?: string) {
  const e = normEmail(email)
  return supervisors.some((s) => s.id !== exceptId && normEmail(s.email) === e)
}

function newCredentials(password: string) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')
  return { passwordSalt: salt, passwordHash: hashPassword(salt, password) }
}

/** A readable password: no look-alike characters (0/O, 1/l/I). */
export function generatePassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => chars[b % chars.length]).join('')
}

export function createSupervisor(
  fields: { name: string; phone: string; email: string; city: string; password: string },
  storeIds: number[],
): Supervisor {
  const supervisor: Supervisor = {
    id: `sup-${Date.now().toString(36)}`,
    name: fields.name.trim(),
    phone: fields.phone.trim(),
    email: fields.email.trim(),
    city: fields.city.trim(),
    storeIds: [],
    createdAt: new Date().toISOString(),
    ...newCredentials(fields.password),
  }
  commit(withStoresAssigned([supervisor, ...supervisors], supervisor.id, storeIds))
  return { ...supervisor, storeIds }
}

/** Sets (or resets) the email and password a supervisor signs in with. */
export function setLogin(supervisorId: string, email: string, password: string) {
  commit(
    supervisors.map((s) => (s.id === supervisorId ? { ...s, email: email.trim(), ...newCredentials(password) } : s)),
  )
}

export function assignStores(supervisorId: string, storeIds: number[]) {
  commit(withStoresAssigned(supervisors, supervisorId, storeIds))
}

export function deleteSupervisor(supervisorId: string) {
  commit(supervisors.filter((s) => s.id !== supervisorId))
  if (readSession()?.id === supervisorId) signOut()
}

export function supervisorOfStore(storeId: number) {
  return supervisors.find((s) => s.storeIds.includes(storeId)) ?? null
}

// ─── Signing in ──────────────────────────────────────────────────────────────

/** The supervisor these credentials belong to, or null. */
export function authenticate(email: string, password: string): Supervisor | null {
  const found = supervisors.find((s) => normEmail(s.email) === normEmail(email))
  if (!found || !found.passwordHash) return null
  return hashPassword(found.passwordSalt, password) === found.passwordHash ? found : null
}

/** `preview` = Head Office looking at the portal as this supervisor, without their password. */
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

/** Who is signed in to the supervisor portal (null when nobody is, or the account was deleted). */
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

// ─── What a supervisor sees ──────────────────────────────────────────────────

export type SupervisorBa = {
  id: string
  name: string
  storeId: number
  store: string
  state: 'Active' | 'Break' | 'Offline'
  conversion: number
  points: number
  sessions: number
  score: number
}

export type SupervisorOverview = {
  stores: Store[]
  bas: SupervisorBa[]
  /** Average conversion of the BAs in these stores, % */
  teamConversion: number
  /** Average coverage of these stores, % */
  coverage: number
  todayFootfall: number
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

/** The stores assigned to a supervisor, the BAs working in them, and their headline numbers. */
export function supervisorOverview(supervisor: Supervisor): SupervisorOverview {
  const mine = stores.filter((s) => supervisor.storeIds.includes(s.id))

  const bas: SupervisorBa[] = mine.flatMap((store) =>
    store.assigned.map((a) => {
      const ranked = baRanking.find((b) => b.id === a.id)
      const profile = ambassadors.find((p) => p.id === a.id)
      return {
        id: a.id,
        name: a.name,
        storeId: store.id,
        store: store.name,
        state: a.state,
        conversion: ranked?.conversion ?? profile?.today.rate ?? 0,
        points: ranked?.points ?? profile?.points ?? 0,
        sessions: profile?.today.interactions ?? 0,
        score: profile?.score ?? 0,
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
