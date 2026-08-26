/**
 * Bridge for a 403 MFA_ENROLLMENT_REQUIRED seen mid-request: the API client
 * fires it, and the authenticated shell sends the account to the enrollment
 * screen. Shaped like the maintenance notifier in maintenance.ts, with two
 * deliberate differences.
 *
 * <p>Why the client layer rather than each screen: when admin 2FA enforcement
 * is on, an unenrolled system-tier account gets this 403 from **every** admin
 * endpoint except the handful the server exempts (`/me`, `/me/mfa/**`,
 * `/auth/**`, `/meta/**`). There is no single screen that fails — every one of
 * them does, all at once, and a screen that renders nothing but an error box
 * never tells the account what to do about it. Catching it once here is what
 * keeps the answer in one place instead of on twenty pages.
 *
 * <p><b>The state latches</b> rather than existing only as a live event. The
 * first request the shell makes can answer before the shell has finished
 * mounting and subscribed, and a pure event is simply lost in that window — the
 * account then sits on a page of errors with no redirect, which is the exact
 * outcome this exists to prevent. It is a race, so it does not fail every time,
 * which is worse than failing always. The shell reads {@link
 * isMfaEnrollmentRequired} on mount and subscribes for anything later.
 *
 * <p><b>Listeners are a set</b>, not one slot. The maintenance notifier keeps a
 * single listener and a second subscriber silently replaces the first, which is
 * fine while exactly one component subscribes and a defect the moment two do.
 */

type MfaEnrollmentListener = () => void

const listeners = new Set<MfaEnrollmentListener>()
let required = false

/** Registered by the shell; fired when a request returns 403 MFA_ENROLLMENT_REQUIRED. */
export function onMfaEnrollmentRequired(handler: MfaEnrollmentListener): () => void {
  listeners.add(handler)
  return () => {
    listeners.delete(handler)
  }
}

/** True once any request has answered 403 MFA_ENROLLMENT_REQUIRED this session. */
export function isMfaEnrollmentRequired(): boolean {
  return required
}

export function notifyMfaEnrollmentRequired(): void {
  required = true
  for (const handler of listeners) handler()
}

/**
 * Clears the latch. Belongs to logout and to tests: the flag describes one
 * account's enrollment state, and the next account to sign in on this tab has
 * its own.
 */
export function resetMfaEnrollmentRequired(): void {
  required = false
}
