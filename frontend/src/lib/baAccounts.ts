import { useSyncExternalStore } from 'react'
import { ambassadors } from '../data/mock'
import type { AnswerMetrics, AssessmentResult } from './baAssessment'
import { allocateBaCode, baCodeForId } from './baCodes'

/**
 * Ambassadors created by Head Office. Each gets a personal invite link (no password).
 * Until certified they only use Training; after that the same link opens the full BA app.
 * Roster syncs from Django when HO is logged in; progress also caches in localStorage.
 */

export type BaStatus = 'Invited' | 'Training' | 'Certified' | 'Deployed'

export type BaAccount = {
  id: string
  name: string
  city: string
  email: string
  phone: string
  /** Human-facing code e.g. BA-006 (seed BAs use BA-001…BA-005). */
  code: string
  createdAt: string
  status: BaStatus
  videoWatched: boolean
  /** Answers submitted so far (one per assessment question) */
  answers: AnswerMetrics[]
  result: AssessmentResult | null
  /** Secret used in the personal account link. */
  accessToken: string
  /** Deployed home store (from Django). */
  storeId: number | null
  storeName: string
  /** Today's shift attendance clocks (filled when HO syncs shifts). */
  checkIn: string | null
  checkOut: string | null
}

/** True when BA has finished certification (may also be deployed). */
export function isBaCertified(status: BaStatus) {
  return status === 'Certified' || status === 'Deployed'
}

function newAccessToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Sample ambassadors from the Head Office table. Their links stay the same on every device. */
const DEMO_ACCESS_TOKENS: Record<string, string> = {
  ayesha: 'demo-ayesha',
  hamza: 'demo-hamza',
  sara: 'demo-sara',
  fatima: 'demo-fatima',
  bilal: 'demo-bilal',
}

function demoAccountStatus(status: string): BaStatus {
  if (status === 'Deployed') return 'Deployed'
  if (status === 'Certified') return 'Certified'
  if (status === 'Training') return 'Training'
  return 'Invited'
}

function demoAccounts(): BaAccount[] {
  return ambassadors.map((a) => ({
    id: a.id,
    name: a.name,
    city: a.city,
    email: `${a.id}@kashmir.demo`,
    phone: '',
    code: baCodeForId(a.id),
    createdAt: '2026-01-01T00:00:00.000Z',
    status: demoAccountStatus(a.status),
    videoWatched: a.status !== 'Pending',
    answers: [],
    result: null,
    accessToken: DEMO_ACCESS_TOKENS[a.id] ?? `demo-${a.id}`,
    storeId: null,
    storeName: '',
    checkIn: null,
    checkOut: null,
  }))
}

export function isDemoBa(id: string) {
  return ambassadors.some((a) => a.id === id)
}

function withDemoAccounts(list: BaAccount[]): BaAccount[] {
  const ids = new Set(list.map((a) => a.id))
  const missing = demoAccounts().filter((d) => !ids.has(d.id))
  return missing.length ? [...list, ...missing] : list
}

const STORAGE_KEY = 'ba-accounts-v1'
const SESSION_KEY = 'ba-session-v1'

function normalizeAccount(raw: Partial<BaAccount> & { passwordHash?: string }): BaAccount | null {
  if (!raw.id || !raw.name) return null
  return {
    id: raw.id,
    name: raw.name,
    city: raw.city ?? '',
    email: raw.email ?? '',
    phone: raw.phone ?? '',
    code: raw.code || baCodeForId(raw.id) || '',
    createdAt: raw.createdAt ?? new Date().toISOString(),
    status: raw.status ?? 'Invited',
    videoWatched: !!raw.videoWatched,
    answers: Array.isArray(raw.answers) ? raw.answers : [],
    result: raw.result ?? null,
    accessToken: raw.accessToken || newAccessToken(),
    storeId: typeof raw.storeId === 'number' ? raw.storeId : null,
    storeName: raw.storeName ?? '',
    checkIn: raw.checkIn ?? null,
    checkOut: raw.checkOut ?? null,
  }
}

function load(): BaAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return withDemoAccounts([])
    const list = withDemoAccounts(
      parsed
        .map((item) => normalizeAccount(item as Partial<BaAccount>))
        .filter((a): a is BaAccount => !!a),
    )
    const needsSave =
      list.length !== parsed.length ||
      parsed.some(
        (item) =>
          item &&
          typeof item === 'object' &&
          (!('accessToken' in item) || !item.accessToken || 'passwordHash' in item),
      )
    if (needsSave) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
      } catch {
        // keep the in-memory list
      }
    }
    return list
  } catch {
    return withDemoAccounts([])
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

/** Current BA list (module snapshot — use after syncAmbassadorsFromApi). */
export function getBaAccounts() {
  return accounts
}

const normEmail = (email: string) => email.trim().toLowerCase()

export const BA_EMAIL_DOMAIN = 'kashmir.pk'

/** Turn "Ammara Bibi" into local-part "ammara.bibi". */
export function slugFromBaName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
  return slug || 'ambassador'
}

/** Unique BA email from name (Excel email column is ignored on bulk upload). */
export function generateBaEmail(name: string, reserved: Set<string> = new Set()) {
  const base = slugFromBaName(name)
  let candidate = `${base}@${BA_EMAIL_DOMAIN}`
  let n = 2
  while (baEmailInUse(candidate) || reserved.has(normEmail(candidate))) {
    candidate = `${base}${n}@${BA_EMAIL_DOMAIN}`
    n += 1
  }
  return candidate
}

/** True when another ambassador already uses this email. */
export function baEmailInUse(email: string, exceptId?: string) {
  const e = normEmail(email)
  return !!e && accounts.some((a) => a.id !== exceptId && normEmail(a.email) === e)
}

export type BaAccountFields = { name: string; city: string; email: string; phone: string }

function toAccount(fields: BaAccountFields, code: string): BaAccount {
  return {
    id: `ba-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: fields.name.trim(),
    city: fields.city.trim(),
    email: fields.email.trim(),
    phone: fields.phone.trim(),
    code,
    createdAt: new Date().toISOString(),
    status: 'Invited',
    videoWatched: false,
    answers: [],
    result: null,
    accessToken: newAccessToken(),
    storeId: null,
    storeName: '',
    checkIn: null,
    checkOut: null,
  }
}

export function baAccessPath(token: string) {
  return `/ba/open/${token}`
}

/** Full URL the ambassador opens to enter their account. */
export function baAccessUrl(account: BaAccount) {
  return `${window.location.origin}${baAccessPath(account.accessToken)}`
}

export function findBaByAccessToken(token: string): BaAccount | null {
  return accounts.find((a) => a.accessToken === token) ?? null
}

export function createBaAccount(fields: BaAccountFields): BaAccount {
  const account = toAccount(fields, allocateBaCode(accounts))
  commit([account, ...accounts])
  return account
}

/** Creates many accounts at once, e.g. from a bulk Excel upload. Returns them in input order. */
export function createBaAccounts(fields: BaAccountFields[]): BaAccount[] {
  let pool = accounts
  const added = fields.map((f) => {
    const account = toAccount(f, allocateBaCode(pool))
    pool = [account, ...pool]
    return account
  })
  commit([...added.slice().reverse(), ...accounts])
  return added
}

// ─── Backend API (Django) ────────────────────────────────────────────────────

type ApiAmbassador = {
  id: number
  code?: string
  name: string
  email?: string
  city?: string
  phone?: string
  status?: string
  invite_token?: string
  training_url?: string
  overall_score?: number | null
  report_json?: Record<string, unknown> | null
  certified_at?: string | null
  store?: number | null
  store_name?: string | null
  store_city?: string | null
  created_at?: string
}

function mapApiBaStatus(status?: string): BaStatus {
  if (status === 'Deployed') return 'Deployed'
  if (status === 'Certified') return 'Certified'
  if (status === 'Training' || status === 'Assessed') return 'Training'
  return 'Invited'
}

/** Prefer API roster status; keep Certified if local assessment already passed. */
function mergeBaStatus(
  apiStatus: BaStatus,
  existing?: BaAccount | null,
  result?: BaAccount['result'],
): BaStatus {
  if (apiStatus === 'Deployed') return 'Deployed'
  if (apiStatus === 'Certified') return 'Certified'
  if (existing?.status === 'Certified' || existing?.result?.certified || result?.certified) {
    return 'Certified'
  }
  if (existing?.status === 'Training' && apiStatus === 'Invited') return 'Training'
  return apiStatus
}

function resultFromApi(a: ApiAmbassador, existing?: BaAccount | null) {
  if (existing?.result) return existing.result
  const report = a.report_json
  if (report && typeof report === 'object' && typeof report.quality === 'number') {
    return {
      quality: Number(report.quality),
      communication: Number(report.communication ?? report.quality),
      relevance: Number(report.relevance ?? report.quality),
      alignment: Number(report.alignment ?? report.quality),
      wpm: Number(report.wpm ?? 0),
      nervousness: Number(report.nervousness ?? 0),
      mood: (report.mood as 'Positive' | 'Neutral' | 'Negative') || 'Neutral',
      certified: Boolean(report.certified ?? (a.status === 'Certified' || a.status === 'Deployed')),
      usedTranscript: Boolean(report.usedTranscript),
      completedAt: String(report.completedAt || a.certified_at || new Date().toISOString()),
    }
  }
  if (typeof a.overall_score === 'number') {
    const certified = a.status === 'Certified' || a.status === 'Deployed'
    return {
      quality: a.overall_score,
      communication: a.overall_score,
      relevance: a.overall_score,
      alignment: a.overall_score,
      wpm: 0,
      nervousness: 0,
      mood: 'Neutral' as const,
      certified,
      usedTranscript: false,
      completedAt: a.certified_at || new Date().toISOString(),
    }
  }
  return null
}

function formatClock(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function apiAmbassadorToAccount(a: ApiAmbassador, existing?: BaAccount | null): BaAccount {
  const result = resultFromApi(a, existing)
  const status = mergeBaStatus(mapApiBaStatus(a.status), existing, result)
  const storeId = typeof a.store === 'number' ? a.store : null
  const storeName = a.store_name || ''
  const videoWatched =
    isBaCertified(status) ? true : result ? true : !!existing?.videoWatched
  return {
    id: String(a.id),
    name: a.name,
    city: a.city || a.store_city || '',
    email: a.email || '',
    phone: a.phone || '',
    code: a.code || '',
    createdAt: a.created_at || existing?.createdAt || new Date().toISOString(),
    status,
    videoWatched,
    answers: existing?.answers?.length ? existing.answers : [],
    result,
    accessToken: a.invite_token || existing?.accessToken || newAccessToken(),
    storeId,
    storeName,
    checkIn: existing?.checkIn ?? null,
    checkOut: existing?.checkOut ?? null,
  }
}

function findExistingForApi(a: ApiAmbassador): BaAccount | null {
  const byId = accounts.find((x) => x.id === String(a.id))
  if (byId) return byId
  if (a.invite_token) return accounts.find((x) => x.accessToken === a.invite_token) ?? null
  return null
}

function upsertAccount(account: BaAccount) {
  const rest = accounts.filter((a) => a.id !== account.id && a.accessToken !== account.accessToken)
  commit([account, ...rest])
}

/** Sync BA roster from Django into local account list. */
export async function syncAmbassadorsFromApi() {
  const { apiRequest, isApiAuthenticated } = await import('./api')
  if (!isApiAuthenticated()) return []
  const list = await apiRequest<ApiAmbassador[]>('/api/ambassadors/')
  // Full replace from API (drops deleted BAs from local cache); demos stay available
  const live = list.map((a) => apiAmbassadorToAccount(a))
  commit(withDemoAccounts(live))
  await enrichAttendanceFromShifts().catch(() => {})
  void healCertifiedToApi(list)
  return list
}

/** Merge today's shift clocks onto BA accounts for the HO Ambassadors table. */
async function enrichAttendanceFromShifts() {
  const { apiRequest, isApiAuthenticated } = await import('./api')
  if (!isApiAuthenticated()) return
  const today = new Date()
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const data = await apiRequest<{
    results: {
      baId: string | null
      dateIso: string
      storeId: number
      storeName: string
      checkedInAt?: string | null
      checkedOutAt?: string | null
    }[]
  }>(`/api/shifts/?week_start=${encodeURIComponent(ymd)}`)
  // Prefer today's shift per BA; fall back to any scheduled shift in the returned week.
  const byBa = new Map<
    string,
    { storeId: number; storeName: string; checkIn: string | null; checkOut: string | null; today: boolean }
  >()
  for (const s of data.results || []) {
    if (!s.baId) continue
    const isToday = s.dateIso === ymd
    const prev = byBa.get(s.baId)
    if (prev?.today && !isToday) continue
    byBa.set(s.baId, {
      storeId: s.storeId,
      storeName: s.storeName,
      checkIn: formatClock(s.checkedInAt),
      checkOut: formatClock(s.checkedOutAt),
      today: isToday,
    })
  }
  if (!byBa.size) return
  commit(
    accounts.map((a) => {
      const hit = byBa.get(a.id)
      if (!hit) {
        // No shift this week — clear clocks; keep store only if API already set Deployed.
        return { ...a, checkIn: null, checkOut: null }
      }
      return {
        ...a,
        // Prefer ambassador home store from API; fall back to shift store for display.
        storeId: a.storeId ?? hit.storeId,
        storeName: a.storeName || hit.storeName,
        checkIn: hit.today ? hit.checkIn : null,
        checkOut: hit.today ? hit.checkOut : null,
      }
    }),
  )
}

/** Re-submit local Certified results when the API still says Training. */
async function healCertifiedToApi(apiList: ApiAmbassador[]) {
  for (const a of apiList) {
    if (a.status === 'Certified' || a.status === 'Deployed') continue
    const local = findExistingForApi(a)
    if (!local?.result?.certified || !local.accessToken || local.accessToken.startsWith('demo-')) continue
    try {
      await syncAssessmentResultToApi(local, local.result)
    } catch (err) {
      console.warn('[ba] failed to heal certification to API', a.name, err)
    }
  }
}

/** Create one BA via API when logged in; otherwise local-only. */
export async function createBaAccountAsync(fields: BaAccountFields): Promise<BaAccount> {
  const { apiRequest, isApiAuthenticated } = await import('./api')
  if (!isApiAuthenticated()) return createBaAccount(fields)

  const a = await apiRequest<ApiAmbassador>('/api/ambassadors/', {
    method: 'POST',
    body: {
      name: fields.name.trim(),
      email: fields.email.trim(),
      city: fields.city.trim(),
      phone: fields.phone.trim(),
    },
  })
  const account = apiAmbassadorToAccount(a)
  upsertAccount(account)
  return account
}

export async function createBaAccountsAsync(fields: BaAccountFields[]): Promise<{
  created: BaAccount[]
  errors: string[]
}> {
  const { isApiAuthenticated } = await import('./api')
  if (!isApiAuthenticated()) {
    return { created: createBaAccounts(fields), errors: [] }
  }
  const created: BaAccount[] = []
  const errors: string[] = []
  for (const f of fields) {
    try {
      created.push(await createBaAccountAsync(f))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'create failed'
      errors.push(`${f.name} (${f.email}): ${msg}`)
    }
  }
  return { created, errors }
}

export type InviteTrainingPayload = {
  ready?: boolean
  has_video?: boolean
  has_questions?: boolean
  question_count?: number
  questions?: { id?: string; question?: string; title?: string; description?: string; type?: string }[]
  original_name?: string | null
  uploaded_at?: string | null
  transcript_preview?: string
  video_url?: string | null
}

/** Latest training snapshot from BA invite lookup (for onboarding video/questions). */
let inviteTraining: InviteTrainingPayload | null = null
const inviteTrainingListeners = new Set<() => void>()

export function getInviteTraining() {
  return inviteTraining
}

export function setInviteTraining(payload: InviteTrainingPayload | null) {
  inviteTraining = payload
  inviteTrainingListeners.forEach((l) => l())
}

export function subscribeInviteTraining(listener: () => void) {
  inviteTrainingListeners.add(listener)
  return () => {
    inviteTrainingListeners.delete(listener)
  }
}

/**
 * Resolve a personal BA link token against the backend, cache the account locally, and return it.
 */
export async function resolveBaInvite(token: string): Promise<BaAccount | null> {
  try {
    const { apiRequest } = await import('./api')
    const data = await apiRequest<{
      ambassador: ApiAmbassador
      certified: boolean
      training?: InviteTrainingPayload
    }>(`/api/ba/invite/${encodeURIComponent(token)}/`, { auth: false })

    if (data.training) setInviteTraining(data.training)
    else setInviteTraining(null)

    const existing = findExistingForApi({
      ...data.ambassador,
      invite_token: data.ambassador.invite_token || token,
    })
    const account = apiAmbassadorToAccount(
      {
        ...data.ambassador,
        invite_token: data.ambassador.invite_token || token,
        status: data.certified ? 'Certified' : data.ambassador.status,
      },
      existing,
    )
    // Uncertified BAs who haven't started assessment answers must watch the video.
    // Clears stuck localStorage from older builds that marked Training as already watched.
    if (!data.certified && !account.result && account.answers.length === 0) {
      account.videoWatched = false
    }
    upsertAccount(account)
    return account
  } catch {
    return findBaByAccessToken(token)
  }
}

/**
 * Push one scored answer into Django AssessmentAnswer (via open session).
 */
export async function syncAnswerToApi(
  account: BaAccount,
  metrics: import('./baAssessment').AnswerMetrics,
) {
  if (!account.accessToken || account.accessToken.startsWith('demo-')) return null
  const { apiRequest } = await import('./api')
  return apiRequest<{ ok: boolean; sessionId: string; answerId: number }>('/api/ba/store-answer/', {
    method: 'POST',
    auth: false,
    body: {
      token: account.accessToken,
      questionId: metrics.questionId,
      prompt: metrics.prompt,
      transcript: metrics.transcript,
      communication: metrics.communication,
      relevance: metrics.relevance,
      alignment: metrics.alignment,
      wpm: metrics.wpm,
      nervousness: metrics.nervousness,
      moodScore: metrics.moodScore,
      words: metrics.words,
      durationSec: metrics.durationSec,
      usedTranscript: metrics.usedTranscript,
    },
  })
}

/**
 * Push client-side assessment outcome to Django so HO Ambassadors list shows Certified.
 * Also persists all answers into AssessmentAnswer rows.
 * Throws on network/API failure so callers can surface or retry.
 */
export async function syncAssessmentResultToApi(
  account: BaAccount,
  result: import('./baAssessment').AssessmentResult,
) {
  if (!account.accessToken || account.accessToken.startsWith('demo-')) return null
  const { apiRequest } = await import('./api')
  const data = await apiRequest<ApiAmbassador>('/api/ba/complete-assessment/', {
    method: 'POST',
    auth: false,
    body: {
      token: account.accessToken,
      certified: result.certified,
      overall_score: result.quality,
      report_json: {
        quality: result.quality,
        communication: result.communication,
        relevance: result.relevance,
        alignment: result.alignment,
        wpm: result.wpm,
        nervousness: result.nervousness,
        mood: result.mood,
        certified: result.certified,
        usedTranscript: result.usedTranscript,
        completedAt: result.completedAt,
        answers: account.answers,
      },
    },
  })
  upsertAccount(apiAmbassadorToAccount(data, account))
  return data
}

export function updateBaAccount(id: string, patch: Partial<BaAccount>) {
  commit(accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)))
}

// ─── Signing in (via the personal account link) ─────────────────────────────

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
  { key: 'phone', header: 'Phone', width: 18 },
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
    ['2. Name is required. City and Phone are optional. Email is auto-generated (email column is ignored if present).'],
    ['3. Each ambassador gets a personal account link after creation. They open that link to enter their account.'],
    ['4. Save the file, then upload it on the Ambassadors page. Account links can be downloaded after creation.'],
    [],
    COLUMNS.map((c) => c.header),
    ['Ayesha Khan', 'Lahore', '0300-1234567'],
  ])
  help['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, SHEET)
  XLSX.utils.book_append_sheet(wb, help, 'Instructions')
  XLSX.writeFile(wb, 'Kashmir_Ambassador_Bulk_Upload_Template.xlsx')
}

export type ParsedAmbassadorRow = { row: number; input: BaAccountFields }
export type AmbassadorParseResult = {
  rows: ParsedAmbassadorRow[]
  errors: string[]
  skippedNoEmail?: number
}

const headerKey = (h: unknown) => String(h ?? '').replace('*', '').trim().toLowerCase()

/** Reads a filled template. Every named row is created; Excel email column is ignored. */
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
  const reservedEmails = new Set<string>()

  table.slice(headerAt + 1).forEach((r, i) => {
    const rowNo = headerAt + i + 2
    if (r.every((c) => String(c ?? '').trim() === '')) return

    const name = cell(r, 'name')
    const city = cell(r, 'city')
    const phone = cell(r, 'phone')

    if (!name) {
      errors.push(`Row ${rowNo}: Name is required.`)
      return
    }

    // Ignore Excel email column — always generate from name
    const email = generateBaEmail(name, reservedEmails)
    reservedEmails.add(normEmail(email))

    rows.push({ row: rowNo, input: { name, city, email, phone } })
  })

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No ambassadors found. Add one per row under the header.')
  }
  return { rows, errors, skippedNoEmail: 0 }
}

/** Downloads BA names with their personal profile / account links. */
export async function downloadBaLinks(
  list: { name: string; url: string; email?: string; code?: string }[],
) {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Name', 'Profile Link'],
    ...list.map((a) => [a.name, a.url]),
  ])
  sheet['!cols'] = [{ wch: 28 }, { wch: 72 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'BA links')
  XLSX.writeFile(wb, 'Kashmir_BA_Profile_Links.xlsx')
}
