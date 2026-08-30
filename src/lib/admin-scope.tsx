import { useCallback, useLayoutEffect, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { fetchOrgs } from '../api/queries'
import { useAuth } from '../auth/auth-context'
import { isOrgTier, isSysTier } from '../auth/permissions'
import { adminPath } from './paths'
import { ADMIN_ORG_SCOPE_KEY } from './storage-keys'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedOrgId = searchParams.get('org') ?? undefined
  const orgTier = !!user && isOrgTier(user.role)
  const systemTier = !!user && isSysTier(user.role)
  const orgs = useQuery({
    queryKey: ['orgs'],
    queryFn: fetchOrgs,
    enabled: systemTier,
  })

  const options = useMemo<AdminOrgOption[]>(() => {
    if (orgTier) {
      return (user?.managedOrgs ?? []).map((org) => ({
        id: org.orgId,
        name: org.orgName,
        role: org.role,
      }))
    }
    return (orgs.data ?? []).map((org) => ({ id: org.id, name: org.name }))
  }, [orgTier, orgs.data, user?.managedOrgs])

  const activeOrg = useMemo(() => {
    if (systemTier) return options.find((org) => org.id === requestedOrgId)
    const requested = options.find((org) => org.id === requestedOrgId)
    if (requested) return requested
    const stored = storedOrgId()
    const restored = options.find((org) => org.id === stored)
    if (restored) return restored
    return options.length === 1 ? options[0] : undefined
  }, [options, requestedOrgId, systemTier])

  const invalidSystemScope =
    systemTier && requestedOrgId != null && orgs.isSuccess && activeOrg == null
  const resolving = systemTier && requestedOrgId != null && !orgs.isSuccess
  const requiresSelection = orgTier && activeOrg == null
  const ready = systemTier
    ? requestedOrgId == null || (orgs.isSuccess && activeOrg != null)
    : orgTier && activeOrg != null

  const replaceScope = useCallback(
    (orgId: string | undefined) => {
      const next = new URLSearchParams(searchParams)
      if (orgId == null) next.delete('org')
      else next.set('org', orgId)
      // 이전 페이지의 기관 종속 필터를 새 scope에 가져가지 않는다.
      next.delete('orgId')
      next.delete('workspaceId')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  useLayoutEffect(() => {
    if (invalidSystemScope) {
      replaceScope(undefined)
      return
    }
    if (!orgTier || activeOrg == null) return
    storeOrgId(activeOrg.id)
    if (requestedOrgId !== activeOrg.id) replaceScope(activeOrg.id)
  }, [activeOrg, invalidSystemScope, orgTier, replaceScope, requestedOrgId])

  const setActiveOrgId = useCallback(
    (orgId: string | undefined) => {
      if (orgId == null) {
        if (systemTier) replaceScope(undefined)
        return
      }
      if (!options.some((org) => org.id === orgId)) return
      if (orgTier) storeOrgId(orgId)
      replaceScope(orgId)
    },
    [options, orgTier, replaceScope, systemTier],
  )

  const value = useMemo<AdminScopeValue>(
    () => ({
      tier: orgTier ? 'org' : 'system',
      activeOrgId: activeOrg?.id,
      activeOrg,
      activeOrgRole: activeOrg?.role,
      options,
      requiresSelection,
      resolving,
      ready,
      setActiveOrgId,
      path: (path) => adminPath(path, activeOrg?.id),
    }),
    [activeOrg, options, orgTier, ready, requiresSelection, resolving, setActiveOrgId],
  )

  return <AdminScopeContext.Provider value={value}>{children}</AdminScopeContext.Provider>
}
