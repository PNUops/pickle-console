/**
 * In-memory access-token store. The token deliberately never touches
 * localStorage/sessionStorage — session restore goes through the
 * HttpOnly refresh cookie instead.
 */

let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function clearAccessToken(): void {
  accessToken = null
}

type SessionExpiredListener = () => void

/**
 * More than one part of the shell reacts to an expired session (AuthProvider
 * routes back to /login, ReauthProvider closes its password modal), so the
 * notifier keeps a set of listeners rather than a single slot.
 */
const sessionExpiredListeners = new Set<SessionExpiredListener>()

/** Registered by AuthProvider/ReauthProvider; fired when a refresh fails after a 401. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener)
  return () => {
    sessionExpiredListeners.delete(listener)
  }
}

export function notifySessionExpired(): void {
  for (const listener of [...sessionExpiredListeners]) listener()
}
