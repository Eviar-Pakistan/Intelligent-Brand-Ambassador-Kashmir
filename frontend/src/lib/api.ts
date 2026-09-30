/** Thin fetch helper for the Kashmir Django API. */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8000'

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
    let detail = `Request failed (${res.status})`
    if (typeof data === 'object' && data) {
      if ('detail' in data) {
        detail = String((data as { detail: unknown }).detail)
      } else {
        // DRF field errors: { field: ["msg"] } or { field: "msg" }
        const parts: string[] = []
        for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
          if (Array.isArray(val)) parts.push(`${key}: ${val.map(String).join(', ')}`)
          else if (typeof val === 'string') parts.push(`${key}: ${val}`)
        }
        if (parts.length) detail = parts.join('; ')
      }
    }
    throw new ApiError(detail, res.status, data)
  }

  return data as T
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
