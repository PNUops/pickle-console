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
 * helpers below answer what it may do in one particular organisation. Holding a
 * role in an organisation is not permission to act in it: a viewer role reads
 * and nothing else, so every action asks an "act" predicate, never a "hold" one.
 */

/**
 * ORG_VIEWER, ORG_MANAGER or ORG_ADMIN. Reads stay inside the organisations the
 * account holds any role in (naming another answers 404); writes stay inside
 * the organisations it operates or administers.
 */
export function isOrgTier(role: UserRole): boolean {
  return role === 'ORG_ADMIN' || role === 'ORG_MANAGER' || role === 'ORG_VIEWER'
}

/** SYS_VIEWER, SYS_MANAGER or SYS_ADMIN — reads every org (no org scoping). */
export function isSysTier(role: UserRole): boolean {
  return role === 'SYS_ADMIN' || role === 'SYS_MANAGER' || role === 'SYS_VIEWER'
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

/**
 * The organisations this account may act in (ORG_ADMIN or ORG_MANAGER there).
 * Narrower than the set it may read once a viewer role is held: an ORG_VIEWER
 * row grants sight of that organisation, never a hand in it. The audit log also
 * answers for exactly this set.
 */
export function operatedOrgs(managedOrgs: readonly ManagedOrg[]): ManagedOrg[] {
  return managedOrgs.filter((org) => org.role === 'ORG_ADMIN' || org.role === 'ORG_MANAGER')
}

/** Does this account operate organisation `orgId` (ORG_ADMIN or ORG_MANAGER there)? */
export function operatesOrg(managedOrgs: readonly ManagedOrg[], orgId: string): boolean {
  return managedOrgs.some(
    (org) => org.orgId === orgId && (org.role === 'ORG_ADMIN' || org.role === 'ORG_MANAGER'),
  )
}

/** Does this account hold any role in organisation `orgId` (so it may read there)? */
export function managesOrg(managedOrgs: readonly ManagedOrg[], orgId: string): boolean {
  return managedOrgs.some((org) => org.orgId === orgId)
}

// ── action capabilities ────────────────────────────────────────────────────

/** Approve / reject a VM request (§3.9). Operating org tier + SYS_ADMIN;
 *  viewers and SYS_MANAGER denied. */
export function canDecideRequest(role: UserRole): boolean {
  return role === 'ORG_ADMIN' || role === 'ORG_MANAGER' || role === 'SYS_ADMIN'
}

/** Schedule / cancel a VM deletion (§3.11). ORG_ADMIN + SYS_ADMIN only. */
export function canManageVmDeletion(role: UserRole): boolean {
  return role === 'ORG_ADMIN' || role === 'SYS_ADMIN'
}

/** Admin VM power control and period change (§3.11). Operating roles only —
 *  viewers read. The org tier acts only in the organisations it operates. */
export function canOperateVm(role: UserRole): boolean {
  return (
    role === 'ORG_ADMIN' ||
    role === 'ORG_MANAGER' ||
    role === 'SYS_ADMIN' ||
    role === 'SYS_MANAGER'
  )
}

/** LLM API 키 한도와 suspend/resume를 관리하는 운영 역할. */
export function canOperateLlmKey(role: UserRole): boolean {
  return (
    role === 'ORG_MANAGER' ||
    role === 'ORG_ADMIN' ||
    role === 'SYS_MANAGER' ||
    role === 'SYS_ADMIN'
  )
}

/** 금액 한도까지 포함한 6축 편집. SYS_MANAGER는 비금액 4축만 다룬다. */
export function canManageLlmCredit(role: UserRole): boolean {
  return role === 'ORG_MANAGER' || role === 'ORG_ADMIN' || role === 'SYS_ADMIN'
}

/** 관리자 경로에서 LLM API 키를 폐기하는 역할. */
export function canAdminRevokeLlmKey(role: UserRole): boolean {
  return role === 'ORG_ADMIN' || role === 'SYS_ADMIN'
}

/** Domain force-release / reverification and route re-apply (§3.16). Same
 *  operating roles as VM control; the org tier acts in its operated orgs only. */
export function canInterveneDomain(role: UserRole): boolean {
  return canOperateVm(role)
}

/** Broadcast an announcement (§3.13). ORG_ADMIN + SYS_ADMIN only. */
export function canBroadcast(role: UserRole): boolean {
  return role === 'ORG_ADMIN' || role === 'SYS_ADMIN'
}

/** Read the audit log (§3.14). It carries login addresses — evidence, not
 *  operational state — so it stays with the roles that may act in an
 *  organisation; ORG_VIEWER is the one admin role denied. SYS_VIEWER, being
 *  tied to no organisation, keeps it. */
export function canViewAudit(role: UserRole): boolean {
  return (
    role === 'ORG_MANAGER' ||
    role === 'ORG_ADMIN' ||
    role === 'SYS_VIEWER' ||
    role === 'SYS_MANAGER' ||
    role === 'SYS_ADMIN'
  )
}

/**
 * 공지사항 등록·수정·삭제. 발송(§3.13)과 같은 계층 — 기관 관리자·시스템 관리자만
 * 쓰고, 운영자 역할은 목록과 상세를 읽기만 한다.
 */
export function canManageNotice(role: UserRole): boolean {
  return role === 'ORG_ADMIN' || role === 'SYS_ADMIN'
}

/** Enumerated SYS routine recovery — task retry / notification resend / drift
 *  resolve / route resync (§3.12/§3.18/§3.20/§3.21). SYS_MANAGER + SYS_ADMIN;
 *  SYS_VIEWER reads the same screens but runs nothing. */
export function canRunSysRoutine(role: UserRole): boolean {
  return role === 'SYS_ADMIN' || role === 'SYS_MANAGER'
}

/** Dangerous SYS_ADMIN-only surface (§4): force-delete, settings write, account
 *  disable/enable, MFA reset, org and global-role mutation. */
export function isSysAdminOnly(role: UserRole): boolean {
  return role === 'SYS_ADMIN'
}
