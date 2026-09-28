import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  retryRequestRecipient,
  type RequestDetail,
  type RequestRecipient,
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
export function RecipientStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = REQUEST_RECIPIENT_STATUS_LABELS
  return (
    <Badge variant={RECIPIENT_STATUS_VARIANTS[status] ?? 'neutral'}>
      {labels[status] ?? status}
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
}: {
  request: RequestDetail
  /** Where the created resource opens for this viewer, or null when it is not theirs to open. */
  resourceHref: (recipient: RequestRecipient) => string | null
  canRetry: boolean
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const retry = useMutation({
    mutationFn: (recipientId: string) => retryRequestRecipient(request.id, recipientId),
    onSuccess: async () => {
      setError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'requests'] }),
        queryClient.invalidateQueries({ queryKey: ['requests'] }),
      ])
    },
    onError: (err) => setError(err.message),
  })

  const recipients = request.recipients ?? []
  if (recipients.length === 0) return null
  const retryable = canRetry && recipients.some((recipient) => recipient.status === 'FAILED')

  return (
    <Card>
      <CardHeader>
        <CardTitle>대상자</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert variant="danger">{error}</Alert>}
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
                  <TD>{recipientLabel(recipient)}</TD>
                  <TD>
                    <RecipientStatusBadge status={recipient.status} />
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
