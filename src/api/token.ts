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

let sessionExpiredListener: SessionExpiredListener | null = null

/** Registered by AuthProvider; fired when a refresh attempt fails after a 401. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListener = listener
  return () => {
    if (sessionExpiredListener === listener) sessionExpiredListener = null
  }
}

export function notifySessionExpired(): void {
  sessionExpiredListener?.()
}
