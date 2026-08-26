import createClient from 'openapi-fetch'
import { notifyMaintenanceDetected } from './maintenance'
import { notifyMfaEnrollmentRequired } from './mfa-enrollment'
import { isProblem } from './problem'
import { clearReauthToken, getReauthToken, requestReauth } from './reauth'
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
 * CSRF 이중 제출 토큰: 로그인/갱신 시 발급되는 `__Host-pickle_csrf` 쿠키
 * (비-HttpOnly, SameSite=Strict, Path=/) 값. `/auth/refresh`·`/auth/logout`
 * 호출 시 `X-Pickle-Csrf` 헤더로 되돌려 보낸다.
 *
 * 쿠키 이름 전체를 앵커로 잡는다. 접두사 없는 `pickle_csrf`가 남아 있어도
 * `(?:^|;\s*)`가 이름의 시작을 강제하므로 그 쪽에 걸리지 않는다.
 */
export function getCsrfToken(): string {
  if (typeof document === 'undefined') return ''
  const match = /(?:^|;\s*)__Host-pickle_csrf=([^;]*)/.exec(document.cookie)
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

/**
 * Attaches the bearer token and, while a sudo-mode grant is held, the
 * `X-Reauth-Token` header the 11 sensitive operations demand (계약 v0.24.0).
 * Sending it on the other endpoints is harmless and keeps the grant multi-use
 * for its full 10 minutes. /auth/* is excluded: those endpoints authenticate on
 * their own (reverify/login/refresh) and never consume a grant.
 */
function withAuthHeader(request: Request): Request {
  const token = getAccessToken()
  const reauthToken = isAuthEndpoint(request.url) ? null : getReauthToken()
  if (!token && !reauthToken) return request
  const headers = new Headers(request.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (reauthToken) headers.set('X-Reauth-Token', reauthToken)
  return new Request(request, { headers })
}

function expireSession(): void {
  clearAccessToken()
  clearReauthToken()
  notifySessionExpired()
}

/**
 * Sends the request and, on a 401 (outside /auth/*), refreshes the session once
 * and retries. If the refresh fails the auth state is cleared and AuthProvider
 * is notified, which routes the user back to /login. The caller must not have
 * consumed `input`'s body — this clones it up front for the retry.
 */
async function sendWithRefresh(input: Request): Promise<Response> {
  const retryCopy = input.clone()
  const response = await fetch(withAuthHeader(input))

  if (response.status !== 401 || isAuthEndpoint(input.url)) return response

  const refreshed = await refreshSession()
  if (!refreshed) {
    expireSession()
    return response
  }
  const retryResponse = await fetch(withAuthHeader(retryCopy))
  if (retryResponse.status === 401) {
    // The server rejects even a freshly refreshed token — treat as expired.
    expireSession()
  }
  return retryResponse
}

/**
 * A 403 REAUTH_REQUIRED means the operation is sensitive and the sudo-mode
 * grant is missing or expired. Read off a clone so the caller's body stays
 * intact. /auth/* is excluded so the reverify call itself (and its own 403
 * AUTH_PASSWORD_MISMATCH) can never re-enter this flow.
 */
async function isReauthRequired(response: Response, url: string): Promise<boolean> {
  if (response.status !== 403 || isAuthEndpoint(url)) return false
  try {
    const body: unknown = await response.clone().json()
    return isProblem(body) && body.code === 'REAUTH_REQUIRED'
  } catch {
    return false
  }
}

/**
 * Auth-aware fetch: the 401-refresh retry (sendWithRefresh) wrapped in at most
 * one sudo-mode retry. On 403 REAUTH_REQUIRED the UI is asked for the password;
 * once a token is issued the original request is replayed exactly once — the
 * replay may itself refresh on a 401, but it can never trigger a second reauth
 * prompt, so the two paths compose sequentially instead of nesting forever.
 */
async function fetchWithAuth(input: Request): Promise<Response> {
  const reauthCopy = input.clone()
  const response = await sendWithRefresh(input)

  if (await isReauthRequired(response, input.url)) {
    // 서버가 거부한 이상 손에 든 토큰(있다면)은 이미 무효다.
    clearReauthToken()
    if (await requestReauth()) {
      const retryResponse = await sendWithRefresh(reauthCopy)
      signalMaintenance(retryResponse)
      signalMfaEnrollment(retryResponse)
      return retryResponse
    }
  }

  signalMaintenance(response)
  signalMfaEnrollment(response)
  return response
}

/**
 * A 403 MFA_ENROLLMENT_REQUIRED (admin 2FA enforcement, sys tier only) notifies
 * the shell so the account is taken to the enrollment screen instead of being
 * left on a page of errors. Read off a clone so the caller's body stays intact;
 * fire-and-forget so it never blocks the call.
 *
 * <p>This fires repeatedly while the account stays unenrolled — every polling
 * query keeps hitting it — so the subscriber, not this function, is where the
 * repeat is absorbed.
 */
function signalMfaEnrollment(response: Response): void {
  if (response.status !== 403) return
  void response
    .clone()
    .json()
    .then((body: unknown) => {
      if (isProblem(body) && body.code === 'MFA_ENROLLMENT_REQUIRED') {
        notifyMfaEnrollmentRequired()
      }
    })
    .catch(() => {})
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
