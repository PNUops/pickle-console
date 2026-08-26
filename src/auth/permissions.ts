import type { ManagedOrg, UserRole } from './auth-context'

/**
 * Role-tier + action capability predicates, mirroring the operator-confirmed
 * permission matrix enforced by the api's PermissionMatrixTest. The server is the
 * sole enforcement point; these gate the console UI so an operator is never shown
 * an action the API would reject. Kept as an explicit allow-list per role — no
 * inheritance.
 *
 * An account may hold an org-tier role in several organisations (contract
 * v0.46.0, `managedOrgs`); `role` on the profile is the highest role across
 * them. Tier predicates answer what the account may ever do; the per-org
 * helpers below answer what it may do in one particular organisation.
 */

/**
 * ORG_ADMIN or ORG_MANAGER. Reads reach every organisation (the audit log is
 * the one exception — it stays inside the managed organisations); writes stay
 * inside the organisations the account administers or manages.
 */
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

// ── per-organisation scope ──────────────────────────────────────────────────

/**
 * The organisations this account administers (role ORG_ADMIN there). Staffing,
 * announcement sending and every other ORG_ADMIN-only write is confined to
 * these — administering one organisation raises the effective role everywhere,
 * so pages must ask this instead of `role` when the question is one org.
 */
export function administeredOrgs(managedOrgs: readonly ManagedOrg[]): ManagedOrg[] {
  return managedOrgs.filter((org) => org.role === 'ORG_ADMIN')
}

/** Does this account administer organisation `orgId` (role ORG_ADMIN there)? */
export function administersOrg(managedOrgs: readonly ManagedOrg[], orgId: string): boolean {
  return managedOrgs.some((org) => org.orgId === orgId && org.role === 'ORG_ADMIN')
}

/** Does this account hold any org-tier role in organisation `orgId`? */
export function managesOrg(managedOrgs: readonly ManagedOrg[], orgId: string): boolean {
  return managedOrgs.some((org) => org.orgId === orgId)
}

// ── action capabilities ────────────────────────────────────────────────────

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
