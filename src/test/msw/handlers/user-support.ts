import { http, HttpResponse, type RequestHandler } from 'msw'
import { isSysTier } from '../../../auth/permissions'
import { supportsInvitationRead, type AdminProfileUpdate, type ProfileImpact, type UserResourceAccess, type UserSupport } from '../../../api/admin-user-support'
import { ACCESS_TOKENS, problemResponse } from './auth'
import { adminProfilePatches, adminUserStore } from './users'
import { uuid } from '../ids'

const missing = () => problemResponse({ type: 'about:blank', title: '대상을 찾을 수 없습니다', status: 404, detail: '대상이 없거나 현재 관리 범위에서 조회할 수 없습니다.', code: 'RESOURCE_NOT_FOUND' })
const forbidden = () => problemResponse({ type: 'about:blank', title: '접근 권한이 없습니다', status: 403, detail: '이 작업을 수행할 권한이 없습니다.', code: 'ACCESS_DENIED' })

function actorOf(request: Request) { return ACCESS_TOKENS[request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''] }

function readUser(request: Request, userId: string) {
  const actor = actorOf(request)
  const user = adminUserStore.find((row) => row.id === userId)
  return actor && actor.role !== 'USER' && user && (isSysTier(actor.role) || !isSysTier(user.role)) ? user : null
}

export function supportFixture(userId: string, orgId?: string, role = 'SYS_ADMIN'): UserSupport {
  const user = adminUserStore.find((row) => row.id === userId)!
  const joined = user.status === 'ACTIVE' && user.studentNo === '202054321'
    || adminProfilePatches.some((patch) => patch.userId === userId && patch.body.studentNo === '202054321')
  const inOrg = orgId == null || orgId === uuid(1)
  const connected = userId === uuid(42) && inOrg
  const pendingRecipientVisible = supportsInvitationRead(role as typeof user.role)
  const resource: UserResourceAccess = {
    type: 'VM', id: uuid(100), name: 'research-vm', status: joined ? 'CREATING' : 'RUNNING', orgId: uuid(1), orgName: '정보컴퓨터공학부 실습지원센터',
    workspaceId: uuid(11), workspaceName: '연구팀', requestId: uuid(201), userStatus: user.status, workspaceRole: 'MEMBER', personalGrantRole: null,
    workspaceGrantRole: 'MEMBER', effectiveRole: 'MEMBER', standingRights: false, baseConditionsSatisfied: user.status === 'ACTIVE', canRevoke: false,
    revokeReason: 'NO_PERSONAL_GRANT', reasons: user.status === 'ACTIVE' ? joined ? ['RESOURCE_NOT_READY'] : [] : ['ACCOUNT_INACTIVE'],
  }
  return {
    userId, observedAt: '2026-10-04T01:00:00Z',
    memberships: user.memberships.map((row) => ({ ...row, resourceCounts: connected && row.workspaceId === uuid(11) ? [{ type: 'VM', count: 1 }] : [] })),
    invitationsVisible: supportsInvitationRead(role as typeof user.role),
    invitations: connected && supportsInvitationRead(role as typeof user.role) ? [{ id: uuid(501), workspaceId: uuid(11), workspaceName: '연구팀', workspaceKind: 'LAB', role: 'MEMBER', status: joined ? 'ACCEPTED' : 'PENDING', matchedBy: joined ? 'ACCEPTED' : 'EMAIL', acceptedAt: joined ? '2026-10-04T01:00:00Z' : null }] : [],
    requests: connected ? [{ id: uuid(201), type: 'VM', status: 'APPROVED', workspaceId: uuid(11), workspaceName: '연구팀', orgId: uuid(1), orgName: '정보컴퓨터공학부 실습지원센터', applicant: false, recipientId: joined || pendingRecipientVisible ? uuid(601) : null, recipientStatus: joined ? 'CREATED' : pendingRecipientVisible ? 'PENDING_JOIN' : null, resourceId: joined ? uuid(100) : null, grantedEndDate: '2026-12-31', reason: null }] : [],
    resources: connected ? [resource] : [],
  }
}

export const userSupportHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/users/:userId/support', ({ request, params }) => {
    const user = readUser(request, String(params.userId))
    if (!user) return missing()
    const actor = actorOf(request)!
    const rawOrg = new URL(request.url).searchParams.get('orgId') ?? undefined
    if (!isSysTier(actor.role) && rawOrg && !actor.managedOrgs.some((org) => org.orgId === rawOrg)) return missing()
    const orgId = rawOrg ?? (isSysTier(actor.role) ? undefined : actor.managedOrgs[0]?.orgId)
    return HttpResponse.json(supportFixture(user.id, orgId, actor.role))
  }),
  http.get('*/api/v1/admin/users/:userId/support/access', ({ request, params }) => {
    const user = readUser(request, String(params.userId))
    if (!user) return missing()
    const actor = actorOf(request)!
    const url = new URL(request.url)
    const rawOrg = url.searchParams.get('orgId') ?? undefined
    if (!isSysTier(actor.role) && rawOrg && !actor.managedOrgs.some((org) => org.orgId === rawOrg)) return missing()
    const resource = supportFixture(user.id, rawOrg ?? (isSysTier(actor.role) ? undefined : actor.managedOrgs[0]?.orgId), actor.role).resources.find((row) => row.id === url.searchParams.get('resourceId') && row.type === url.searchParams.get('type'))
    return resource ? HttpResponse.json(resource) : missing()
  }),
  http.post('*/api/v1/admin/users/:userId/profile-impact', async ({ request, params }) => {
    const actor = actorOf(request)
    if (!actor || actor.role !== 'SYS_ADMIN') return forbidden()
    const user = readUser(request, String(params.userId))
    if (!user) return missing()
    const body = await request.json() as { action: 'PROFILE' | 'ENABLE'; profile?: AdminProfileUpdate }
    const profile = body.profile ?? {}
    const candidate = { ...user, ...profile }
    if (profile.departmentOther && profile.departmentCode && profile.departmentCode !== 'OTHER') return problemResponse({ type: 'about:blank', title: '입력값이 올바르지 않습니다', status: 422, detail: '소속은 한 가지 방식으로만 보낼 수 있습니다.', code: 'VALIDATION_FAILED', errors: [{ field: 'departmentOther', message: '목록에서 고른 소속과 직접 입력한 소속 중 하나만 보낼 수 있습니다.' }] })
    if ((candidate.position === 'STUDENT_UNDERGRAD' || candidate.position === 'STUDENT_GRADUATE') && !candidate.studentNo) return problemResponse({ type: 'about:blank', title: '입력값이 올바르지 않습니다', status: 422, detail: '학번을 입력해 주세요.', code: 'VALIDATION_FAILED', errors: [{ field: 'studentNo', message: '학번을 입력해 주세요.' }] })
    const candidateStatus = body.action === 'ENABLE' ? user.statusChanges.find((change) => change.toStatus === 'DISABLED')?.fromStatus ?? 'ACTIVE' : user.status
    const studentNoWillChange = body.action === 'PROFILE' && candidate.studentNo !== user.studentNo
    const claimsPossible = candidateStatus === 'ACTIVE' && (body.action === 'ENABLE' || studentNoWillChange && !!candidate.studentNo)
    const impact: ProfileImpact = {
      action: body.action, userId: user.id, observedAt: '2026-10-04T01:00:00Z', candidateStatus, claimsPossible, studentNoWillChange,
      invitations: claimsPossible && user.id === uuid(42) ? [{ id: uuid(501), workspaceId: uuid(11), workspaceName: '연구팀', workspaceKind: 'LAB', role: 'MEMBER', status: 'PENDING', matchedBy: 'STUDENT_NO', acceptedAt: null, alreadyMember: true, recipients: [{ requestId: uuid(201), orgId: uuid(1), type: 'VM', requestStatus: 'APPROVED', status: 'PENDING_JOIN', projectedStatus: 'QUEUED', grantedEndDate: '2026-12-31' }] }] : [],
    }
    return HttpResponse.json(impact)
  }),
]
