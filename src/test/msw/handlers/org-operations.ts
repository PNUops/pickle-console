import { http, HttpResponse, type RequestHandler } from 'msw'
import type { OrgOperations, OrgOperationsMember, SaveOrgOperations, SaveRequestMail, RequestMailTarget, RequestMailTargetOption } from '../../../api/org-operations'
import type { InstitutionPermission } from '../../../auth/institution-authority'
import { hasWork, SYS_ADMIN, SYS_READERS } from '../../../auth/institution-authority'
import { permissionInput, permissionProblem } from '../../../lib/org-operations'
import { isUuid } from '../../../lib/validation'
import { MOCK_WORK_CATALOGUE, AUTHORITY_OVERRIDES, mockAuthorityActor, mockInstitutionAuthority } from '../institution-authority'
import { ACCESS_TOKENS, problemResponse } from './auth'
import { adminUserStore } from './users'
import { orgs } from './reference'
import { workspaceStore } from './workspaces'
import { requestStore } from './requests'

export const orgOperationRevisions: Record<string, number> = {}
export const orgOperationModes: Record<string, 'ALL_APPROVERS' | 'DESIGNATED' | null> = {}
export const orgOperationPermissions: Record<string, InstitutionPermission> = {}
export const orgOperationSaves: { orgId: string; body: SaveOrgOperations }[] = []
export const orgOperationPreviews: { orgId: string; body: SaveOrgOperations }[] = []
export const orgMailSaves: { orgId: string; body: SaveRequestMail }[] = []
export const orgMailPreviews: { orgId: string; body: SaveRequestMail; target: RequestMailTarget | null }[] = []
let sourceRevision = 100
const editedProfiles = new Map<string, (typeof ACCESS_TOKENS)[string]>()
export function resetOrgOperationFixtures() {
  for (const [token, profile] of editedProfiles) ACCESS_TOKENS[token] = profile
  editedProfiles.clear()
  for (const record of [orgOperationRevisions, orgOperationModes, orgOperationPermissions]) for (const key of Object.keys(record)) delete record[key]
  orgOperationSaves.length = 0; orgOperationPreviews.length = 0; orgMailSaves.length = 0; orgMailPreviews.length = 0; sourceRevision = 100
}
export function orgRevisionConflict(orgId: string, revision: unknown) {
  if (revision !== (orgOperationRevisions[orgId] ?? 0)) return problemResponse({ type: 'about:blank', title: '기관 변경을 저장할 수 없습니다', status: 409, code: 'ORG_OPERATIONS_CONFLICT', detail: '기관 명단이 변경됐습니다. 현재 설정을 다시 확인해 주세요.' })
  return null
}
export function advanceOrgRevision(orgId: string) { orgOperationRevisions[orgId] = (orgOperationRevisions[orgId] ?? 0) + 1 }

function permissionFor(id: string, orgId: string): InstitutionPermission | null {
  if (orgOperationPermissions[`${id}:${orgId}`]) return orgOperationPermissions[`${id}:${orgId}`]
  const profile = Object.values(ACCESS_TOKENS).find((candidate) => candidate.id === id)
  return profile ? mockInstitutionAuthority(profile).assignments.find((grant) => grant.institutionId === orgId)?.permission ?? null : null
}
function displayRole(permission: InstitutionPermission): 'ORG_ADMIN' | 'ORG_MANAGER' | 'ORG_VIEWER' {
  return permission.mode === 'FULL' ? 'ORG_ADMIN' : permission.work.some((id) => MOCK_WORK_CATALOGUE.some((work) => work.id === id && work.write)) ? 'ORG_MANAGER' : 'ORG_VIEWER'
}
function hasDecisionWork(permission: InstitutionPermission | null | undefined) {
  return permission != null && (permission.mode === 'FULL' || MOCK_WORK_CATALOGUE.some((work) => work.id.endsWith('.request.decide') && permission.work.includes(work.id)))
}
function decisionEligible(permission: InstitutionPermission | null | undefined, target?: RequestMailTarget | null) {
  if (!permission) return false
  if (permission.mode === 'FULL') return true
  const prefix = target?.requestType === 'LLM_API_KEY' ? 'llm' : target?.requestType.toLowerCase()
  return MOCK_WORK_CATALOGUE.some((work) => work.id.endsWith('.request.decide') && (!prefix || work.id === `${prefix}.request.decide`) && permission.work.includes(work.id) && work.group != null &&
    (permission.scopes[work.group]?.mode === 'ALL' || permission.scopes[work.group]?.workspaceIds.some((id) => target ? id === target.workspaceId : workspaceStore.some((workspace) => workspace.detail.id === id))))
}
export function evaluateOrgOperations(orgId: string, desired?: SaveOrgOperations['members'], mode = orgOperationModes[orgId] ?? null, requesterId?: string | null, target?: RequestMailTarget | null): OrgOperations | null {
  const org = orgs.find((candidate) => candidate.id === orgId)
  if (!org) return null
  const rows = desired ? desired.map((assignment) => {
    const account = adminUserStore.find((candidate) => candidate.id === assignment.userId)!
    const permission: InstitutionPermission = { mode: assignment.permission.mode, work: assignment.permission.work, scopes: assignment.permission.scopes, revision: assignment.permission.expectedRevision }
    return { userId: account.id, name: account.name, email: account.email, status: account.status, role: displayRole(permission), permission, requestMail: assignment.requestMail === true }
  }) : adminUserStore.flatMap((account) => (account.managedOrgs ?? []).filter((grant) => grant.orgId === orgId).map((grant) => {
    const permission = permissionFor(account.id, orgId)
    return { userId: account.id, name: account.name, email: account.email, status: account.status, role: permission ? displayRole(permission) : grant.role, permission, requestMail: grant.requestMail === true }
  }))
  const eligible = (member: typeof rows[number]) => member.status === 'ACTIVE' && member.userId !== requesterId && decisionEligible(member.permission, target)
  const fallback = mode == null && !rows.some((member) => eligible(member) && member.requestMail)
  const members: OrgOperationsMember[] = rows.map((member) => {
    const currentMailRecipient = eligible(member) && (mode === 'ALL_APPROVERS' || (fallback ? member.permission?.mode === 'FULL' : member.requestMail))
    return { ...member, currentMailRecipient, inAppRecipient: eligible(member), selectionReason: currentMailRecipient ? (fallback ? 'LEGACY_ORG_ADMIN' : mode === 'ALL_APPROVERS' ? 'ALL_APPROVERS' : 'DESIGNATED') : null,
      exclusionReason: currentMailRecipient ? null : member.userId === requesterId ? 'REQUESTER_EXCLUDED' : member.status !== 'ACTIVE' ? 'ACCOUNT_INACTIVE' : !decisionEligible(member.permission, target)
        ? !target ? 'PERMISSION_CANNOT_RECEIVE' : member.permission?.work.includes(`${target.requestType === 'LLM_API_KEY' ? 'llm' : target.requestType.toLowerCase()}.request.decide`) ? 'TARGET_SCOPE_EXCLUDED' : 'DECISION_WORK_MISSING' : 'NOT_SELECTED' }
  })
  const targets = new Map<string, RequestMailTargetOption>()
  for (const request of requestStore.filter((row) => row.orgId === orgId)) {
    const workspace = workspaceStore.find((row) => row.detail.id === request.workspaceId)
    if (workspace) targets.set(`${request.type}:${workspace.detail.id}`, { requestType: request.type, workspaceId: workspace.detail.id, workspaceName: workspace.detail.name })
  }
  return { org: { ...org, createdAt: '2026-01-05T09:00:00+09:00' }, revision: orgOperationRevisions[orgId] ?? 0, mailMode: mode, members,
    activeAdminCount: rows.filter((member) => member.status === 'ACTIVE' && member.permission?.mode === 'FULL').length,
    activeApproverCount: rows.filter((member) => member.status === 'ACTIVE' && decisionEligible(member.permission)).length,
    currentMailRecipientCount: members.filter((member) => member.currentMailRecipient).length, legacyFallback: fallback, requesterId, observedAt: '2026-10-19T02:00:00+09:00', selectionContext: target ?? null, selectionTargets: [...targets.values()] }
}
function actorOf(request: Request) {
  const profile = ACCESS_TOKENS[request.headers.get('Authorization')?.replace('Bearer ', '') ?? '']
  return profile ? mockAuthorityActor(profile) : null
}
function has(request: Request, orgId: string, work: string, roles = SYS_ADMIN) { return hasWork(actorOf(request), work, { orgId }, roles) }
function project(request: Request, data: OrgOperations): OrgOperations {
  const staff = has(request, data.org.id, 'institution.staff.read', SYS_READERS)
  const mail = has(request, data.org.id, 'institution.request-mail.read', SYS_READERS) || has(request, data.org.id, 'institution.request-mail.configure', SYS_READERS)
  return { ...data, mailMode: mail ? data.mailMode : null, currentMailRecipientCount: mail ? data.currentMailRecipientCount : null, legacyFallback: mail ? data.legacyFallback : null,
    selectionContext: mail ? data.selectionContext : null, selectionTargets: mail ? data.selectionTargets : null,
    members: data.members.map((member) => ({ ...member, permission: staff ? member.permission : null, requestMail: mail ? member.requestMail : null,
      currentMailRecipient: mail ? member.currentMailRecipient : null, inAppRecipient: mail ? member.inAppRecipient : null, selectionReason: mail ? member.selectionReason : null, exclusionReason: mail ? member.exclusionReason : null })) }
}
const denied = () => problemResponse({ type: 'about:blank', title: '권한 없음', status: 403, code: 'FORBIDDEN' })
const invalid = (detail: string) => problemResponse({ type: 'about:blank', title: '기관 변경을 확인해 주세요', status: 422, code: 'VALIDATION_FAILED', detail })

function targetOf(request: Request, orgId: string): RequestMailTarget | null | Response {
  const query = new URL(request.url).searchParams
  const requestType = query.get('requestType'); const workspaceId = query.get('workspaceId')
  if (requestType == null && workspaceId == null) return null
  if (!requestType || !workspaceId || !['VM', 'LLM_API_KEY', 'DOMAIN', 'GPU'].includes(requestType) || !isUuid(workspaceId)) return invalid('종류와 워크스페이스 ID를 함께 지정하세요.')
  if (!has(request, orgId, 'institution.request-mail.read', SYS_READERS) && !has(request, orgId, 'institution.request-mail.configure', SYS_READERS)) return denied()
  if (!workspaceStore.some((workspace) => workspace.detail.id === workspaceId)) return problemResponse({ status: 404, code: 'RESOURCE_NOT_FOUND', title: '워크스페이스를 찾을 수 없습니다' })
  return { requestType: requestType as RequestMailTarget['requestType'], workspaceId }
}

export const orgOperationHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/orgs/:orgId/operations', ({ request, params }) => {
    const orgId = String(params.orgId)
    if (!['institution.staff.read', 'institution.request-mail.read', 'institution.request-mail.configure'].some((work) => has(request, orgId, work, SYS_READERS))) return denied()
    const target = targetOf(request, orgId)
    if (target instanceof Response) return target
    const value = evaluateOrgOperations(orgId, undefined, undefined, new URL(request.url).searchParams.get('requesterId'), target)
    return value ? HttpResponse.json(project(request, value)) : new HttpResponse(null, { status: 404 })
  }),
  ...(['post', 'put'] as const).map((method) => http[method](`*/api/v1/admin/orgs/:orgId/operations${method === 'post' ? '/preview' : ''}`, async ({ request, params }) => {
    const orgId = String(params.orgId)
    if (!has(request, orgId, 'institution.delegate')) return denied()
    const body = await request.json() as SaveOrgOperations
    const conflict = orgRevisionConflict(orgId, body.expectedRevision)
    if (conflict) return conflict
    const before = evaluateOrgOperations(orgId)
    if (!before) return new HttpResponse(null, { status: 404 })
    const revisions = Object.fromEntries(before.members.map((member) => [member.userId, member.permission?.revision]))
    if (JSON.stringify(Object.entries(revisions).sort()) !== JSON.stringify(Object.entries(body.expectedPermissionRevisions ?? {}).sort())) return orgRevisionConflict(orgId, -1)!
    const actor = actorOf(request)!
    for (const member of body.members) {
      const account = adminUserStore.find((candidate) => candidate.id === member.userId)
      if (!account || account.role.startsWith('SYS_')) return denied()
      if (permissionProblem(member.permission, MOCK_WORK_CATALOGUE)) return invalid('업무와 그룹 범위를 확인하세요.')
      const old = before.members.find((row) => row.userId === member.userId)
      if (member.permission.expectedRevision !== (old?.permission?.revision ?? 0)) return orgRevisionConflict(orgId, -1)!
      if (!actor.role.startsWith('SYS_') && member.userId === actor.id && JSON.stringify({ ...member.permission, expectedRevision: 0 }) !== JSON.stringify({ mode: old?.permission?.mode, work: old?.permission?.work, scopes: old?.permission?.scopes, expectedRevision: 0 })) return denied()
      if (member.requestMail && !hasDecisionWork({ ...member.permission, revision: member.permission.expectedRevision })) return invalid('신청 결정 업무를 확인하세요.')
    }
    if (!actor.role.startsWith('SYS_') && before.members.some((member) => member.userId === actor.id) && !body.members.some((member) => member.userId === actor.id)) return denied()
    const after = evaluateOrgOperations(orgId, body.members, body.mailMode ?? null)!
    after.revision += 1
    const vacancy = before.activeAdminCount > 0 && after.activeAdminCount === 0 || before.activeApproverCount > 0 && after.activeApproverCount === 0
    const warnings: string[] = after.currentMailRecipientCount === 0 ? ['신청 메일을 받을 기관 수신자가 0명입니다.'] : []
    if (vacancy) warnings.push('마지막 활성 FULL 담당자 또는 실제 신청 결정 담당자가 없어집니다.')
    for (const member of before.members) if (member.permission?.mode === 'FULL' && !after.members.some((row) => row.userId === member.userId && row.permission?.mode === 'FULL')) {
      const profile = Object.values(ACCESS_TOKENS).find((candidate) => candidate.id === member.userId)
      const other = profile && mockInstitutionAuthority(profile).assignments.some((grant) => grant.institutionId !== orgId && grant.permission.mode === 'FULL')
      warnings.push(`${member.name}: ${other ? '다른 FULL 출처의 전역 개별 키 비용 읽기는 유지됩니다.' : '마지막 FULL 출처가 사라져 전역 개별 키 비용 읽기도 없어집니다.'}`)
    }
    if (method === 'post') { orgOperationPreviews.push({ orgId, body }); return HttpResponse.json({ before, after, createsStaffVacancy: vacancy, warnings }) }
    if (vacancy && !(actor.role === 'SYS_ADMIN' && body.allowVacancy && body.confirmedOrgId === orgId && body.reason?.trim())) return invalid('담당 공백 예외 확인이 필요합니다.')
    orgOperationSaves.push({ orgId, body })
    for (const account of adminUserStore) {
      const member = body.members.find((candidate) => candidate.userId === account.id)
      const previous = before.members.find((candidate) => candidate.userId === account.id)?.permission
      const profiles = Object.entries(ACCESS_TOKENS).filter(([, profile]) => profile.id === account.id)
      const previousAuthority = profiles[0] ? mockInstitutionAuthority({ ...profiles[0][1], managedOrgs: account.managedOrgs ?? [] }) : null
      account.managedOrgs = (account.managedOrgs ?? []).filter((grant) => grant.orgId !== orgId)
      if (member) {
        const content = { mode: member.permission.mode, work: member.permission.work, scopes: member.permission.scopes }
        const same = previous && JSON.stringify(content) === JSON.stringify({ mode: previous.mode, work: previous.work, scopes: previous.scopes })
        const permission = { ...content, revision: same ? previous.revision : ++sourceRevision }
        orgOperationPermissions[`${account.id}:${orgId}`] = permission
        account.managedOrgs.push({ orgId, orgName: before.org.name, role: displayRole(permission), requestMail: member.requestMail === true })
      } else delete orgOperationPermissions[`${account.id}:${orgId}`]
      if ((member || previous) && !account.role.startsWith('SYS_') && previousAuthority) {
        const grants = previousAuthority.assignments.filter((grant) => grant.institutionId !== orgId)
        if (member) grants.push({ institutionId: orgId, institutionName: before.org.name, permission: orgOperationPermissions[`${account.id}:${orgId}`] })
        grants.sort((a, b) => a.institutionId.localeCompare(b.institutionId))
        account.role = grants.some((grant) => grant.permission.mode === 'FULL') ? 'ORG_ADMIN' : grants.some((grant) => displayRole(grant.permission) === 'ORG_MANAGER') ? 'ORG_MANAGER' : grants.length ? 'ORG_VIEWER' : 'USER'
        const same = JSON.stringify(grants) === JSON.stringify(previousAuthority.assignments)
        const authority = { ...previousAuthority, state: grants.length ? 'VALID_SOURCES' as const : 'VALID_EMPTY' as const,
          accountRole: account.role, assignments: grants, catalogue: grants.length ? MOCK_WORK_CATALOGUE : [],
          authorityFingerprint: same ? previousAuthority.authorityFingerprint : JSON.stringify(grants) }
        AUTHORITY_OVERRIDES[account.id] = authority
        for (const [token, profile] of profiles) {
          if (!editedProfiles.has(token)) editedProfiles.set(token, profile)
          ACCESS_TOKENS[token] = { ...profile, role: account.role, managedOrgs: account.managedOrgs }
        }
      }
    }
    orgOperationModes[orgId] = body.mailMode ?? null; advanceOrgRevision(orgId)
    return HttpResponse.json(project(request, evaluateOrgOperations(orgId)!))
  })),
  ...(['post', 'put'] as const).map((method) => http[method](`*/api/v1/admin/orgs/:orgId/operations/request-mail${method === 'post' ? '/preview' : ''}`, async ({ request, params }) => {
    const orgId = String(params.orgId)
    if (!has(request, orgId, 'institution.request-mail.configure')) return denied()
    const target = method === 'post' ? targetOf(request, orgId) : null
    if (target instanceof Response) return target
    const body = await request.json() as SaveRequestMail
    if ('members' in body || 'permission' in body || 'expectedPermissionRevisions' in body) return invalid('메일 저장에는 권한 필드를 보내지 마세요.')
    const conflict = orgRevisionConflict(orgId, body.expectedRevision)
    if (conflict) return conflict
    const before = evaluateOrgOperations(orgId, undefined, undefined, undefined, target)
    if (!before) return new HttpResponse(null, { status: 404 })
    if (!['ALL_APPROVERS', 'DESIGNATED'].includes(body.mailMode)) return invalid('수신 방식을 확인하세요.')
    if (body.recipientIds.some((id) => !before.members.some((member) => member.userId === id))) return invalid('기관 담당자만 선택하세요.')
    if (body.recipientIds.some((id) => !hasDecisionWork(before.members.find((member) => member.userId === id)?.permission))) return invalid('신청 결정 업무가 있는 담당자만 선택하세요.')
    if (before.members.some((member) => !member.permission)) return invalid('현재 기관 권한 상태를 확인하세요.')
    const after = evaluateOrgOperations(orgId, before.members.map((member) => ({ userId: member.userId, permission: permissionInput(member.permission!), requestMail: body.recipientIds.includes(member.userId) })), body.mailMode, undefined, target)!
    after.revision = before.revision + 1
    const warnings = after.currentMailRecipientCount === 0 ? ['신청 메일을 받을 기관 수신자가 0명입니다.'] : []
    if (method === 'post') { orgMailPreviews.push({ orgId, body, target }); return HttpResponse.json({ before: project(request, before), after: project(request, after), createsStaffVacancy: false, warnings }) }
    orgMailSaves.push({ orgId, body })
    for (const account of adminUserStore) for (const grant of account.managedOrgs ?? []) if (grant.orgId === orgId) grant.requestMail = body.recipientIds.includes(account.id)
    orgOperationModes[orgId] = body.mailMode; advanceOrgRevision(orgId)
    return HttpResponse.json(project(request, evaluateOrgOperations(orgId)!))
  })),
]
