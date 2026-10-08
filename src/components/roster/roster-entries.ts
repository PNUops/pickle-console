import { resolveWorkspaceRoster, type RosterResolution } from '../../api/queries'
import type { BadgeVariant } from '../ui'
import type { RosterRow } from '../../lib/roster'

/** The server takes at most this many student numbers per resolve call. */
export const ROSTER_RESOLVE_CHUNK = 500

/** What became of one pasted line: the server's verdict, or why it was never asked. */
export type RosterStatus = RosterResolution['status'] | 'EMAIL' | 'NO_STUDENT_NO'

export interface RosterEntry {
  row: RosterRow
  status: RosterStatus
  resolution?: RosterResolution
}

export const ROSTER_STATUS_LABELS: Record<RosterStatus, string> = {
  MEMBER: '구성원',
  REGISTERED: '가입한 계정',
  INVITED: '초대 대기',
  NEW: '새 초대',
  INVALID: '형식 오류',
  DUPLICATE: '중복',
  EMAIL: '이메일',
  NO_STUDENT_NO: '학번 없음',
}

export const ROSTER_STATUS_VARIANTS: Record<RosterStatus, BadgeVariant> = {
  MEMBER: 'neutral',
  REGISTERED: 'info',
  INVITED: 'neutral',
  NEW: 'info',
  INVALID: 'danger',
  DUPLICATE: 'warning',
  EMAIL: 'neutral',
  NO_STUDENT_NO: 'danger',
}

/** A status newer than this build shows as its raw value. */
export function rosterStatusLabel(status: string): string {
  return (ROSTER_STATUS_LABELS as Record<string, string>)[status] ?? status
}

function normalized(studentNo: string): string {
  return studentNo.trim().toUpperCase()
}

/**
 * Asks the server about every student number, in sequential calls of at
 * most {@link ROSTER_RESOLVE_CHUNK}. A repeat is marked here rather than sent:
 * the server only sees repeats inside one call, and a repeat in a later chunk
 * would otherwise come back as the first one's status. The first failure
 * (a 429 among them) stops the run and is thrown as is.
 */
export async function resolveRosterRows(
  workspaceId: string,
  rows: RosterRow[],
  orgId?: string | null,
): Promise<RosterEntry[]> {
  const seen = new Set<string>()
  const asked: { index: number; studentNo: string }[] = []
  const entries: RosterEntry[] = rows.map((row, index) => {
    if (row.error) return { row, status: 'NO_STUDENT_NO' }
    if (row.email != null) return { row, status: 'EMAIL' }
    const key = normalized(row.studentNo!)
    if (seen.has(key)) return { row, status: 'DUPLICATE' }
    seen.add(key)
    asked.push({ index, studentNo: row.studentNo! })
    // Replaced below once the server answers.
    return { row, status: 'INVALID' }
  })

  for (let start = 0; start < asked.length; start += ROSTER_RESOLVE_CHUNK) {
    const chunk = asked.slice(start, start + ROSTER_RESOLVE_CHUNK)
    const results = await resolveWorkspaceRoster(
      workspaceId,
      chunk.map((item) => item.studentNo),
      orgId,
    )
    chunk.forEach((item, offset) => {
      const resolution = results[offset]
      if (resolution) entries[item.index] = { ...entries[item.index], status: resolution.status, resolution }
    })
  }
  return entries
}

/** `구성원 2명, 새 초대 3명`, in label order, for the live summary. */
export function rosterSummary(entries: RosterEntry[]): string {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const label = rosterStatusLabel(entry.status)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  const order = Object.values(ROSTER_STATUS_LABELS)
  return [...counts.entries()]
    .sort(([a], [b]) => {
      const ia = order.indexOf(a)
      const ib = order.indexOf(b)
      return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib)
    })
    .map(([label, count]) => `${label} ${count}명`)
    .join(', ')
}
