/** Head Office / office-user JWT auth against Django + Djoser. */

import {
  apiRequest,
  clearStoredTokens,
  getStoredAccessToken,
  isApiAuthenticated,
  setStoredTokens,
} from './api'

export type AuthUser = {
  id: number
  email: string
  username?: string
  first_name?: string
  last_name?: string
  user_type?: number
}

export async function loginWithEmail(email: string, password: string) {
  const tokens = await apiRequest<{ access: string; refresh: string }>('/auth/jwt/create/', {
    method: 'POST',
    body: { email: email.trim(), password },
    auth: false,
  })
  setStoredTokens(tokens.access, tokens.refresh)
  const user = await fetchCurrentUser()
  return { tokens, user }
}

export async function fetchCurrentUser() {
  return apiRequest<AuthUser>('/auth/users/me/')
}

export function logoutApi() {
  clearStoredTokens()
}

export function hasOfficeSession() {
  return isApiAuthenticated()
}

export function peekAccessToken() {
  return getStoredAccessToken()
}
