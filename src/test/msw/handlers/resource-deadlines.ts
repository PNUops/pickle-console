import { http, HttpResponse } from 'msw'
import type { AdminDeadlinePage, AdminResourceDeadline } from '../../../api/resource-deadlines'
import { canReadSupportMetadata } from '../../../auth/permissions'
import { ACCESS_TOKENS, problemResponse } from './auth'
import { localDateStr } from './vms'
import { uuid } from '../ids'

function endInstant(date: string) {
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  return `${next}T00:00:00+09:00`
}
export function deadlineFixture(patch: Partial<AdminResourceDeadline> = {}): AdminResourceDeadline {
  const endDate = localDateStr(3)
  return { id: uuid(56), type: 'VM', name: 'algo-judge', sourceStatus: 'STOPPED', status: 'STOPPED',
    deadlineKind: 'VM_USAGE_END', deadlineAt: endInstant(endDate), inclusiveEndDate: endDate,
    observedAt: new Date().toISOString(), overdue: false, orgId: uuid(1), orgName: '정보컴퓨터공학부 실습지원센터',
    workspaceId: uuid(11), workspaceName: '캡스톤 3조', connectionStatus: null,
    dates: { startDate: null, endDate, expiryStoppedAt: null, deleteScheduledFor: null, deleteRequestedAt: null,
      expiresAt: null, renewDueAt: null, releasedAt: null, reservedUntil: null, grantedStartDate: null,
      grantedEndDate: null, allocatedAt: null, leaseEndsAt: null }, ...patch }
}
function initialRows() {
  const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
  return [
    deadlineFixture(),
    deadlineFixture({ id: uuid(171), type: 'LLM_API_KEY', name: 'capstone-key', sourceStatus: 'ACTIVE', status: 'ACTIVE', deadlineKind: 'LLM_KEY_EXPIRY', deadlineAt: future(4), inclusiveEndDate: null, dates: { expiresAt: future(4) } }),
    deadlineFixture({ id: uuid(9101), type: 'DOMAIN', name: 'docs.example.test', sourceStatus: 'ACTIVE', status: 'ACTIVE', deadlineKind: 'DOMAIN_RENEWAL', deadlineAt: future(5), inclusiveEndDate: null, dates: { renewDueAt: future(5), releasedAt: null, reservedUntil: null } }),
    deadlineFixture({ id: uuid(9102), type: 'DOMAIN', name: 'reserved.example.test', sourceStatus: 'ACTIVE', status: 'ACTIVE', deadlineKind: 'DOMAIN_RESERVATION', deadlineAt: future(2), inclusiveEndDate: null, dates: { renewDueAt: future(-2), releasedAt: future(-1), reservedUntil: future(2) } }),
    deadlineFixture({ id: uuid(901), type: 'GPU', name: 'gpu-queue-date', sourceStatus: 'QUEUED', status: 'QUEUED', deadlineKind: 'GPU_GRANT_END', connectionStatus: 'NONE', dates: { grantedStartDate: localDateStr(0), grantedEndDate: localDateStr(3), allocatedAt: null, leaseEndsAt: null } }),
    deadlineFixture({ id: uuid(902), type: 'GPU', name: 'gpu-lease-date', sourceStatus: 'ALLOCATED', status: 'ALLOCATED', deadlineKind: 'GPU_LEASE_END', connectionStatus: 'ATTACHED', deadlineAt: future(2), inclusiveEndDate: null, dates: { grantedEndDate: localDateStr(7), allocatedAt: future(-1), leaseEndsAt: future(2) } }),
    deadlineFixture({ id: uuid(1001), name: 'expired-lab', overdue: true, inclusiveEndDate: localDateStr(-2), deadlineAt: endInstant(localDateStr(-2)), dates: { endDate: localDateStr(-2), expiryStoppedAt: future(-1) } }),
  ]
}
export let deadlineRows = initialRows()
export let deadlineRequests: URLSearchParams[] = []
export function resetDeadlineFixtures() { deadlineRows = initialRows(); deadlineRequests = [] }
export function deadlinePage(content: AdminResourceDeadline[], page = 0, size = 20, totalElements = content.length): AdminDeadlinePage {
  return { content, page, size, totalElements, totalPages: Math.ceil(totalElements / size) }
}
export const resourceDeadlineHandlers = [http.get('*/api/v1/admin/resource-deadlines', ({ request }) => {
  const actor = ACCESS_TOKENS[request.headers.get('Authorization')?.replace('Bearer ', '') ?? '']
  if (!actor || !canReadSupportMetadata(actor.role)) return problemResponse({ type: 'about:blank', status: 403, title: '접근 권한이 없습니다', detail: '자원 기한을 조회할 수 없습니다.', code: 'ACCESS_DENIED' })
  const q = new URL(request.url).searchParams
  deadlineRequests.push(new URLSearchParams(q))
  let rows = deadlineRows.filter((row) => (!q.get('orgId') || row.orgId === q.get('orgId'))
    && (!q.get('workspaceId') || row.workspaceId === q.get('workspaceId')) && (!q.get('type') || row.type === q.get('type'))
    && (!q.get('deadlineKind') || row.deadlineKind === q.get('deadlineKind')) && (q.get('expired') !== 'true' || row.overdue))
  if (q.has('expiringInDays')) {
    const cutoff = Date.parse(endInstant(localDateStr(Number(q.get('expiringInDays')))))
    rows = rows.filter((row) => !row.overdue && (row.inclusiveEndDate != null || row.type === 'LLM_API_KEY'
      ? Date.parse(row.deadlineAt) <= cutoff : Date.parse(row.deadlineAt) < cutoff))
  }
  rows.sort((a, b) => (Date.parse(a.deadlineAt) - Date.parse(b.deadlineAt) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id)) * (q.get('sort') === '-deadlineAt' ? -1 : 1))
  const page = Number(q.get('page') ?? 0), size = Number(q.get('size') ?? 20)
  return HttpResponse.json(deadlinePage(rows.slice(page * size, (page + 1) * size), page, size, rows.length))
})]
