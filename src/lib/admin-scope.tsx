import { useCallback, useLayoutEffect, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { requestReaderKey } from '../api/request-review'
import { fetchAdminOrgs, fetchSupportOrgs } from '../api/queries'
import { useAuth } from '../auth/auth-context'
import { canReadSupportMetadata, isOrgTier, isSysTier, usesGlobalSupportScope } from '../auth/permissions'
import { adminPath } from './paths'
import { parseGuidePath } from './docs-paths'
import { ADMIN_ORG_SCOPE_KEY } from './storage-keys'
import { isUuid } from './validation'
import { noticeListReturn } from './notice-paths'
import { userSupportReturn } from './user-list'
import { AdminScopeContext, type AdminOrgOption, type AdminScopeValue } from './admin-scope-context'

function storedOrgId(): string | undefined {
  try {
    return localStorage.getItem(ADMIN_ORG_SCOPE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function storeOrgId(orgId: string): void {
  try {
    localStorage.setItem(ADMIN_ORG_SCOPE_KEY, orgId)
  } catch {
    // URL이 정본이므로 저장소가 막혀도 현재 선택은 유지된다.
  }
}

export function AdminScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawOrgId = searchParams.get('org') ?? undefined
  const requestedOrgId = rawOrgId && isUuid(rawOrgId) ? rawOrgId.toLowerCase() : rawOrgId
  const orgTier = !!user && isOrgTier(user.role)
  const systemTier = !!user && isSysTier(user.role)
  const globalSupport = !!user && canReadSupportMetadata(user.role) && usesGlobalSupportScope(location.pathname)
  const globalRead = systemTier || globalSupport
  const orgs = useQuery({
    queryKey: globalSupport ? ['admin', 'support-orgs', requestReaderKey(user)] : ['admin', 'orgs'],
    queryFn: globalSupport ? fetchSupportOrgs : fetchAdminOrgs,
    enabled: globalRead,
  })

  const options = useMemo<AdminOrgOption[]>(() => {
    if (orgTier && !globalSupport) {
      return (user?.managedOrgs ?? []).map((org) => ({
        id: org.orgId,
        name: org.orgName,
        role: org.role,
      }))
    }
    return (orgs.data ?? []).map((org) => ({ id: org.id, name: org.name, status: org.status, role: user?.managedOrgs.find((held) => held.orgId === org.id)?.role }))
  }, [globalSupport, orgTier, orgs.data, user?.managedOrgs])

  const activeOrg = useMemo(() => {
    if (globalRead) return options.find((org) => org.id === requestedOrgId)
    if (requestedOrgId != null) return options.find((org) => org.id === requestedOrgId)
    const stored = storedOrgId()
    const restored = options.find((org) => org.id === stored)
    if (restored) return restored
    return options.length === 1 ? options[0] : undefined
  }, [options, requestedOrgId, globalRead])

  const invalidSystemScope =
    globalRead && requestedOrgId != null && orgs.isSuccess && activeOrg == null
  const resolving = globalRead && requestedOrgId != null && orgs.isPending
  const scopeError = globalRead && orgs.isError
  const requiresSelection = orgTier && !globalSupport && activeOrg == null
  const ready = globalRead
    ? requestedOrgId == null || (orgs.isSuccess && activeOrg != null)
    : orgTier && activeOrg != null

  const replaceScope = useCallback(
    (orgId: string | undefined, preserveGlobalSelection = false, preserveNoticeReturn = false) => {
      const next = new URLSearchParams(searchParams)
      if (orgId == null) next.delete('org')
      else next.set('org', orgId)
      // 이전 페이지의 기관 종속 필터를 새 scope에 가져가지 않는다.
      next.delete('orgId')
      next.delete('workspaceId')
      if (!(preserveGlobalSelection && location.pathname === '/admin/users')) next.delete('page')
      if (preserveNoticeReturn && next.has('returnTo')) next.set('returnTo', location.pathname.startsWith('/admin/users/')
        ? userSupportReturn(next.get('returnTo'), orgId)
        : noticeListReturn(next.get('returnTo'), orgId))
      else next.delete('returnTo')
      if (!preserveGlobalSelection) next.delete('selected')
      if (!preserveGlobalSelection) {
        next.delete('resourceType')
        next.delete('resourceId')
      }
      next.delete('targetOrgId')
      next.delete('targetType')
      next.delete('targetId')
      if (parseGuidePath(location.pathname)) {
        void navigate({ pathname: location.pathname, search: next.size ? `?${next}` : '', hash: location.hash }, { replace: true, state: location.state })
      } else {
        setSearchParams(next, { replace: true })
      }
    },
    [searchParams, setSearchParams, location.pathname, location.hash, location.state, navigate],
  )

  useLayoutEffect(() => {
    if (invalidSystemScope) {
      replaceScope(undefined)
      return
    }
    if (!orgTier || globalSupport || activeOrg == null) return
    storeOrgId(activeOrg.id)
    // These read surfaces resolve targets independently of the chosen institution.
    const globalReadSelection = ['/admin/users', '/admin/notices', '/admin/announcements'].includes(location.pathname) || location.pathname.startsWith('/admin/users/')
    const noticeAuthoring = location.pathname === '/admin/notices/new' || /^\/admin\/notices\/[^/]+\/edit$/.test(location.pathname) || location.pathname.startsWith('/admin/users/')
    if (requestedOrgId !== activeOrg.id) replaceScope(activeOrg.id, globalReadSelection, noticeAuthoring)
  }, [activeOrg, globalSupport, invalidSystemScope, location.pathname, orgTier, replaceScope, requestedOrgId])

  const setActiveOrgId = useCallback(
    (orgId: string | undefined) => {
      if (orgId == null) {
        if (globalRead) replaceScope(undefined)
        return
      }
      if (!options.some((org) => org.id === orgId)) return
      if (orgTier) storeOrgId(orgId)
      replaceScope(orgId)
    },
    [options, orgTier, replaceScope, globalRead],
  )

  const retry = useCallback(() => {
    void orgs.refetch()
  }, [orgs])

  const value = useMemo<AdminScopeValue>(
    () => ({
      tier: orgTier ? 'org' : 'system',
      globalSupport,
      activeOrgId: activeOrg?.id,
      activeOrg,
      activeOrgRole: activeOrg?.role,
      options,
      requiresSelection,
      resolving,
      catalogPending: globalRead && orgs.isPending,
      error: scopeError,
      ready,
      retry,
      setActiveOrgId,
      path: (path) => adminPath(path, activeOrg?.id ?? (globalRead ? requestedOrgId : undefined)),
    }),
    [activeOrg, options, orgTier, globalSupport, globalRead, orgs.isPending, ready, requiresSelection, resolving, retry, scopeError, setActiveOrgId, requestedOrgId],
  )

  return <AdminScopeContext.Provider value={value}>{children}</AdminScopeContext.Provider>
}
