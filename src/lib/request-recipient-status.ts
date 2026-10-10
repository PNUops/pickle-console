import { REQUEST_RECIPIENT_STATUS_LABELS, type RequestStatus } from './status'

/** A queued recipient becomes a creation queue only after its request is approved. */
export function requestRecipientStatusLabel(requestStatus: RequestStatus, recipientStatus: string, admin = false): string {
  if (recipientStatus === 'QUEUED' && requestStatus !== 'APPROVED') {
    return requestStatus === 'SUBMITTED' ? '승인 대기' : '생성 미접수'
  }
  if (admin && recipientStatus === 'CREATED') return '자원 등록됨'
  const labels: Record<string, string> = REQUEST_RECIPIENT_STATUS_LABELS
  return labels[recipientStatus] ?? recipientStatus
}
