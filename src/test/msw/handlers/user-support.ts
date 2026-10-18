import { http, HttpResponse, type RequestHandler } from 'msw'
import { isSysTier } from '../../../auth/permissions'
import { type AdminProfileUpdate, type ProfileImpact, type UserResourceAccess, type UserSupport } from '../../../api/admin-user-support'
import { ACCESS_TOKENS, problemResponse } from './auth'
import { adminProfilePatches, adminUserStore } from './users'
import { uuid } from '../ids'
import { mockAuthorityActor, MOCK_WORK_CATALOGUE } from '../institution-authority'
import { hasAnyWork, hasWork, workSources, SYS_ADMIN, SYS_READERS, type AuthorityActor } from '../../../auth/institution-authority'
import { resourceWorkPrefix } from '../../../auth/request-authority'
import type { StoredFacts } from '../facts'

const missing = () => problemResponse({ type: 'about:blank', title: '대상을 찾을 수 없습니다', status: 404, detail: '대상이 없거나 현재 관리 범위에서 조회할 수 없습니다.', code: 'RESOURCE_NOT_FOUND' })
const forbidden = () => problemResponse({ type: 'about:blank', title: '접근 권한이 없습니다', status: 403, detail: '이 작업을 수행할 권한이 없습니다.', code: 'ACCESS_DENIED' })

function actorOf(request: Request) { const profile = ACCESS_TOKENS[request.headers.get('Authorization')?.replace('Bearer ', '') ?? '']; return profile ? mockAuthorityActor(profile) : null }

function readUser(request: Request, userId: string) {
  const actor = actorOf(request)
  const user = adminUserStore.find((row) => row.id === userId)
  return actor && hasAnyWork(actor, ['student.lookup', 'student.support.read', 'student.profile.correct'], SYS_READERS) && user && (isSysTier(actor.role) || !isSysTier(user.role)) ? user : null
}

export function supportFixture(userId: string, orgId?: string, role = 'SYS_ADMIN'): StoredFacts<UserSupport, 'memberships' | 'invitations' | 'requests' | 'resources'> {
  const user = adminUserStore.find((row) => row.id === userId)!
  const joined = user.status === 'ACTIVE' && user.studentNo === '202054321'
    || adminProfilePatches.some((patch) => patch.userId === userId && patch.body.studentNo === '202054321')
  const inOrg = orgId == null || orgId === uuid(1)
  const connected = userId === uuid(42) && inOrg
  const pendingRecipientVisible = role !== 'USER'
  const resource: UserResourceAccess = {
    type: 'VM', id: uuid(100), name: 'research-vm', status: joined ? 'CREATING' : 'RUNNING', orgId: uuid(1), orgName: '정보컴퓨터공학부 실습지원센터',
    workspaceId: uuid(11), workspaceName: '연구팀', requestId: uuid(201), userStatus: user.status, workspaceRole: 'MEMBER', personalGrantRole: null,
    workspaceGrantRole: 'MEMBER', effectiveRole: 'MEMBER', standingRights: false, baseConditionsSatisfied: user.status === 'ACTIVE', canRevoke: false,
    revokeReason: 'NO_PERSONAL_GRANT', reasons: user.status === 'ACTIVE' ? joined ? ['RESOURCE_NOT_READY'] : [] : ['ACCOUNT_INACTIVE'],
  }
  return {
    userId, observedAt: '2026-10-04T01:00:00Z', relationshipsLimited: false,
    memberships: user.memberships.map((row) => ({ ...row, resourceCounts: connected && row.workspaceId === uuid(11) ? [{ type: 'VM', count: 1 }] : [] })),
    invitationsVisible: role !== 'USER',
    invitations: connected && role !== 'USER' ? [{ id: uuid(501), workspaceId: uuid(11), workspaceName: '연구팀', workspaceKind: 'LAB', role: 'MEMBER', status: joined ? 'ACCEPTED' : 'PENDING', matchedBy: joined ? 'ACCEPTED' : 'EMAIL', acceptedAt: joined ? '2026-10-04T01:00:00Z' : null }] : [],
    requests: connected ? [{ id: uuid(201), type: 'VM', status: 'APPROVED', workspaceId: uuid(11), workspaceName: '연구팀', orgId: uuid(1), orgName: '정보컴퓨터공학부 실습지원센터', applicant: false, recipientId: joined || pendingRecipientVisible ? uuid(601) : null, recipientStatus: joined ? 'CREATED' : pendingRecipientVisible ? 'PENDING_JOIN' : null, resourceId: joined ? uuid(100) : null, grantedEndDate: '2026-12-31', reason: null }] : [],
    resources: connected ? [resource] : [],
  }
}

function hasResource(actor: AuthorityActor, type: Parameters<typeof resourceWorkPrefix>[0], branch: 'metadata' | 'acl' | 'request', orgId: string, workspaceId: string) {
  const prefix = resourceWorkPrefix(type)
  const ids = branch === 'metadata' ? [`${prefix}.metadata.read`, `${prefix}.metadata.support.read`]
    : branch === 'acl' ? [`${prefix}.acl.support.read`, `${prefix}.acl.support.manage`]
      : [`${prefix}.request.read`, `${prefix}.request.support.read`]
  return ids.some((id) => hasWork(actor, id, { orgId, workspaceId }, id.endsWith('.manage') ? SYS_ADMIN : SYS_READERS))
}

function projectSupport(actor: AuthorityActor, data: ReturnType<typeof supportFixture>): UserSupport {
  const workspace = hasAnyWork(actor, ['workspace.support.read'], SYS_READERS)
  const kinds = ['vm', 'llm', 'domain', 'gpu']
  const resourceWork = kinds.flatMap((kind) => [`${kind}.metadata.read`, `${kind}.metadata.support.read`, `${kind}.acl.support.read`, `${kind}.acl.support.manage`])
  const requestWork = kinds.flatMap((kind) => [`${kind}.request.read`, `${kind}.request.support.read`])
  const all = (id: string) => {
    const group = MOCK_WORK_CATALOGUE.find((work) => work.id === id)?.group
    return actor.role.startsWith('SYS_') || workSources(actor, id).some((source) => source.permission.mode === 'FULL' || !!group && source.permission.scopes[group]?.mode === 'ALL')
  }
  return { ...data, relationshipsLimited: !all('workspace.support.read') || kinds.some((kind) => !all(`${kind}.metadata.support.read`) || !all(`${kind}.request.support.read`) || !all(`${kind}.acl.support.read`)),
    memberships: workspace ? data.memberships.filter((row) => hasWork(actor, 'workspace.support.read', { workspaceId: row.workspaceId }, SYS_READERS))
      .map((row) => ({ ...row, resourceCounts: row.resourceCounts.map((count) => ({ ...count, count: all(`${resourceWorkPrefix(count.type)}.metadata.support.read`) ? count.count : null })) })) : null,
    invitationsVisible: workspace,
    invitations: workspace ? data.invitations.filter((row) => hasWork(actor, 'workspace.support.read', { workspaceId: row.workspaceId }, SYS_READERS)) : null,
    requests: hasAnyWork(actor, requestWork, SYS_READERS) ? data.requests.filter((row) => hasResource(actor, row.type, 'request', row.orgId, row.workspaceId)) : null,
    resources: hasAnyWork(actor, resourceWork, SYS_READERS) ? data.resources.filter((row) => hasResource(actor, row.type, 'metadata', row.orgId, row.workspaceId)
      || hasResource(actor, row.type, 'acl', row.orgId, row.workspaceId)).map((row) => {
        const prefix = resourceWorkPrefix(row.type)
        if (!hasResource(actor, row.type, 'acl', row.orgId, row.workspaceId)) return { ...row, workspaceRole: null, personalGrantRole: null,
          workspaceGrantRole: null, effectiveRole: null, standingRights: null, baseConditionsSatisfied: null, canRevoke: null, revokeReason: null, reasons: null,
          requestId: hasResource(actor, row.type, 'request', row.orgId, row.workspaceId) ? row.requestId : null }
        return { ...row, canRevoke: row.personalGrantRole != null && hasWork(actor, `${prefix}.acl.support.manage`, { orgId: row.orgId, workspaceId: row.workspaceId }, SYS_ADMIN) }
      }) : null,
  }
}

export const userSupportHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/users/:userId/support', ({ request, params }) => {
    const user = readUser(request, String(params.userId))
    if (!user) return missing()
    const actor = actorOf(request)!
    if (!hasWork(actor, 'student.support.read', {}, SYS_READERS)) return forbidden()
    const rawOrg = new URL(request.url).searchParams.get('orgId') ?? undefined
    const orgId = rawOrg
    return HttpResponse.json(projectSupport(actor, supportFixture(user.id, orgId, actor.role)))
  }),
  http.get('*/api/v1/admin/users/:userId/support/access', ({ request, params }) => {
    const actor = actorOf(request)
    const user = adminUserStore.find((row) => row.id === String(params.userId))
    if (!actor || !user) return missing()
    const url = new URL(request.url)
    const rawOrg = url.searchParams.get('orgId') ?? undefined
    const resource = supportFixture(user.id, rawOrg, actor.role).resources.find((row) => row.id === url.searchParams.get('resourceId') && row.type === url.searchParams.get('type'))
    if (!resource || !hasResource(actor, resource.type, 'acl', resource.orgId, resource.workspaceId)) return missing()
    return HttpResponse.json({ ...resource, canRevoke: resource.personalGrantRole != null && hasWork(actor, `${resourceWorkPrefix(resource.type)}.acl.support.manage`, { orgId: resource.orgId, workspaceId: resource.workspaceId }, SYS_ADMIN) })
  }),
  http.post('*/api/v1/admin/users/:userId/profile-impact', async ({ request, params }) => {
    const actor = actorOf(request)
    if (!actor) return forbidden()
    const user = readUser(request, String(params.userId))
    if (!user) return missing()
    const body = await request.json() as { action: 'PROFILE' | 'ENABLE'; profile?: AdminProfileUpdate }
    if (body.action === 'ENABLE' ? actor.role !== 'SYS_ADMIN' : !hasWork(actor, 'student.profile.correct', {}, SYS_ADMIN) || !actor.role.startsWith('SYS_') && isSysTier(user.role)) return forbidden()
    const profile = body.profile ?? {}
    const candidate = { ...user, ...profile }
    if (profile.departmentOther && profile.departmentCode && profile.departmentCode !== 'OTHER') return problemResponse({ type: 'about:blank', title: '입력값이 올바르지 않습니다', status: 422, detail: '소속은 한 가지 방식으로만 보낼 수 있습니다.', code: 'VALIDATION_FAILED', errors: [{ field: 'departmentOther', message: '목록에서 고른 소속과 직접 입력한 소속 중 하나만 보낼 수 있습니다.' }] })
    if ((candidate.position === 'STUDENT_UNDERGRAD' || candidate.position === 'STUDENT_GRADUATE') && !candidate.studentNo) return problemResponse({ type: 'about:blank', title: '입력값이 올바르지 않습니다', status: 422, detail: '학번을 입력해 주세요.', code: 'VALIDATION_FAILED', errors: [{ field: 'studentNo', message: '학번을 입력해 주세요.' }] })
    const candidateStatus = body.action === 'ENABLE' ? user.statusChanges.find((change) => change.toStatus === 'DISABLED')?.fromStatus ?? 'ACTIVE' : user.status
    const studentNoWillChange = body.action === 'PROFILE' && candidate.studentNo !== user.studentNo
    const claimsPossible = candidateStatus === 'ACTIVE' && (body.action === 'ENABLE' || studentNoWillChange && !!candidate.studentNo)
    const impact: ProfileImpact = {
      actorAccessImpact: { fingerprint: 'fixture-profile-impact', increases: [], pendingResourceOwners: [] },
      action: body.action, userId: user.id, observedAt: '2026-10-04T01:00:00Z', candidateStatus, claimsPossible, studentNoWillChange,
      invitations: claimsPossible && user.id === uuid(42) ? [{ id: uuid(501), workspaceId: uuid(11), workspaceName: '연구팀', workspaceKind: 'LAB', role: 'MEMBER', status: 'PENDING', matchedBy: 'STUDENT_NO', acceptedAt: null, alreadyMember: true, recipients: [{ requestId: uuid(201), orgId: uuid(1), type: 'VM', requestStatus: 'APPROVED', status: 'PENDING_JOIN', projectedStatus: 'QUEUED', grantedEndDate: '2026-12-31' }] }] : [],
    }
    return HttpResponse.json(impact)
  }),
]
