import createClient from 'openapi-fetch'
import type { components, paths } from './schema'
import {
  clearAccessToken,
  getAccessToken,
  notifySessionExpired,
  setAccessToken,
} from './token'

// jsdom/undici cannot fetch relative URLs, so anchor the base to the page origin.
const origin =
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost'

export const API_BASE = `${origin}/api/v1`

function isAuthEndpoint(url: string): boolean {
  return new URL(url).pathname.startsWith('/api/v1/auth/')
}

let refreshInFlight: Promise<boolean> | null = null

/**
 * POST /auth/refresh with the HttpOnly cookie. Stores the new access token on
 * success. Concurrent callers share a single request (single-flight).
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) return false
      const body = (await response.json()) as components['schemas']['AuthTokenResponse']
      setAccessToken(body.accessToken)
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

function withAuthHeader(request: Request): Request {
  const token = getAccessToken()
  if (!token) return request
  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return new Request(request, { headers })
}

/**
 * Auth-aware fetch: attaches the bearer token, and on a 401 (outside /auth/*)
 * refreshes the session once and retries the original request. If the refresh
 * fails the auth state is cleared and AuthProvider is notified, which routes
 * the user back to /login.
 */
async function fetchWithAuth(input: Request): Promise<Response> {
  const retryCopy = input.clone()
  const response = await fetch(withAuthHeader(input))

  if (response.status !== 401 || isAuthEndpoint(input.url)) {
    return response
  }

  const refreshed = await refreshSession()
  if (!refreshed) {
    clearAccessToken()
    notifySessionExpired()
    return response
  }
  const retryResponse = await fetch(withAuthHeader(retryCopy))
  if (retryResponse.status === 401) {
    // The server rejects even a freshly refreshed token — treat as expired.
    clearAccessToken()
    notifySessionExpired()
  }
  return retryResponse
}

export const api = createClient<paths>({ baseUrl: API_BASE, fetch: fetchWithAuth })
