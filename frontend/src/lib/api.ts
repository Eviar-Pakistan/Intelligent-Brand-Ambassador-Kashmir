/** Thin fetch helper for the Kashmir Django API. */

const API_BASE = (() => {
  const raw = import.meta.env.VITE_API_URL as string | undefined
  // Empty string = same-origin (Vite proxy). Unset = local Django default.
  if (raw === undefined) return 'http://127.0.0.1:8000'
  return String(raw).replace(/\/$/, '')
})()

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export function apiBase() {
  return API_BASE
}

type RequestOptions = {
  method?: string
  body?: unknown
  token?: string | null
  formData?: FormData
  auth?: boolean
  /** Internal: skip refresh retry to avoid loops */
  _retried?: boolean
}

const ACCESS_KEY = 'kashmir-jwt-access'
const REFRESH_KEY = 'kashmir-jwt-refresh'

export function getStoredAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY)
  } catch {
    return null
  }
}

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

export function setStoredTokens(access: string, refresh?: string) {
  try {
    localStorage.setItem(ACCESS_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  } catch {
    // ignore
  }
}

export function clearStoredTokens() {
  try {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  } catch {
    // ignore
  }
}

export function isApiAuthenticated() {
  return !!getStoredAccessToken()
}

function detailFromBody(data: unknown, status: number): string {
  let detail = `Request failed (${status})`
  if (typeof data === 'object' && data) {
    if ('detail' in data) {
      detail = String((data as { detail: unknown }).detail)
    } else {
      const parts: string[] = []
      for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
        if (Array.isArray(val)) parts.push(`${key}: ${val.map(String).join(', ')}`)
        else if (typeof val === 'string') parts.push(`${key}: ${val}`)
      }
      if (parts.length) detail = parts.join('; ')
    }
  }
  const lower = detail.toLowerCase()
  if (
    lower.includes('token not valid') ||
    lower.includes('token is invalid') ||
    lower.includes('token has expired') ||
    lower.includes('authentication credentials were not provided')
  ) {
    return 'Session expired. Please log out and sign in again, then retry.'
  }
  return detail
}

function isAuthFailure(status: number, data: unknown): boolean {
  if (status !== 401 && status !== 403) return false
  const detail =
    typeof data === 'object' && data && 'detail' in data
      ? String((data as { detail: unknown }).detail).toLowerCase()
      : ''
  return (
    status === 401 ||
    detail.includes('token not valid') ||
    detail.includes('token is invalid') ||
    detail.includes('credentials')
  )
}

let refreshInFlight: Promise<string | null> | null = null

/** Exchange refresh token for a new access token. Returns null if refresh fails. */
export async function refreshAccessToken(): Promise<string | null> {
  const refresh = getStoredRefreshToken()
  if (!refresh) {
    clearStoredTokens()
    return null
  }
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/jwt/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      })
      const text = await res.text()
      let data: unknown = null
      if (text) {
        try {
          data = JSON.parse(text)
        } catch {
          data = text
        }
      }
      if (!res.ok) {
        clearStoredTokens()
        return null
      }
      const access =
        typeof data === 'object' && data && 'access' in data
          ? String((data as { access: unknown }).access)
          : ''
      if (!access) {
        clearStoredTokens()
        return null
      }
      const nextRefresh =
        typeof data === 'object' && data && 'refresh' in data
          ? String((data as { refresh: unknown }).refresh)
          : undefined
      setStoredTokens(access, nextRefresh)
      return access
    } catch {
      clearStoredTokens()
      return null
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

export async function apiRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = options.token !== undefined ? options.token : options.auth === false ? null : getStoredAccessToken()

  if (token) headers.Authorization = `Bearer ${token}`

  let body: BodyInit | undefined
  if (options.formData) {
    body = options.formData
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || (options.body || options.formData ? 'POST' : 'GET'),
    headers,
    body,
  })

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    // Access token expired — refresh once and retry (skip for login/refresh itself).
    if (
      options.auth !== false &&
      !options._retried &&
      options.token === undefined &&
      isAuthFailure(res.status, data)
    ) {
      const next = await refreshAccessToken()
      if (next) {
        return apiRequest<T>(path, { ...options, _retried: true })
      }
    }
    throw new ApiError(detailFromBody(data, res.status), res.status, data)
  }

  return data as T
}
