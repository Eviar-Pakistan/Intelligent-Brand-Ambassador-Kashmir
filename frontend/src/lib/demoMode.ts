/**
 * Head Office demo session — same /ho shell, local fixtures only (no network).
 */

export const DEMO_HO_EMAIL = 'demo@kashmir.local'
export const DEMO_HO_PASSWORD = 'demo123'
export const DEMO_ACCESS_TOKEN = 'demo-ho-access-token'
export const DEMO_REFRESH_TOKEN = 'demo-ho-refresh-token'

const DEMO_FLAG_KEY = 'kashmir-ho-demo-mode'

export function isDemoMode(): boolean {
  try {
    return localStorage.getItem(DEMO_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

export function isDemoHoCredentials(email: string, password: string): boolean {
  return (
    email.trim().toLowerCase() === DEMO_HO_EMAIL &&
    password === DEMO_HO_PASSWORD
  )
}

export function enterDemoMode() {
  try {
    localStorage.setItem(DEMO_FLAG_KEY, '1')
  } catch {
    // ignore
  }
}

export function exitDemoMode() {
  try {
    localStorage.removeItem(DEMO_FLAG_KEY)
  } catch {
    // ignore
  }
}
