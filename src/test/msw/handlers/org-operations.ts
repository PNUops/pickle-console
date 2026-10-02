import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { ACCESS_TOKENS, problemResponse } from './auth'
import { adminUserStore } from './users'
import { orgs } from './reference'

type Schemas = components['schemas']
export const orgOperationRevisions: Record<string, number> = {}
export const orgOperationModes: Record<string, Schemas['RequestMailMode'] | null> = {}
export const orgOperationSaves: { orgId: string; body: Schemas['SaveOrgOperationsRequest'] }[] = []
export function resetOrgOperationFixtures() {
  for (const key of Object.keys(orgOperationRevisions)) delete orgOperationRevisions[key]
  for (const key of Object.keys(orgOperationModes)) delete orgOperationModes[key]
  orgOperationSaves.length = 0
}
export function orgRevisionConflict(orgId: string, revision: unknown) {
  if (revision !== (orgOperationRevisions[orgId] ?? 0)) return problemResponse({ type: 'about:blank', title: '기관 변경을 저장할 수 없습니다', status: 409, code: 'ORG_OPERATIONS_CONFLICT', detail: '기관 명단이 변경됐습니다. 현재 설정을 다시 확인해 주세요.' })
  return null
}
export function advanceOrgRevision(orgId: string) {
  orgOperationRevisions[orgId] = (orgOperationRevisions[orgId] ?? 0) + 1
}

function evaluate(orgId: string, assignments?: Schemas['Assignment'][], mode = orgOperationModes[orgId] ?? null, requesterId?: string | null): Schemas['AdminOrgOperationsResponse'] | null {
  const org = orgs.find((row) => row.id === orgId)
  if (!org) return null
  const members = assignments ? assignments.map((assignment) => {
    const account = adminUserStore.find((row) => row.id === assignment.userId)!
    return { userId: account.id, name: account.name, email: account.email, role: assignment.role, status: account.status, requestMail: !!assignment.requestMail }
  }) : adminUserStore.flatMap((account) => account.managedOrgs.filter((role) => role.orgId === orgId).map((role) => ({ userId: account.id, name: account.name, email: account.email, role: role.role, status: account.status, requestMail: role.requestMail })))
  const eligible = (row: typeof members[number]) => row.status === 'ACTIVE' && (row.role === 'ORG_ADMIN' || row.role === 'ORG_MANAGER') && row.userId !== requesterId
  const fallback = mode == null && !members.some((row) => eligible(row) && row.requestMail)
  const result = members.map((row) => {
    const currentMailRecipient = eligible(row) && (mode === 'ALL_APPROVERS' || (fallback ? row.role === 'ORG_ADMIN' : row.requestMail))
    return { ...row, currentMailRecipient, inAppRecipient: eligible(row), selectionReason: currentMailRecipient ? (fallback ? 'LEGACY_ORG_ADMIN' : mode === 'ALL_APPROVERS' ? 'ALL_APPROVERS' : 'DESIGNATED') : null,
      exclusionReason: currentMailRecipient ? null : row.userId === requesterId ? 'REQUESTER_EXCLUDED' : row.status !== 'ACTIVE' ? 'ACCOUNT_INACTIVE' : row.role === 'ORG_VIEWER' ? 'ROLE_CANNOT_RECEIVE' : 'NOT_SELECTED' }
  })
  return { org: { ...org, createdAt: '2026-01-05T09:00:00+09:00' }, revision: orgOperationRevisions[orgId] ?? 0, mailMode: mode,
    members: result, activeAdminCount: result.filter((row) => row.status === 'ACTIVE' && row.role === 'ORG_ADMIN').length,
    activeApproverCount: result.filter((row) => row.status === 'ACTIVE' && row.role !== 'ORG_VIEWER').length,
    currentMailRecipientCount: result.filter((row) => row.currentMailRecipient).length, legacyFallback: fallback, requesterId, observedAt: '2026-10-03T12:00:00+09:00' }
}

function access(request: Request, orgId: string, write = false) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const actor = ACCESS_TOKENS[token]
  if (!actor || actor.role === 'USER' || (write && actor.role !== 'SYS_ADMIN' && actor.role !== 'ORG_ADMIN')) return problemResponse({ type: 'about:blank', title: '권한 없음', status: 403, code: 'FORBIDDEN' })
  if (!actor.role.startsWith('SYS_') && !actor.managedOrgs.some((org) => org.orgId === orgId && (!write || org.role === 'ORG_ADMIN'))) return problemResponse({ type: 'about:blank', title: '기관 없음', status: 404, code: 'NOT_FOUND' })
  return null
}

export const orgOperationHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/orgs/:orgId/operations', ({ request, params }) => {
    const orgId = String(params.orgId)
    const denied = access(request, orgId)
    if (denied) return denied
    const data = evaluate(orgId, undefined, undefined, new URL(request.url).searchParams.get('requesterId'))
    return data ? HttpResponse.json(data) : new HttpResponse(null, { status: 404 })
  }),
  ...(['post', 'put'] as const).map((method) => http[method](`*/api/v1/admin/orgs/:orgId/operations${method === 'post' ? '/preview' : ''}`, async ({ request, params }) => {
    const orgId = String(params.orgId)
    const denied = access(request, orgId, true)
    if (denied) return denied
    const body = await request.json() as Schemas['SaveOrgOperationsRequest']
    const conflict = orgRevisionConflict(orgId, body.expectedRevision)
    if (conflict) return conflict
    const before = evaluate(orgId)!
    const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const actor = ACCESS_TOKENS[token]
    if (actor.role !== 'SYS_ADMIN' && before.members.find((row) => row.userId === actor.id)?.role !== body.members.find((row) => row.userId === actor.id)?.role) return problemResponse({ type: 'about:blank', title: '자신의 기관 역할은 변경할 수 없습니다', status: 403, code: 'ACCESS_DENIED' })
    if (body.members.some((member) => adminUserStore.find((account) => account.id === member.userId)?.role.startsWith('SYS_'))) return problemResponse({ type: 'about:blank', title: '시스템 계정의 기관 역할은 변경할 수 없습니다', status: 403, code: 'ACCESS_DENIED' })
    const after = evaluate(orgId, body.members, body.mailMode ?? null)!
    after.revision += 1
    const vacancy = (before.activeAdminCount > 0 && after.activeAdminCount === 0) || (before.activeApproverCount > 0 && after.activeApproverCount === 0)
    const warnings = after.currentMailRecipientCount === 0 ? ['신청 메일을 받을 기관 수신자가 0명입니다.'] : []
    if (vacancy) warnings.push('마지막 활성 기관 관리자 또는 승인자가 없어집니다.')
    if (method === 'post') return HttpResponse.json({ before, after, createsStaffVacancy: vacancy, warnings })
    if (vacancy && !(body.allowVacancy && body.confirmedOrgId === orgId && body.reason?.trim() && actor.role === 'SYS_ADMIN')) return problemResponse({ type: 'about:blank', title: '기관 담당 공백', status: 422, code: 'VALIDATION_FAILED' })
    orgOperationSaves.push({ orgId, body })
    for (const account of adminUserStore) {
      const assignment = body.members.find((row) => row.userId === account.id)
      account.managedOrgs = account.managedOrgs.filter((org) => org.orgId !== orgId)
      if (assignment) account.managedOrgs.push({ orgId, orgName: before.org.name, role: assignment.role, requestMail: !!assignment.requestMail })
      if (!account.role.startsWith('SYS_')) account.role = account.managedOrgs.some((org) => org.role === 'ORG_ADMIN') ? 'ORG_ADMIN' : account.managedOrgs.some((org) => org.role === 'ORG_MANAGER') ? 'ORG_MANAGER' : account.managedOrgs.length ? 'ORG_VIEWER' : 'USER'
    }
    orgOperationModes[orgId] = body.mailMode ?? null
    advanceOrgRevision(orgId)
    return HttpResponse.json(evaluate(orgId))
  })),
]
