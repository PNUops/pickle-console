import type { RequestDetail } from '../../api/queries'
import type { RosterEntry } from '../roster/roster-entries'

/** One person the request can be filed for. */
export interface RecipientCandidate {
  /**
   * `u:<userId>` for a member, `i:<invitationId>` for a pending invitation,
   * `s:<STUDENTNO>` for a pasted student number the server turns into a
   * membership or an invitation when the request is submitted. The student
   * number in the key is upper-cased so two spellings make one key.
   */
  key: string
  /** The student number as pasted, sent for an `s:` key. */
  studentNo?: string
  label: string
  description: string | null
  /** Whether the resource waits for the person to join. True for every `i:` key. */
  awaitsJoin?: boolean
}

/** Turns a chosen candidate into the request body entry the server takes. */
export function recipientBody({
  key,
  studentNo,
}: RecipientCandidate): { userId: string } | { invitationId: string } | { studentNo: string } {
  if (key.startsWith('i:')) return { invitationId: key.slice(2) }
  if (key.startsWith('s:')) return { studentNo: studentNo ?? key.slice(2) }
  return { userId: key.slice(2) }
}

/** Requests take at most this many recipients, as on the server. */
export const MAX_RECIPIENTS = 200

export const MAX_RECIPIENTS_MESSAGE = `대상자는 한 번에 ${MAX_RECIPIENTS}명까지 지정할 수 있습니다.`

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

const JOIN_DESCRIPTION = '가입하면 만들어집니다.'

/**
 * The people a resolved roster names, as picker candidates. A member becomes
 * its `u:` key and a pending invitation its `i:` key, so a person already on
 * the list is not listed twice; an account outside the workspace and a
 * student nobody has invited become `s:` keys. Every other line is left out.
 */
export function rosterCandidates(entries: RosterEntry[]): {
  candidates: RecipientCandidate[]
  excluded: number
} {
  const candidates: RecipientCandidate[] = []
  const keys = new Set<string>()
  let excluded = 0
  for (const { row, status, resolution } of entries) {
    const studentNo = resolution?.studentNo ?? row.studentNo ?? ''
    const label = row.name ? `${studentNo} ${row.name}` : studentNo
    let candidate: RecipientCandidate | null = null
    if (status === 'MEMBER' && resolution?.userId) {
      candidate = { key: `u:${resolution.userId}`, label: resolution.name ?? label, description: studentNo }
    } else if (status === 'INVITED' && resolution?.invitationId) {
      candidate = { key: `i:${resolution.invitationId}`, label, description: JOIN_DESCRIPTION, awaitsJoin: true }
    } else if (status === 'REGISTERED') {
      // The server names only a member's account, so this one says what submitting does.
      candidate = { key: `s:${studentNo.toUpperCase()}`, studentNo, label, description: '제출하면 구성원으로 추가됩니다.' }
    } else if (status === 'NEW') {
      candidate = {
        key: `s:${studentNo.toUpperCase()}`,
        studentNo,
        label,
        description: JOIN_DESCRIPTION,
        awaitsJoin: true,
      }
    }
    if (!candidate) {
      excluded += 1
    } else if (!keys.has(candidate.key)) {
      keys.add(candidate.key)
      candidates.push(candidate)
    }
  }
  return { candidates, excluded }
}
