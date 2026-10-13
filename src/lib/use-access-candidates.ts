import { useQueries } from '@tanstack/react-query'
import { fetchAdminWorkspace, type ResourceType } from '../api/queries'
import { fetchAdminResourceAccess } from '../api/resource-access'
import { requestReaderKey } from '../api/request-review'
import { useAuth } from '../auth/auth-context'

/** Picker labels come from authorized memberships and existing grants, never profiles. */
export function useAccessCandidates(type: ResourceType, resourceIds: readonly string[], includeExisting: boolean) {
  const { user } = useAuth()
  const reader = requestReaderKey(user)
  const access = useQueries({ queries: resourceIds.map((id) => ({ queryKey: ['admin-resource-access', type, id, 'access', reader], queryFn: () => fetchAdminResourceAccess(type, id) })) })
  const workspaceIds = [...new Set(access.flatMap((query) => query.data ? [query.data.resource.workspaceId] : []))].sort()
  const workspaces = useQueries({ queries: workspaceIds.map((id) => ({ queryKey: ['admin-workspaces', id, reader], queryFn: () => fetchAdminWorkspace(id) })) })
  const candidates = new Map<string, { id: string; name: string; email: string }>()
  for (const workspace of workspaces) {
    for (const member of workspace.data?.members ?? []) {
      if (member.userStatus === 'ACTIVE') candidates.set(member.userId, { id: member.userId, name: member.name, email: member.email })
    }
  }
  if (includeExisting) {
    for (const query of access) {
      for (const grant of query.data?.grants ?? []) {
        if (grant.user) candidates.set(grant.user.userId, { id: grant.user.userId, name: grant.user.name, email: grant.user.email })
      }
    }
  }
  return { candidates: [...candidates.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.email.localeCompare(b.email)),
    pending: access.some((query) => query.isPending) || workspaces.some((query) => query.isPending),
    errors: [...access, ...workspaces].filter((query) => query.isError).map((query) => query.error!.message) }
}
