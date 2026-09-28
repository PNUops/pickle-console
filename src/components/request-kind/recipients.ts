import type { RequestDetail } from '../../api/queries'

/** One person the request can be filed for. */
export interface RecipientCandidate {
  /** `u:<userId>` for a member, `i:<invitationId>` for a pending invitation. */
  key: string
  label: string
  description: string | null
}

/** Turns a chosen candidate key into the request body entry the server takes. */
export function recipientBody(key: string): { userId: string } | { invitationId: string } {
  return key.startsWith('i:') ? { invitationId: key.slice(2) } : { userId: key.slice(2) }
}

/** Recipient states that are still moving toward a resource. */
const IN_FLIGHT = new Set(['QUEUED', 'CREATING'])

/**
 * Poll interval for a request detail query: only an approved request has
 * recipients the materializer is working on, and only while one is in flight.
 */
export function recipientPollInterval(request: RequestDetail | undefined): number | false {
  if (!request || request.status !== 'APPROVED') return false
  return (request.recipients ?? []).some((recipient) => IN_FLIGHT.has(recipient.status))
    ? 3000
    : false
}
