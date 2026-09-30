/**
 * In-memory access-token store. The token deliberately never touches
 * localStorage/sessionStorage — session restore goes through the
 * HttpOnly refresh cookie instead.
 */

let accessToken: string | null = null
let sessionGeneration = 0

/** Changes on credential transitions, but not on access-token refresh. */
export function getSessionGeneration(): number {
  return sessionGeneration
}

/** Invalidate previous responses while preserving the Bearer used by linking. */
export function advanceSessionGeneration(): number {
  sessionGeneration += 1
  return sessionGeneration
}

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  advanceSessionGeneration()
  accessToken = token
}

export function clearAccessToken(): void {
  setAccessToken(null)
}

/** A late refresh must not replace a newer login or restore a logged-out token. */
export function setRefreshedAccessToken(token: string, generation: number): boolean {
  if (generation !== sessionGeneration) return false
  accessToken = token
  return true
}

type SessionExpiredListener = () => void

/**
 * More than one part of the shell reacts to an expired session (AuthProvider
 * routes back to /login), so the
 * notifier keeps a set of listeners rather than a single slot.
 */
const sessionExpiredListeners = new Set<SessionExpiredListener>()

/** Registered by AuthProvider; fired when a refresh fails after a 401. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener)
  return () => {
    sessionExpiredListeners.delete(listener)
  }
}

export function notifySessionExpired(): void {
  for (const listener of [...sessionExpiredListeners]) listener()
}
