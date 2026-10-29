import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchAdminBulkOperation, fetchAdminBulkPreview, fetchRecentAdminBulkOperations } from '../../api/bulk-results'
import type { AdminBulkChangePreview } from '../../api/queries'
import { BULK_TARGET_TYPES, type BulkFamily } from '../../lib/bulk-change'
import { formatDateTime } from '../../lib/format'
import { adminPaths } from '../../lib/paths'
import { Button, MessageBar, Spinner } from '../ui'
import { withListReturn } from '../../lib/list-url'
import { AccountImpactView } from '../llm-usage/AccountImpactView'
import { BulkChangeReceipt } from './BulkChangeReceipt'
import { BulkChangePreviewTable } from './BulkChangeTables'

export function BulkChangeReentry({ family, previewId, operationId, reader, orgId, returnTo, canContinue, onContinue }: {
  family: BulkFamily
  previewId?: string
  operationId?: string
  reader: string
  orgId?: string
  returnTo?: string
  canContinue: (preview: AdminBulkChangePreview) => boolean
  onContinue: (preview: AdminBulkChangePreview) => void
}) {
  const operation = useQuery({ queryKey: ['admin-bulk-operation', operationId, reader, orgId], queryFn: () => fetchAdminBulkOperation(operationId!), enabled: !!operationId, retry: false })
  const needsAccountImpact = family === 'llm-keys' && operation.isSuccess && operation.data.targetType === 'LLM_KEY' && operation.data.change?.kind === 'LLM_KEY_LIMITS'
  const actualPreviewId = operation.data?.previewId ?? previewId
  const preview = useQuery({ queryKey: ['admin-bulk-preview', actualPreviewId, reader, orgId], queryFn: () => fetchAdminBulkPreview(actualPreviewId!),
    enabled: !!actualPreviewId && (!operationId || operation.isError || needsAccountImpact), retry: false })
  const back = (path: string) => returnTo ? withListReturn(path, returnTo) : path
  const targetType = BULK_TARGET_TYPES[family]
  if (operationId) {
    if (operation.isPending) return <Spinner label="저장된 적용 결과 불러오는 중" />
    if (operation.isSuccess) {
      if (operation.data.operationId !== operationId || operation.data.targetType !== targetType) return <MessageBar variant="danger">이 목록 종류에 해당하는 적용 결과가 아닙니다.</MessageBar>
      return <div className="space-y-4"><BulkChangeReceipt operation={operation.data} />
        {family === 'llm-keys' && operation.data.change?.kind === 'LLM_KEY_LIMITS' && preview.isFetching && <MessageBar>계정 영향 이력을 현재 권한으로 다시 조회하고 있습니다.</MessageBar>}
        {family === 'llm-keys' && operation.data.change?.kind === 'LLM_KEY_LIMITS' && preview.isError && <MessageBar variant="warning">계정 영향 이력을 불러오지 못했습니다. 저장된 대상별 적용 결과와 구분해서 확인해 주세요.</MessageBar>}
        {family === 'llm-keys' && preview.isSuccess && !preview.isFetching && preview.data.previewId === operation.data.previewId && preview.data.change?.kind === 'LLM_KEY_LIMITS' && <AccountImpactView projection={preview.data.accountImpact} />}
        <Button variant="secondary" onClick={() => { void operation.refetch(); if (needsAccountImpact) void preview.refetch() }} loading={operation.isFetching}>현재 상태 다시 조회</Button></div>
    }
    return <div className="space-y-4">
      <MessageBar variant="warning">저장된 결과를 확인하지 못했습니다. 요청이 접수됐는지는 아직 알 수 없습니다. 같은 적용 ID로 다시 조회해 주세요.</MessageBar>
      <p className="break-all text-sm">적용 ID: <code>{operationId}</code></p>
      <Button variant="secondary" onClick={() => void operation.refetch()} loading={operation.isFetching}>같은 적용 결과 다시 조회</Button>
      {preview.isSuccess && preview.data.targetType === targetType && preview.data.consumedOperationId && <Link className="block text-brand-foreground underline" to={back(adminPaths.bulkOperation(family, preview.data.consumedOperationId, orgId, preview.data.previewId))}>이 미리보기로 이미 저장된 결과 열기</Link>}
      {previewId && <Link className="block text-brand-foreground underline" to={back(adminPaths.bulkPreview(family, previewId, orgId))}>저장된 미리보기 확인</Link>}
    </div>
  }
  if (preview.isPending) return <Spinner label="저장된 미리보기 불러오는 중" />
  if (preview.isError) return <MessageBar variant="danger">{preview.error.message}</MessageBar>
  const data = preview.data
  if (data.previewId !== previewId || data.targetType !== targetType) return <MessageBar variant="danger">이 목록 종류에 해당하는 미리보기가 아닙니다.</MessageBar>
  const live = Date.now() < Date.parse(data.expiresAt)
  return <section className="space-y-4">
    <p className="text-sm">미리보기 저장: {formatDateTime(data.createdAt)} · 새 적용 가능 기한: {formatDateTime(data.expiresAt)}</p>
    <BulkChangePreviewTable items={data.items} targetType={data.targetType} />
    {family === 'llm-keys' && !preview.isFetching && data.change?.kind === 'LLM_KEY_LIMITS' && <AccountImpactView projection={data.accountImpact} />}
    {data.consumedOperationId ? <MessageBar actions={<Link className="font-semibold underline" to={back(adminPaths.bulkOperation(family, data.consumedOperationId, orgId, data.previewId))}>저장된 결과 열기</Link>}>이 미리보기는 이미 적용에 사용됐습니다.</MessageBar> : !live ? <MessageBar variant="warning">미리보기의 새 적용 가능 시간이 지났습니다. 목록에서 다시 선택해 새 미리보기를 만들어 주세요.</MessageBar> : !data.change || !canContinue(data) ? <MessageBar variant="warning">현재 권한과 관리 기관 선택으로 이 미리보기를 적용할 수 없습니다.</MessageBar> : <Button onClick={() => onContinue(data)}>이 미리보기로 적용 준비</Button>}
  </section>
}

export function RecentBulkChanges({ family, reader, orgId, returnTo }: { family: BulkFamily; reader: string; orgId?: string; returnTo?: string }) {
  const recent = useQuery({ queryKey: ['admin-bulk-recent', reader, orgId], queryFn: fetchRecentAdminBulkOperations, retry: false })
  const rows = recent.data?.filter((operation) => operation.targetType === BULK_TARGET_TYPES[family]) ?? []
  return <section className="space-y-3">
    <h2 className="font-semibold">본인의 최근 적용 결과</h2>
    {recent.isPending && <Spinner label="최근 적용 결과 불러오는 중" />}
    {recent.isError && <MessageBar variant="danger">{recent.error.message}</MessageBar>}
    {recent.isSuccess && rows.length === 0 && <p className="text-sm text-foreground-muted">이 종류에 저장된 최근 적용 결과가 없습니다.</p>}
    <ul className="space-y-2">{rows.map((operation) => { const path = adminPaths.bulkOperation(family, operation.operationId, orgId, operation.previewId); return <li key={operation.operationId}><Link className="break-all text-brand-foreground underline" to={returnTo ? withListReturn(path, returnTo) : path}>{formatDateTime(operation.committedAt)} · {operation.operationId}</Link></li> })}</ul>
  </section>
}
