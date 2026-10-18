import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { fetchAdminBulkOperation } from '../api/bulk-results'
import { requestReaderKey } from '../api/request-review'
import { useAuth } from '../auth/auth-context'
import { BulkChangeReceipt } from '../components/bulk/BulkChangeReceipt'
import { Button, MessageBar, PageHeader, Spinner } from '../components/ui'
import { useAdminScope } from '../lib/use-admin-scope'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'

export function AdminBulkReceiptPage() {
  const { operationId } = useParams<{ operationId: string }>()
  const { user } = useAuth()
  const scope = useAdminScope()
  return <BulkReceiptContent key={`${operationId}:${scope.activeOrgId ?? 'all'}:${requestReaderKey(user)}`} operationId={operationId?.toLowerCase()} />
}

function BulkReceiptContent({ operationId }: { operationId?: string }) {
  const { user } = useAuth()
  const { activeOrgId } = useAdminScope()
  const valid = !!operationId && isUuid(operationId)
  const operation = useQuery({ queryKey: ['admin-bulk-operation', operationId, requestReaderKey(user), activeOrgId], queryFn: () => fetchAdminBulkOperation(operationId!), enabled: valid, retry: false })
  return <div className="space-y-5">
    <PageHeader title="저장된 일괄 변경 결과" />
    {!valid ? <MessageBar variant="danger">{INVALID_ID_MESSAGE}</MessageBar> : operation.isPending ? <Spinner label="저장된 적용 결과 불러오는 중" /> : operation.isError ? <MessageBar variant="warning">저장된 결과를 현재 계정으로 확인하지 못했습니다. 접수 여부가 불명확하면 같은 적용 ID로 다시 조회해 주세요.</MessageBar> : operation.data.operationId !== operationId ? <MessageBar variant="danger">현재 적용 ID에 해당하는 결과가 아닙니다.</MessageBar> : <BulkChangeReceipt operation={operation.data} />}
    {valid && <Button variant="secondary" loading={operation.isFetching} onClick={() => void operation.refetch()}>같은 적용 결과 다시 조회</Button>}
  </div>
}
