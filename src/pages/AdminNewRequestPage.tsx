import { useSearchParams } from 'react-router'
import { useAuth } from '../auth/auth-context'
import { hasRosterWork } from '../auth/request-authority'
import { Alert } from '../components/ui'
import { requestKind, REQUEST_KINDS } from '../components/request-kind'
import { KindPicker } from '../components/request-kind/KindPicker'
import { RequestWizard } from '../components/request-kind/RequestWizard'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'

/** The kinds an approver can file for workspace members. */
const ADMIN_KINDS = REQUEST_KINDS.filter((kind) => kind.supportsRecipients)

/**
 * An approver files a request for members of a workspace and approves it in
 * the same step. It is the applicant's wizard, not a second creation path:
 * the request, its review and the per-person creation are the ones any
 * request goes through.
 */
export function AdminNewRequestPage() {
  const { user } = useAuth()
  const { activeOrgId } = useAdminScope()
  const [searchParams] = useSearchParams()
  if (!hasRosterWork(user)) {
    return <Alert variant="danger">명단을 지급할 업무가 없습니다.</Alert>
  }
  const found = requestKind(searchParams.get('kind') ?? '')
  const kind = found?.supportsRecipients && hasRosterWork(user, found.type) ? found : undefined
  return kind ? (
    <RequestWizard key={kind.type} kind={kind} admin={{ orgId: activeOrgId }} />
  ) : (
    <KindPicker kinds={ADMIN_KINDS.filter((candidate) => hasRosterWork(user, candidate.type))} pathFor={(type) => adminPaths.newRequest(activeOrgId, type)} />
  )
}
