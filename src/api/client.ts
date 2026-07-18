import createClient from 'openapi-fetch'
import { notifyMaintenanceDetected } from './maintenance'
import { isProblem } from './problem'
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
 * CSRF 이중 제출 토큰: 로그인/갱신 시 발급되는 `pickle_csrf` 쿠키
 * (비-HttpOnly, SameSite=Lax, Path=/) 값. `/auth/refresh`·`/auth/logout`
 * 호출 시 `X-Pickle-Csrf` 헤더로 되돌려 보낸다 (계약 v0.3.0).
 */
export function getCsrfToken(): string {
  if (typeof document === 'undefined') return ''
  const match = /(?:^|;\s*)pickle_csrf=([^;]*)/.exec(document.cookie)
  return match ? decodeURIComponent(match[1]) : ''
}

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
        headers: { 'X-Pickle-Csrf': getCsrfToken() },
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
    signalMaintenance(response)
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
  signalMaintenance(retryResponse)
  return retryResponse
}

/**
 * A 503 MAINTENANCE_MODE (the maintenance gate) notifies the shell so a
 * non-admin is routed to the maintenance screen at once. Read off a clone so
 * the caller's body stays intact; fire-and-forget so it never blocks the call.
 */
function signalMaintenance(response: Response): void {
  if (response.status !== 503) return
  void response
    .clone()
    .json()
    .then((body: unknown) => {
      if (isProblem(body) && body.code === 'MAINTENANCE_MODE') notifyMaintenanceDetected()
    })
    .catch(() => {})
}

export const api = createClient<paths>({ baseUrl: API_BASE, fetch: fetchWithAuth })
