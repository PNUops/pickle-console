import { Link, useLocation } from 'react-router'
import type { ResourceType } from '../../api/queries'
import { adminPaths } from '../../lib/paths'
import { withListReturn } from '../../lib/list-url'
import { useAdminScope } from '../../lib/use-admin-scope'

export function AdminResourceAccessLink({ type, resourceId }: { type: ResourceType; resourceId: string }) {
  const scope = useAdminScope()
  const location = useLocation()
  return <Link to={withListReturn(adminPaths.resourceAccess(type, resourceId, scope.activeOrgId), `${location.pathname}${location.search}`)} className="inline-flex text-sm font-medium text-primary-700 hover:underline">접근 권한</Link>
}
