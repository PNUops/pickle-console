/**
 * In-memory sudo-mode (재인증) token store. Like the access token in token.ts
 * the value never touches localStorage/sessionStorage — it is a short-lived
 * (10분) multi-use grant for sensitive operations, and a tab reload must force
 * the password prompt again.
 *
 * The module also carries the notifier the API client uses to ask the UI for a
 * password when the server answers 403 REAUTH_REQUIRED (same module-level
 * listener precedent as onSessionExpired in token.ts / maintenance.ts).
 */

/** 만료 직전 토큰을 보내 헛되이 403을 받지 않도록 두는 여유. */
const EXPIRY_SKEW_MS = 5_000

/** expiresAt을 해석하지 못했을 때 쓰는 계약상 기본 수명(10분). */
const DEFAULT_TTL_MS = 10 * 60 * 1000

let reauthToken: string | null = null
let expiresAtMs = 0

/** The held token, or null when absent or (near-)expired. */
export function getReauthToken(): string | null {
  if (!reauthToken) return null
  if (Date.now() >= expiresAtMs - EXPIRY_SKEW_MS) {
    clearReauthToken()
    return null
  }
  return reauthToken
}

/** Stores a token issued by POST /auth/reverify. `expiresAt` is the contract's ISO instant. */
export function setReauthToken(token: string, expiresAt: string): void {
  const parsed = Date.parse(expiresAt)
  reauthToken = token
  expiresAtMs = Number.isNaN(parsed) ? Date.now() + DEFAULT_TTL_MS : parsed
}

export function clearReauthToken(): void {
  reauthToken = null
  expiresAtMs = 0
}

type ReauthRequiredListener = () => Promise<boolean>

let listener: ReauthRequiredListener | null = null

/**
 * Registered by ReauthProvider. The listener opens the password modal and
 * resolves true once a token was obtained, false if the user cancelled.
 */
export function onReauthRequired(handler: ReauthRequiredListener): () => void {
  listener = handler
  return () => {
    if (listener === handler) listener = null
  }
}

let promptInFlight: Promise<boolean> | null = null

/**
 * Asks the UI to re-authenticate. Concurrent callers (several requests hitting
 * REAUTH_REQUIRED at once) share a single modal — single-flight, like
 * refreshSession. Resolves false when no UI is mounted, so a caller can never
 * hang waiting for a prompt that will not appear.
 */
export function requestReauth(): Promise<boolean> {
  if (!listener) return Promise.resolve(false)
  promptInFlight ??= (async () => {
    try {
      return await listener!()
    } catch {
      return false
    } finally {
      promptInFlight = null
    }
  })()
  return promptInFlight
}
