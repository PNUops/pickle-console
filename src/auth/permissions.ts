import type { UserRole } from './auth-context'

/**
 * Role-tier + action capability predicates, mirroring the API's authority model
 * (docs/security/permission-matrix.md). The server is the sole enforcement point;
 * these gate the console UI so an operator is never shown an action the API would
 * reject. Kept as an explicit allow-list per role — no inheritance.
 */

/** ORG_ADMIN or ORG_MANAGER — pinned to their own org (derived membership). */
export function isOrgTier(role: UserRole): boolean {
  return role === 'ORG_ADMIN' || role === 'ORG_MANAGER'
}

/** SYS_ADMIN or SYS_MANAGER — sees every org (no org scoping). */
export function isSysTier(role: UserRole): boolean {
  return role === 'SYS_ADMIN' || role === 'SYS_MANAGER'
}

/** Any admin-area tier (everything above the plain USER). */
export function isAdminTier(role: UserRole): boolean {
  return role !== 'USER'
}

// ── action capabilities (permission-matrix.md §3–§4) ────────────────────────

/** Approve / reject a VM request (§3.9). Org tier + SYS_ADMIN; SYS_MANAGER denied. */
export function canDecideRequest(role: UserRole): boolean {
  return role === 'ORG_ADMIN' || role === 'ORG_MANAGER' || role === 'SYS_ADMIN'
}

/** Schedule / cancel a VM deletion (§3.11). ORG_ADMIN + SYS_ADMIN; managers denied. */
export function canManageVmDeletion(role: UserRole): boolean {
  return role === 'ORG_ADMIN' || role === 'SYS_ADMIN'
}

/** Broadcast an announcement (§3.13). ORG_ADMIN + SYS_ADMIN; managers denied. */
export function canBroadcast(role: UserRole): boolean {
  return role === 'ORG_ADMIN' || role === 'SYS_ADMIN'
}

/** Enumerated SYS routine recovery — task retry / notification resend / drift
 *  resolve / route resync (§3.12/§3.18/§3.20/§3.21). SYS tier. */
export function canRunSysRoutine(role: UserRole): boolean {
  return isSysTier(role)
}

/** Dangerous SYS_ADMIN-only surface (§4): force-delete, settings write, account
 *  disable/enable, MFA reset, org and global-role mutation. */
export function isSysAdminOnly(role: UserRole): boolean {
  return role === 'SYS_ADMIN'
}
