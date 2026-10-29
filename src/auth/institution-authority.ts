import type { UserRole } from './auth-context'

export type WorkGroup = 'VM' | 'LLM' | 'DOMAIN' | 'GPU' | 'WORKSPACE'
export type WorkBoundary = 'GLOBAL' | 'INSTITUTION' | 'RESOURCE' | 'RESOURCE_SUPPORT' | 'WORKSPACE_SUPPORT' | 'QUALIFIED_WORKSPACE'
export interface WorkspaceScope { mode: 'ALL' | 'LISTED'; workspaceIds: string[] }
export interface InstitutionPermission {
  mode: 'FULL' | 'SELECTED'
  work: string[]
  scopes: Partial<Record<WorkGroup, WorkspaceScope>>
  revision: number
}
export interface InstitutionGrant { institutionId: string; institutionName: string; permission: InstitutionPermission }
export interface InstitutionWorkView {
  id: string; name: string; group: WorkGroup | null; boundary: WorkBoundary
  write: boolean; selectable: boolean; includedInFull: boolean
  globalResourceReadInFull: boolean
}
export interface InstitutionAuthority {
  state: 'VALID_EMPTY' | 'VALID_SOURCES' | 'INVALID'
  failure: string | null
  accountRole: UserRole
  catalogueRevision: string
  authorityFingerprint: string | null
  assignments: InstitutionGrant[]
  catalogue: InstitutionWorkView[]
}
export interface AuthorityActor { role: UserRole; institutionAuthority?: InstitutionAuthority | null }
export interface WorkTarget {
  orgId?: string | null
  workspaceId?: string | null
  /** Qualified workspace commands use a server-resolved row's allowedWorkIds. */
  qualifiedInstitutionIds?: readonly string[]
}
export const SYS_READERS: readonly UserRole[] = ['SYS_VIEWER', 'SYS_MANAGER', 'SYS_ADMIN']
export const SYS_OPERATORS: readonly UserRole[] = ['SYS_MANAGER', 'SYS_ADMIN']
export const SYS_ADMIN: readonly UserRole[] = ['SYS_ADMIN']

export function authorityKey(actor: AuthorityActor | null | undefined): string {
  const context = actor?.institutionAuthority
  return `${actor?.role ?? 'USER'}:${context?.state ?? 'UNAVAILABLE'}:${context?.catalogueRevision ?? ''}:${context?.authorityFingerprint ?? ''}`
}

export function validAuthority(actor: AuthorityActor | null | undefined): InstitutionAuthority | null {
  const context = actor?.institutionAuthority
  return context?.state === 'VALID_SOURCES' && context.accountRole === actor?.role ? context : null
}

function descriptor(actor: AuthorityActor, id: string): InstitutionWorkView | undefined {
  return validAuthority(actor)?.catalogue.find((work) => work.id === id)
}

function holds(grant: InstitutionGrant, work: InstitutionWorkView): boolean {
  return grant.permission.mode === 'FULL' ? work.includedInFull : work.selectable && grant.permission.work.includes(work.id)
}

function inScope(grant: InstitutionGrant, work: InstitutionWorkView, workspaceId?: string | null): boolean {
  if (!work.group || !workspaceId) return false
  if (grant.permission.mode === 'FULL') return true
  const scope = grant.permission.scopes[work.group]
  return scope?.mode === 'ALL' || scope?.mode === 'LISTED' && scope.workspaceIds.includes(workspaceId)
}

/** Existence is for navigation and query admission; it never authorizes a named target. */
export function workSources(actor: AuthorityActor | null | undefined, id: string): InstitutionGrant[] {
  if (!actor) return []
  const work = descriptor(actor, id)
  if (!work) return []
  return validAuthority(actor)!.assignments.filter((grant) => {
    if (!holds(grant, work)) return false
    if (!work.group || grant.permission.mode === 'FULL') return true
    const scope = grant.permission.scopes[work.group]
    return scope?.mode === 'ALL' || scope?.mode === 'LISTED' && scope.workspaceIds.length > 0
  })
}

export function hasAnyWork(actor: AuthorityActor | null | undefined, ids: readonly string[], sysRoles: readonly UserRole[] = []): boolean {
  if (!actor) return false
  if (actor.role.startsWith('SYS_')) return sysRoles.includes(actor.role)
  return ids.some((id) => workSources(actor, id).length > 0)
}

/** Optional collection filters narrow each complete source; an absent filter adds no authority. */
export function canQueryWork(actor: AuthorityActor | null | undefined, ids: readonly string[], query: WorkTarget = {}, sysRoles: readonly UserRole[] = []): boolean {
  if (!actor) return false
  if (actor.role.startsWith('SYS_')) return sysRoles.includes(actor.role)
  return ids.some((id) => {
    const work = descriptor(actor, id)
    if (!work) return false
    return workSources(actor, id).some((source) => {
      if (work.group && query.workspaceId && !inScope(source, work, query.workspaceId)) return false
      if (query.orgId && (work.boundary === 'INSTITUTION' || work.boundary === 'RESOURCE')
        && !(source.permission.mode === 'FULL' && work.globalResourceReadInFull) && source.institutionId !== query.orgId) return false
      return true
    })
  })
}

/** Evaluate one complete source at a time; missing relations and unknown scopes deny. */
export function hasWork(actor: AuthorityActor | null | undefined, id: string, target: WorkTarget = {}, sysRoles: readonly UserRole[] = []): boolean {
  if (!actor) return false
  if (actor.role.startsWith('SYS_')) return sysRoles.includes(actor.role)
  const work = descriptor(actor, id)
  if (!work) return false
  return workSources(actor, id).some((grant) => {
    if (work.boundary === 'GLOBAL') return true
    if (work.boundary === 'INSTITUTION') return !!target.orgId && target.orgId === grant.institutionId
    if (!inScope(grant, work, target.workspaceId)) return false
    if (work.boundary === 'WORKSPACE_SUPPORT' || work.boundary === 'RESOURCE_SUPPORT') return true
    if (work.boundary === 'QUALIFIED_WORKSPACE') return target.qualifiedInstitutionIds?.includes(grant.institutionId) === true
    return target.orgId !== undefined && (grant.institutionId === target.orgId
      || grant.permission.mode === 'FULL' && work.globalResourceReadInFull === true)
  })
}

/** Paid roster commands require both works from the identical assignment. */
export function hasSameSourceWorks(actor: AuthorityActor | null | undefined, ids: readonly string[], target: WorkTarget, sysRoles: readonly UserRole[] = []): boolean {
  if (!actor || ids.length === 0) return false
  if (actor.role.startsWith('SYS_')) return sysRoles.includes(actor.role)
  const context = validAuthority(actor)
  return context?.assignments.some((grant) => {
    const one: AuthorityActor = { ...actor, institutionAuthority: { ...context, assignments: [grant] } }
    return ids.every((id) => hasWork(one, id, target))
  }) === true
}

export interface WorkQualifiedRow { orgId?: string | null; workspaceId?: string | null; allowedWorkIds?: readonly string[] | null }
/** A server projection is the final decision for a row, including qualified references. */
export function rowAllows(row: WorkQualifiedRow | null | undefined, work: string): boolean {
  return row?.allowedWorkIds?.includes(work) === true
}

export function canUseRowWork(actor: AuthorityActor | null | undefined, row: WorkQualifiedRow | null | undefined,
  work: string, sysRoles: readonly UserRole[] = []): boolean {
  if (!rowAllows(row, work) || !actor) return false
  const item = descriptor(actor, work)
  if (!actor.role.startsWith('SYS_') && item?.boundary === 'QUALIFIED_WORKSPACE') {
    return workSources(actor, work).some((source) => inScope(source, item, row?.workspaceId))
  }
  return hasWork(actor, work, { orgId: row?.orgId, workspaceId: row?.workspaceId }, sysRoles)
}

export function projectionAvailable(row: unknown, flag: 'metadataVisible' | 'observationVisible' | 'financeVisible' | 'tokenReferenceVisible' | 'budgetReferenceVisible'): boolean {
  return row != null && typeof row === 'object' && (row as Record<string, unknown>)[flag] === true
}

export function canEnterAdministration(actor: AuthorityActor | null | undefined): boolean {
  if (!actor) return false
  const context = validAuthority(actor)
  return actor.role.startsWith('SYS_') || context != null && context.assignments.length > 0
}
