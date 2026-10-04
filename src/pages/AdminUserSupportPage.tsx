import { Link, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../auth/auth-context'
import { isSysAdminOnly, isSysTier } from '../auth/permissions'
import { Alert, PageHeader } from '../components/ui'
import { UserAccessDiagnostic, UserSupportRelationships } from '../components/UserSupport'
import { UserDetailBody } from './AdminUsersPage'
import { useAdminScope } from '../lib/use-admin-scope'
import { userSupportReturn } from '../lib/user-list'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'

export function AdminUserSupportPage() {
  const { userId: rawUserId } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const { activeOrgId } = useAdminScope()
  const returnPath = userSupportReturn(params.get('returnTo'), activeOrgId, !!user && isSysTier(user.role))
  return <div className="space-y-6 [overflow-wrap:anywhere]">
    <Link to={returnPath} className="text-sm text-primary-700 hover:underline">← {returnPath.startsWith('/admin/workspaces') ? '워크스페이스 목록' : '사용자 목록'}</Link>
    <PageHeader title="사용자 관계와 지원" />
    {!rawUserId || !isUuid(rawUserId) ? <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
      : <UserDetailBody key={`${rawUserId}-${activeOrgId ?? 'all'}`} userId={rawUserId.toLowerCase()} canManage={!!user && isSysAdminOnly(user.role)}>
        <UserSupportRelationships userId={rawUserId.toLowerCase()} />
        <UserAccessDiagnostic key={`${rawUserId}-${params.get('resourceType')}-${params.get('resourceId')}`} userId={rawUserId.toLowerCase()} />
      </UserDetailBody>}
  </div>
}
