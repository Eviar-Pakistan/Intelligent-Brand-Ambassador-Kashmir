import { useEffect, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AnswerMetrics, AssessmentResult } from './baAssessment'

/**
 * Ambassadors invited by Head Office. Each gets a private link that opens the BA app in
 * onboarding mode (training video → verbal assessment → results) until they are certified.
 *
 * There is no backend, so invites live in this browser's localStorage: the link works in the
 * browser where it was created.
 */

export type InviteStatus = 'Invited' | 'Training' | 'Certified'

export type Invite = {
  token: string
  /** Ambassador id used in the Head Office list */
  id: string
  name: string
  city: string
  email: string
  phone: string
  createdAt: string
  status: InviteStatus
  videoWatched: boolean
  /** Answers submitted so far (one per assessment question) */
  answers: AnswerMetrics[]
  result: AssessmentResult | null
}

const STORAGE_KEY = 'ba-invites-v1'
const ACTIVE_KEY = 'ba-active-invite'

function load(): Invite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as Invite[]) : []
  } catch {
    return []
  }
}

let invites = load()
const listeners = new Set<() => void>()

function commit(next: Invite[]) {
  invites = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(invites))
  } catch {
    // keep in memory for this session
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // pick up changes made in another tab (e.g. the BA finishing the assessment)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      invites = load()
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useInvites() {
  return useSyncExternalStore(subscribe, () => invites)
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function createInvite(fields: { name: string; city: string; email: string; phone: string }): Invite {
  const token = randomToken()
  const invite: Invite = {
    token,
    id: `inv-${token.slice(0, 8)}`,
    name: fields.name.trim(),
    city: fields.city.trim(),
    email: fields.email.trim(),
    phone: fields.phone.trim(),
    createdAt: new Date().toISOString(),
    status: 'Invited',
    videoWatched: false,
    answers: [],
    result: null,
  }
  commit([invite, ...invites])
  return invite
}

export function updateInvite(token: string, patch: Partial<Invite>) {
  commit(invites.map((i) => (i.token === token ? { ...i, ...patch } : i)))
}

export function inviteLink(token: string) {
  return `${window.location.origin}/ba/training?token=${token}`
}

export function clearActiveInvite() {
  try {
    sessionStorage.removeItem(ACTIVE_KEY)
  } catch {
    // ignore
  }
}

/**
 * The invite for this BA session: the `?token=` in the URL, remembered for the tab so the
 * BA can move between pages without it. `invalidToken` is true when a token was given that
 * this browser does not know.
 */
export function useActiveInvite() {
  const [params] = useSearchParams()
  const list = useInvites()
  const urlToken = params.get('token')

  useEffect(() => {
    if (!urlToken) return
    try {
      sessionStorage.setItem(ACTIVE_KEY, urlToken)
    } catch {
      // ignore
    }
  }, [urlToken])

  let stored: string | null = null
  try {
    stored = sessionStorage.getItem(ACTIVE_KEY)
  } catch {
    // ignore
  }
  const token = urlToken ?? stored
  const invite = list.find((i) => i.token === token) ?? null
  return { invite, invalidToken: !!urlToken && !invite }
}
