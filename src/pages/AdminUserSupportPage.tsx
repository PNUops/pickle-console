import { Link, useParams, useSearchParams } from 'react-router'
import { requestReaderKey } from '../api/request-review'
import { useAuth } from '../auth/auth-context'
import { canReadSupportMetadata, isSysAdminOnly } from '../auth/permissions'
import { hasAnyWork, SYS_READERS } from '../auth/institution-authority'
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
  const returnPath = userSupportReturn(params.get('returnTo'), activeOrgId, !!user && canReadSupportMetadata(user.role))
  const profileLookup = hasAnyWork(user, ['student.lookup', 'student.support.read', 'student.profile.correct'], SYS_READERS)
  return <div className="space-y-6 [overflow-wrap:anywhere]">
    <Link to={returnPath} className="text-sm text-primary-700 hover:underline">← {returnPath.startsWith('/admin/workspaces') ? '워크스페이스 목록' : '사용자 목록'}</Link>
    <PageHeader title="사용자 관계와 지원" />
    {!rawUserId || !isUuid(rawUserId) ? <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
      : !profileLookup ? <UserAccessDiagnostic key={`${rawUserId}-${params.get('resourceType')}-${params.get('resourceId')}`} userId={rawUserId.toLowerCase()} />
      : <UserDetailBody key={`${rawUserId}-${activeOrgId ?? 'all'}-${requestReaderKey(user)}`} userId={rawUserId.toLowerCase()} canManage={!!user && isSysAdminOnly(user.role)}>
        <UserSupportRelationships userId={rawUserId.toLowerCase()} />
        <UserAccessDiagnostic key={`${rawUserId}-${params.get('resourceType')}-${params.get('resourceId')}`} userId={rawUserId.toLowerCase()} />
      </UserDetailBody>}
  </div>
}
