import type { AdminUserSort, UserRole, UserStatus } from '../api/queries'
import { USER_ROLE_LABELS, USER_STATUS_LABELS } from './labels'
import { listPage } from './list-url'
import { adminPaths } from './paths'
import { safeInternalPath } from './redirect'
import { isUuid } from './validation'
import { workspaceListParams, workspaceListState } from './workspace-list'

const SORTS: AdminUserSort[] = ['name', '-name', 'email', '-email', 'createdAt', '-createdAt']

export function userListState(params: URLSearchParams) {
  const rawStatus = params.get('status')
  const rawRole = params.get('role')
  const rawOrg = params.get('filterOrg')
  const rawSelected = params.get('selected')
  return {
    status: rawStatus && Object.hasOwn(USER_STATUS_LABELS, rawStatus) ? rawStatus as UserStatus : undefined,
    role: rawRole && Object.hasOwn(USER_ROLE_LABELS, rawRole) ? rawRole as UserRole : undefined,
    filterOrgId: rawOrg && isUuid(rawOrg) ? rawOrg.toLowerCase() : undefined,
    q: (params.get('q') ?? '').slice(0, 200),
    sort: SORTS.find((sort) => sort === params.get('sort')),
    page: listPage(params.get('page')),
    selectedId: rawSelected && isUuid(rawSelected) ? rawSelected.toLowerCase() : rawSelected,
  }
}

export function userListParams(state: ReturnType<typeof userListState>, orgId?: string): URLSearchParams {
  const params = new URLSearchParams()
  if (orgId) params.set('org', orgId)
  if (state.status) params.set('status', state.status)
  if (state.role) params.set('role', state.role)
  if (state.filterOrgId) params.set('filterOrg', state.filterOrgId)
  if (state.q) params.set('q', state.q)
  if (state.sort) params.set('sort', state.sort)
  if (state.page > 0) params.set('page', String(state.page))
  if (state.selectedId != null) params.set('selected', state.selectedId)
  return params
}

/** A support detail returns only to the directory or the workspace that opened it. */
export function userSupportReturn(value: string | null, orgId?: string, systemTier = false): string {
  const fallback = adminPaths.users(orgId)
  if (!safeInternalPath(value)) return fallback
  const url = new URL(value!, 'https://pickle.invalid')
  if (url.hash || !['/admin/users', '/admin/workspaces'].includes(url.pathname)) return fallback
  const rawOrg = url.searchParams.get('org') || undefined
  if (rawOrg && !isUuid(rawOrg)) return fallback
  const targetOrg = rawOrg?.toLowerCase()
  if (targetOrg && targetOrg !== orgId) return fallback
  const params = url.pathname === '/admin/users'
    ? userListParams(userListState(url.searchParams), targetOrg ?? (systemTier ? undefined : orgId))
    : workspaceListParams(workspaceListState(url.searchParams), targetOrg ?? (systemTier ? undefined : orgId))
  return `${url.pathname}${params.size ? `?${params}` : ''}`
}
