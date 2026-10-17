import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  retryRequestRecipient,
  fetchRequest,
  fetchAdminRequest,
  type RequestDetail,
  type RequestRecipient,
  type RequestStatus,
} from '../../api/queries'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  TBody,
  TD,
  TH,
  THead,
  TR,
  type BadgeVariant,
} from '../ui'
import { REQUEST_RECIPIENT_STATUS_LABELS } from '../../lib/status'
import { requestRecipientStatusLabel } from '../../lib/request-recipient-status'
import { useActiveResult } from '../../lib/use-active-result'
import { adminPaths } from '../../lib/paths'
import { GuideLink } from '../../docs/links'
import { useAuth } from '../../auth/auth-context'
import { requestReaderKey } from '../../api/request-review'
import type { RecipientCancellationReceipt } from '../../api/request-recipient-cancellation'
import { RecipientCancellationDialog, RecipientCancellationResult } from './RecipientCancellationDialog'

const RECIPIENT_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  PENDING_JOIN: 'neutral',
  QUEUED: 'info',
  CREATING: 'info',
  CREATED: 'success',
  SKIPPED_EXPIRED: 'warning',
  SKIPPED_INELIGIBLE: 'warning',
  FAILED: 'danger',
  CANCELED: 'neutral',
}

/** A status this build does not know is shown as the raw value rather than dropped. */
export function RecipientStatusBadge({ status, admin = false, requestStatus }: { status: string; admin?: boolean; requestStatus?: RequestStatus }) {
  const labels: Record<string, string> = REQUEST_RECIPIENT_STATUS_LABELS
  return (
    <Badge variant={RECIPIENT_STATUS_VARIANTS[status] ?? 'neutral'}>
      {requestStatus ? requestRecipientStatusLabel(requestStatus, status, admin) : admin && status === 'CREATED' ? '리소스 등록됨' : labels[status] ?? status}
    </Badge>
  )
}

function recipientLabel(recipient: RequestRecipient): string {
  return recipient.name ?? recipient.invitee ?? '—'
}

/**
 * The people a request was filed for and what became of each. Rendered only
 * for a request that names recipients; an ordinary request has none.
 */
export function RequestRecipientsCard(props: Parameters<typeof RequestRecipientsContent>[0]) {
  const { user } = useAuth()
  const location = useLocation()
  const context = `${requestReaderKey(user)}:${location.pathname}:${new URLSearchParams(location.search).get('org') ?? 'all'}:${props.admin ? 'admin' : 'user'}:${props.request.id}:${props.request.workspaceId}`
  return <RequestRecipientsContent key={context} {...props} />
}

function RequestRecipientsContent({
  request,
  resourceHref,
  canRetry,
  admin = false,
  userReadable,
}: {
  request: RequestDetail
  /** Where the created resource opens for this viewer, or null when it is not theirs to open. */
  resourceHref: (recipient: RequestRecipient) => string | null
  canRetry: boolean
  admin?: boolean
  userReadable?: (recipient: RequestRecipient) => boolean
}) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const reader = requestReaderKey(user)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<Record<string, RecipientCancellationReceipt>>({})
  const active = useActiveResult()
  const retry = useMutation({
    mutationFn: (recipientId: string) => retryRequestRecipient(request.id, recipientId),
    onSuccess: async () => {
      if (active.current) setError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'requests'] }),
        queryClient.invalidateQueries({ queryKey: ['requests'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
      ])
    },
    onError: (err) => { if (active.current) setError(err.message) },
  })

  const recipients = request.recipients ?? []
  if (recipients.length === 0) return null
  const retryable = canRetry && request.status === 'APPROVED' && recipients.some((recipient) => recipient.status === 'FAILED')
  const modeOf = (recipient: RequestRecipient) => admin && recipient.cancellationCapability?.supportAllowed ? 'support' : recipient.cancellationCapability?.ownerAllowed ? 'owner' : null
  const hasActions = retryable || recipients.some((recipient) => modeOf(recipient) !== null && !recipient.cancellation && !receipts[recipient.id])
  const selected = recipients.find((recipient) => recipient.id === selectedId)
  const selectedMode = selected ? modeOf(selected) : null
  const readback = async () => {
    const next = await (admin ? fetchAdminRequest(request.id) : fetchRequest(request.id))
    if (active.current && next.id === request.id && next.workspaceId === request.workspaceId) {
      queryClient.setQueriesData<RequestDetail>({ predicate: (query) => admin
        ? query.queryKey[0] === 'admin' && query.queryKey[1] === 'requests' && query.queryKey[2] === request.id && typeof query.queryKey[3] === 'object' && query.queryKey[3] !== null && 'reader' in query.queryKey[3] && query.queryKey[3].reader === reader
        : query.queryKey[0] === 'requests' && query.queryKey[1] === request.id && query.queryKey[2] === reader }, () => next)
    }
    return next
  }
  const stored = (receipt: RecipientCancellationReceipt) => {
    if (!active.current) return
    setReceipts((previous) => ({ ...previous, [receipt.recipientId]: receipt }))
    void queryClient.invalidateQueries({ queryKey: ['admin', 'requests'] })
    void queryClient.invalidateQueries({ queryKey: ['requests'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>대상자</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-right text-sm"><GuideLink slug="requests/bulk" anchor="status">대상자 상태 안내</GuideLink></p>
        {error && <Alert variant="danger">{error}</Alert>}
        {admin && <Alert variant="info" title="리소스 등록과 실제 완료">
          등록됨은 리소스와 권한 기록이 만들어진 상태입니다. VM 프로비저닝 완료를 뜻하지 않습니다.
          실제 진행과 실패 사유는 각 리소스의 상세 보기에서 확인해 주세요.
        </Alert>}
        <DataTable caption="대상자" className="min-w-[36rem]">
          <THead>
            <TR>
              <TH>대상자</TH>
              <TH>상태</TH>
              <TH>리소스</TH>
              <TH>사유</TH>
              {hasActions && (
                <TH>
                  <span className="sr-only">작업</span>
                </TH>
              )}
            </TR>
          </THead>
          <TBody>
            {recipients.map((recipient) => {
              const href = recipient.resourceId ? resourceHref(recipient) : null
              const cancellation = recipient.cancellation ?? receipts[recipient.id]
              const mode = modeOf(recipient)
              return (
                <TR key={recipient.id}>
                  <TD>{admin && recipient.userId && userReadable?.(recipient)
                    ? <Link className="text-primary-700 hover:underline" to={adminPaths.userSupport(recipient.userId, request.orgId ?? undefined)}>{recipientLabel(recipient)}</Link>
                    : recipientLabel(recipient)}</TD>
                  <TD>
                    <RecipientStatusBadge status={cancellation ? 'CANCELED' : recipient.status} admin={admin} requestStatus={request.status} />
                  </TD>
                  <TD>
                    {href ? (
                      <Link to={href} className="font-medium text-primary-700 hover:underline">
                        상세 보기
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD>{cancellation ? <RecipientCancellationResult receipt={cancellation} /> : <div className="space-y-1 [overflow-wrap:anywhere]">
                    <p>{recipient.reason ?? '—'}</p>
                    {request.status === 'APPROVED' && recipient.cancellationCapability?.blockedReason && <p className="text-xs text-foreground-muted">{recipient.cancellationCapability.blockedReason}</p>}
                  </div>}</TD>
                  {hasActions && (
                    <TD className="whitespace-nowrap">
                      {retryable && recipient.status === 'FAILED' && !cancellation && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={retry.isPending}
                          loading={retry.isPending && retry.variables === recipient.id}
                          onClick={() => retry.mutate(recipient.id)}
                        >
                          다시 시도
                        </Button>
                      )}
                      {mode && !cancellation && <Button size="sm" variant="danger" aria-label={`${recipientLabel(recipient)} 생성 대기 취소`} disabled={retry.isPending} onClick={() => setSelectedId(recipient.id)}>생성 대기 취소</Button>}
                    </TD>
                  )}
                </TR>
              )
            })}
          </TBody>
        </DataTable>
        {selected && selectedMode && <RecipientCancellationDialog key={`${selected.id}:${selectedMode}:${selected.status}:${selected.resourceId}:${selected.reason}:${JSON.stringify(selected.cancellationCapability)}`}
          request={request} recipient={selected} support={selectedMode === 'support'} resourceHref={selected.resourceId ? resourceHref(selected) : null}
          onClose={() => setSelectedId(null)} onStored={stored} onReadback={readback} />}
      </CardContent>
    </Card>
  )
}
