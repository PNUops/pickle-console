import { Link, useLocation } from 'react-router'
import type { ResourceType } from '../../api/queries'
import { adminPaths } from '../../lib/paths'
import { withListReturn } from '../../lib/list-url'
import { useAdminScope } from '../../lib/use-admin-scope'
import { useAuth } from '../../auth/auth-context'
import { hasWork, SYS_ADMIN, SYS_READERS } from '../../auth/institution-authority'

export function AdminResourceAccessLink({ type, resourceId, orgId, workspaceId }: { type: ResourceType; resourceId: string; orgId?: string | null; workspaceId?: string | null }) {
  const scope = useAdminScope()
  const location = useLocation()
  const { user } = useAuth()
  const kind = type === 'LLM_API_KEY' ? 'llm' : type.toLowerCase()
  if (!hasWork(user, `${kind}.acl.support.read`, { orgId, workspaceId }, SYS_READERS)
    && !hasWork(user, `${kind}.acl.support.manage`, { orgId, workspaceId }, SYS_ADMIN)) return null
  return <Link to={withListReturn(adminPaths.resourceAccess(type, resourceId, scope.activeOrgId), `${location.pathname}${location.search}`)} className="inline-flex text-sm font-medium text-primary-700 hover:underline">접근 권한</Link>
}
