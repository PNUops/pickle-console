import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  retryRequestRecipient,
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
export function RequestRecipientsCard({
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
  const [error, setError] = useState<string | null>(null)
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>대상자</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert variant="danger">{error}</Alert>}
        {admin && <Alert variant="info" title="리소스 등록과 실제 완료">
          등록됨은 리소스와 권한 기록이 만들어진 상태입니다. VM 프로비저닝 완료를 뜻하지 않습니다.
          실제 진행과 실패 사유는 각 리소스의 상세 보기에서 확인해 주세요.
        </Alert>}
        <DataTable caption="대상자">
          <THead>
            <TR>
              <TH>대상자</TH>
              <TH>상태</TH>
              <TH>리소스</TH>
              <TH>사유</TH>
              {retryable && (
                <TH>
                  <span className="sr-only">작업</span>
                </TH>
              )}
            </TR>
          </THead>
          <TBody>
            {recipients.map((recipient) => {
              const href = recipient.resourceId ? resourceHref(recipient) : null
              return (
                <TR key={recipient.id}>
                  <TD>{admin && recipient.userId && userReadable?.(recipient)
                    ? <Link className="text-primary-700 hover:underline" to={adminPaths.userSupport(recipient.userId, request.orgId ?? undefined)}>{recipientLabel(recipient)}</Link>
                    : recipientLabel(recipient)}</TD>
                  <TD>
                    <RecipientStatusBadge status={recipient.status} admin={admin} requestStatus={request.status} />
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
                  <TD>{recipient.reason ?? '—'}</TD>
                  {retryable && (
                    <TD>
                      {recipient.status === 'FAILED' && (
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
                    </TD>
                  )}
                </TR>
              )
            })}
          </TBody>
        </DataTable>
      </CardContent>
    </Card>
  )
}
