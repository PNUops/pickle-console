import { isSysTier } from '../../../auth/permissions'
import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { ACCESS_TOKENS, problemResponse } from './auth'
import { uuid } from '../ids'
import { mockAuthorityActor } from '../institution-authority'
import { canQueryWork, hasAnyWork, hasWork, workSources, SYS_ADMIN, SYS_READERS, type AuthorityActor } from '../../../auth/institution-authority'
import { advanceOrgRevision, orgRevisionConflict } from './org-operations'

type Schemas = components['schemas']
type UserAdminDetail = Schemas['UserAdminDetailResponse']

/**
 * Admin-user fixture. Reads are global for every admin tier (contract v0.46.0);
 * {@code visibleToOrg} models derived membership so the ordinary {@code orgId}
 * filter can narrow to an org's administrators plus its derived members.
 */
interface AdminUserRecord extends Omit<UserAdminDetail, 'statusChanges' | 'supportCapabilities' | 'managedOrgs' | 'memberships' | 'mfaEnabled' | 'activeVmCount' | 'createdAt'> {
  managedOrgs: NonNullable<UserAdminDetail['managedOrgs']>
  memberships: (Omit<NonNullable<UserAdminDetail['memberships']>[number], 'vmOrgIds'> & { vmOrgIds: string[] })[]
  mfaEnabled: boolean
  activeVmCount: number
  createdAt: string
  visibleToOrg: string | null
  // Not on the contract; the mock needs it to withhold on the same ground the
  // server does. Dropped on the way out.
  statusChanges: (Schemas['UserStatusChangeResponse'] & { actorRole?: Schemas['UserRole'] })[]
}

function initialUsers(): AdminUserRecord[] {
  return [
    {
      id: uuid(5),
      email: 'sysadmin.lee@pusan.ac.kr',
      name: '이시스템',
      role: 'SYS_ADMIN',
      managedOrgs: [],
      status: 'ACTIVE',
      mfaEnabled: false,
      createdAt: '2026-01-02T09:00:00+09:00',
      withdrawnAt: null,
      disabledAt: null,
      disabledReason: null,
      memberships: [{ workspaceId: uuid(5), workspaceName: '이시스템', workspaceKind: 'PERSONAL', role: 'OWNER', vmOrgIds: [] }],
      activeVmCount: 0,
      statusChanges: [],
      relationshipsLimited: false,
      visibleToOrg: null,
    },
    {
      id: uuid(7),
      email: 'admin.kim@pusan.ac.kr',
      name: '김관리',
      role: 'ORG_ADMIN',
      managedOrgs: [{ orgId: uuid(1), orgName: '정보컴퓨터공학부 실습지원센터', role: 'ORG_ADMIN', requestMail: false }],
      status: 'ACTIVE',
      mfaEnabled: false,
      createdAt: '2026-01-03T09:00:00+09:00',
      withdrawnAt: null,
      disabledAt: null,
      disabledReason: null,
      memberships: [{ workspaceId: uuid(9), workspaceName: '김관리', workspaceKind: 'PERSONAL', role: 'OWNER', vmOrgIds: [] }],
      activeVmCount: 0,
      statusChanges: [],
      relationshipsLimited: false,
      visibleToOrg: uuid(1),
    },
    {
      id: uuid(42),
      email: 'example@pusan.ac.kr',
      name: '홍길동',
      role: 'USER',
      managedOrgs: [],
      status: 'ACTIVE',
      mfaEnabled: true,
      createdAt: '2026-02-10T09:00:00+09:00',
      withdrawnAt: null,
      disabledAt: null,
      disabledReason: null,
      memberships: [
        { workspaceId: uuid(7), workspaceName: '홍길동', workspaceKind: 'PERSONAL', role: 'OWNER', vmOrgIds: [] },
        { workspaceId: uuid(11), workspaceName: '연구팀', workspaceKind: 'LAB', role: 'MEMBER', vmOrgIds: [uuid(1)] },
      ],
      activeVmCount: 2,
      statusChanges: [],
      // 잠긴 프로필. 본인은 못 바꾸고 SYS_ADMIN 만 정정한다.
      position: 'STUDENT_UNDERGRAD',
      studentNo: '202012345',
      departmentCode: 'COMPUTER_SCIENCE',
      departmentName: '정보컴퓨터공학부',
      departmentOther: null,
      relationshipsLimited: false,
      visibleToOrg: uuid(1),
    },
    {
      id: uuid(58),
      email: 'pending.choi@pusan.ac.kr',
      name: '최미인증',
      role: 'USER',
      managedOrgs: [],
      status: 'PENDING_VERIFICATION',
      mfaEnabled: false,
      createdAt: '2026-03-01T09:00:00+09:00',
      withdrawnAt: null,
      disabledAt: null,
      disabledReason: null,
      memberships: [],
      activeVmCount: 0,
      statusChanges: [],
      relationshipsLimited: false,
      visibleToOrg: uuid(1),
    },
    {
      id: uuid(99),
      email: 'outsider.jung@pusan.ac.kr',
      name: '정외부',
      role: 'USER',
      managedOrgs: [],
      status: 'ACTIVE',
      mfaEnabled: false,
      createdAt: '2026-02-20T09:00:00+09:00',
      withdrawnAt: null,
      disabledAt: null,
      disabledReason: null,
      // Machines in another organisation: the case the VM link used to lie about.
      memberships: [
        { workspaceId: uuid(41), workspaceName: '졸업과제팀', workspaceKind: 'PROJECT', role: 'MEMBER', vmOrgIds: [uuid(2)] },
      ],
      activeVmCount: 2,
      statusChanges: [],
      relationshipsLimited: false,
      visibleToOrg: uuid(2),
    },
    {
      // Derived into no organisation: the account the unscoped directory exists for.
      id: uuid(43),
      email: 'nobody.park@pusan.ac.kr',
      name: '박무소속',
      role: 'USER',
      managedOrgs: [],
      status: 'ACTIVE',
      mfaEnabled: false,
      createdAt: '2026-03-05T09:00:00+09:00',
      withdrawnAt: null,
      disabledAt: null,
      disabledReason: null,
      memberships: [],
      activeVmCount: 0,
      statusChanges: [],
      relationshipsLimited: false,
      visibleToOrg: null,
    },
  ]
}

export let adminUserStore: AdminUserRecord[] = initialUsers()

/** 관리자 프로필 정정 요청 본문. 무엇을 보냈는지 검사하는 테스트가 읽는다. */
export const adminProfilePatches: { userId: string; body: Schemas['AdminUpdateProfileRequest'] }[] = []

export function resetUserFixtures() {
  adminUserStore = initialUsers()
  adminProfilePatches.length = 0
}

/** 학번을 요구하는 직책. 서버 enum 과 같은 집합이다. */
const STUDENT_POSITIONS = ['STUDENT_UNDERGRAD', 'STUDENT_GRADUATE']

/** 카탈로그가 푸는 학과명. 실서버는 모든 코드를 풀고 미지 코드만 코드를 돌려준다. */
const DEPARTMENT_NAMES: Record<string, string> = {
  COMPUTER_SCIENCE: '정보컴퓨터공학부',
  OTHER: '기타',
}

function departmentNameOf(code: string | null | undefined): string | null {
  if (!code) return null
  return DEPARTMENT_NAMES[code] ?? code
}

function actorOf(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const profile = ACCESS_TOKENS[token]
  return profile ? mockAuthorityActor(profile) : null
}

/**
 * 계약 v0.46.0: 조회는 전 계층이 전 기관을 본다. orgId는 좁히는 보통 필터다.
 *
 * Derived membership carries the server's ACTIVE condition; a role row does not.
 */
function matchesOrg(row: AdminUserRecord, orgId: string | null): boolean {
  if (!orgId) return true
  if (row.managedOrgs.some((org) => org.orgId === orgId)) return true
  return row.status === 'ACTIVE' && row.visibleToOrg === orgId
}

/**
 * System-tier accounts are withheld from the org tier (operator, 2026-09-16):
 * it cannot act on them. Omitted from the list, 404 from the detail.
 */
function visibleToActor(row: AdminUserRecord, actorRole: Schemas['UserRole']): boolean {
  return isSysTier(actorRole) || !isSysTier(row.role)
}

function fullScope(actor: AuthorityActor, work: string, group: 'VM' | 'WORKSPACE') {
  return isSysTier(actor.role) || workSources(actor, work).some((source) => source.permission.mode === 'FULL' || source.permission.scopes[group]?.mode === 'ALL')
}
function supportOf(actor: AuthorityActor) { return hasWork(actor, 'student.support.read', {}, SYS_READERS) }
function limited(actor: AuthorityActor) {
  return !supportOf(actor) || !fullScope(actor, 'workspace.support.read', 'WORKSPACE') || !fullScope(actor, 'vm.metadata.support.read', 'VM')
}
function toView(row: AdminUserRecord, actor: AuthorityActor): Schemas['UserAdminViewResponse'] {
  const support = supportOf(actor)
  return { id: row.id, name: row.name, email: row.email, role: row.role, status: row.status,
    managedOrgs: support ? row.managedOrgs : null, mfaEnabled: support ? row.mfaEnabled : null,
    createdAt: support ? row.createdAt : null, relationshipsLimited: limited(actor) }
}
function toDetail(row: AdminUserRecord, actor: AuthorityActor): UserAdminDetail {
  const { visibleToOrg: _drop, statusChanges, ...rest } = row
  const support = supportOf(actor)
  const correct = hasWork(actor, 'student.profile.correct', {}, SYS_ADMIN) && (isSysTier(actor.role) || !isSysTier(row.role))
  const profile = support || correct
  const workspace = support && hasAnyWork(actor, ['workspace.support.read'], SYS_READERS)
  const visibleChanges = statusChanges.map(({ actorRole, ...change }) => ({ ...change,
    actorId: !isSysTier(actor.role) && actorRole && isSysTier(actorRole) ? null : change.actorId }))
  return { ...rest, managedOrgs: support ? row.managedOrgs : null, mfaEnabled: support ? row.mfaEnabled : null,
    createdAt: support ? row.createdAt : null, withdrawnAt: support ? row.withdrawnAt : null,
    disabledAt: support ? row.disabledAt : null, disabledReason: support ? row.disabledReason : null,
    statusChanges: support ? visibleChanges : null, position: profile ? row.position : null,
    departmentCode: profile ? row.departmentCode : null, departmentName: profile ? row.departmentName : null, departmentOther: profile ? row.departmentOther : null,
    memberships: workspace ? row.memberships.filter((membership) => hasWork(actor, 'workspace.support.read', { workspaceId: membership.workspaceId }, SYS_READERS))
      .map((membership) => ({ ...membership, vmOrgIds: canQueryWork(actor, ['vm.metadata.read', 'vm.metadata.support.read'], { workspaceId: membership.workspaceId }, SYS_READERS) ? membership.vmOrgIds.filter((orgId) => hasWork(actor, 'vm.metadata.read', { orgId, workspaceId: membership.workspaceId }, SYS_READERS) || hasWork(actor, 'vm.metadata.support.read', { workspaceId: membership.workspaceId }, SYS_READERS)) : null })) : null,
    activeVmCount: support && fullScope(actor, 'vm.metadata.support.read', 'VM') ? row.activeVmCount : null,
    supportCapabilities: { profileVisible: profile, canCorrectProfile: correct, canEnableAccount: actor.role === 'SYS_ADMIN' }, relationshipsLimited: limited(actor) }
}

const notFound = (userId: string) =>
  problemResponse({
    type: 'about:blank',
    title: '사용자를 찾을 수 없습니다',
    status: 404,
    detail: '해당 ID의 사용자가 존재하지 않습니다.',
    instance: `/api/v1/admin/users/${userId}`,
    code: 'RESOURCE_NOT_FOUND',
  })

const forbidden = () =>
  problemResponse({
    type: 'about:blank',
    title: '접근 권한이 없습니다',
    status: 403,
    detail: '이 작업을 수행할 권한이 없습니다.',
    code: 'ACCESS_DENIED',
  })

const orgNotFound = (orgId: string) =>
  problemResponse({
    type: 'about:blank',
    title: '기관을 찾을 수 없습니다',
    status: 404,
    detail: '해당 ID의 기관이 존재하지 않습니다.',
    instance: `/api/v1/admin/orgs/${orgId}`,
    code: 'RESOURCE_NOT_FOUND',
  })

const ORG_NAMES: Record<string, string> = {
  [uuid(1)]: '정보컴퓨터공학부 실습지원센터',
  [uuid(2)]: '테스트 기관',
}

const orgNameOf = (orgId: string) => ORG_NAMES[orgId] ?? '알 수 없는 기관'

/** 실효 역할 — 보유 기관들 중 가장 높은 역할, 하나도 없으면 일반 사용자. */
function effectiveRole(managedOrgs: { role: Schemas['UserRole'] }[]): Schemas['UserRole'] {
  if (managedOrgs.some((org) => org.role === 'ORG_ADMIN')) return 'ORG_ADMIN'
  if (managedOrgs.some((org) => org.role === 'ORG_MANAGER')) return 'ORG_MANAGER'
  if (managedOrgs.some((org) => org.role === 'ORG_VIEWER')) return 'ORG_VIEWER'
  return 'USER'
}

const summaryOf = (row: AdminUserRecord): Schemas['UserSummaryResponse'] => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
})

export const userHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/users', ({ request }) => {
    const actor = actorOf(request)
    if (!actor || !hasAnyWork(actor, ['student.lookup', 'student.support.read', 'student.profile.correct'], SYS_READERS)) return forbidden()
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const status = url.searchParams.get('status')
    const role = url.searchParams.get('role')
    const orgId = url.searchParams.get('orgId')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')

    const filtered = adminUserStore
      .filter((row) => visibleToActor(row, actor.role))
      .filter((row) => matchesOrg(row, orgId))
      .filter((row) => (status ? row.status === status : true))
      .filter((row) => (role ? row.role === role : true))
      .filter((row) =>
        q ? row.email.toLowerCase().includes(q) || row.name.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => b.id.localeCompare(a.id))

    const body: Schemas['PageResponseUserAdminViewResponse'] = {
      content: filtered.slice(page * size, (page + 1) * size).map((row) => toView(row, actor)),
      page,
      size,
      totalElements: filtered.length,
      // Zero rows is zero pages, as on the server.
      totalPages: Math.ceil(filtered.length / size),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.get('*/api/v1/admin/users/:userId', ({ request, params }) => {
    const actor = actorOf(request)
    if (!actor || !hasAnyWork(actor, ['student.lookup', 'student.support.read', 'student.profile.correct'], SYS_READERS)) return forbidden()
    const row = adminUserStore.find((u) => u.id === String(params.userId))
    if (!row || !visibleToActor(row, actor.role)) return notFound(String(params.userId))
    return HttpResponse.json(toDetail(row, actor), { status: 200 })
  }),

  /**
   * 계약 v0.51.0 — 다른 계정의 프로필 정정. SYS_ADMIN 전용.
   *
   * 본인 경로와 달리 명시적 null 로 값을 비운다. 값 규칙은 그대로여서, 비OTHER 코드
   * 옆에 자유 입력을 함께 보내면 422다.
   */
  http.patch('*/api/v1/admin/users/:userId/profile', async ({ request, params }) => {
    const actor = actorOf(request)
    const row = adminUserStore.find((u) => u.id === String(params.userId))
    if (!row) return notFound(String(params.userId))
    if (!(actor && hasWork(actor, 'student.profile.correct', {}, SYS_ADMIN) && (isSysTier(actor.role) || !isSysTier(row.role)))) return forbidden()
    const body = (await request.json()) as Schemas['AdminUpdateProfileRequest']
    adminProfilePatches.push({ userId: String(params.userId), body })

    const code = body.departmentCode ?? null
    const other = body.departmentOther ?? null
    if (other && code && code !== 'OTHER') {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '소속은 한 가지 방식으로만 보낼 수 있습니다.',
        code: 'VALIDATION_FAILED',
        errors: [
          {
            field: 'departmentOther',
            message: '목록에서 고른 소속과 직접 입력한 소속 중 하나만 보낼 수 있습니다.',
          },
        ],
      })
    }
    // 실서버는 presence-tracked 다. 보내지 않은 필드는 그대로 두고, 명시적 null 만
    // 비운다. 여기서 `?? null` 로 덮으면 absent 를 비우기로 읽어 실서버와 정반대가
    // 되고, 화면이 부분 전송으로 바뀌는 날 테스트 세계가 거짓을 가르친다.
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key)
    if (has('position')) row.position = body.position ?? null
    if (has('studentNo')) row.studentNo = body.studentNo ?? null
    if (has('departmentCode')) row.departmentCode = code
    if (has('departmentOther')) row.departmentOther = other

    // 병합 결과에 값 규칙을 돌린다. 학생 직책은 학번을 요구하고, 요구하지 않는 직책은
    // 학번을 버린다 — 관리자가 학생의 학번만 비우는 정정은 실서버에서 422 다.
    const isStudent = STUDENT_POSITIONS.includes(row.position ?? '')
    if (isStudent && !row.studentNo) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '학번을 입력해 주세요.',
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'studentNo', message: '학번을 입력해 주세요.' }],
      })
    }
    if (!isStudent) row.studentNo = null
    row.departmentName = departmentNameOf(row.departmentCode)
    return HttpResponse.json(toDetail(row, actor), { status: 200 })
  }),

  /**
   * 계약 v0.46.0 — 기관 하나의 역할 부여와 회수. 통째로 덮어쓰는 `PATCH
   * /admin/users/{userId}`와 달리 ORG_ADMIN에게도 열려 있고, 대상의 다른 기관
   * 행은 건드리지 않는다.
   */
  http.put('*/api/v1/admin/users/:userId/org-roles/:orgId', async ({ request, params }) => {
    const actor = actorOf(request)
    if (!actor || (actor.role !== 'ORG_ADMIN' && actor.role !== 'SYS_ADMIN')) return forbidden()
    const orgId = String(params.orgId)
    // 관리자로 있지 않은 기관은 존재를 감추려 404로 답한다.
    if (
      actor.role === 'ORG_ADMIN' &&
      !actor.managedOrgs.some((org) => org.orgId === orgId && org.role === 'ORG_ADMIN')
    ) {
      return orgNotFound(orgId)
    }
    const row = adminUserStore.find((u) => u.id === String(params.userId))
    if (!row) return notFound(String(params.userId))
    // 시스템 계층 계정(열람자 포함)의 기관 역할은 손댈 수 없다.
    if (row.id === actor.id || isSysTier(row.role)) {
      return forbidden()
    }
    const body = (await request.json()) as { role: Schemas['UserRole']; expectedRevision: number }
    const conflict = orgRevisionConflict(orgId, body.expectedRevision)
    if (conflict) return conflict
    const held = row.managedOrgs.filter((org) => org.orgId !== orgId)
    // A viewer role cannot keep the request-mail choice (V133 check).
    const previous = row.managedOrgs.find((org) => org.orgId === orgId)
    const requestMail =
      (previous?.requestMail ?? false) &&
      (body.role === 'ORG_ADMIN' || body.role === 'ORG_MANAGER')
    row.managedOrgs = [...held, { orgId, orgName: orgNameOf(orgId), role: body.role, requestMail }]
    row.role = effectiveRole(row.managedOrgs)
    advanceOrgRevision(orgId)
    return HttpResponse.json(summaryOf(row), { status: 200 })
  }),

  /**
   * Contract v0.89.0: marks or clears a request-mail recipient. Same org scope
   * as the grant, but the actor may target itself; only approving roles may
   * turn it on.
   */
  http.put(
    '*/api/v1/admin/users/:userId/org-roles/:orgId/request-mail',
    async ({ request, params }) => {
      const actor = actorOf(request)
      if (!actor || (actor.role !== 'ORG_ADMIN' && actor.role !== 'SYS_ADMIN')) return forbidden()
      const orgId = String(params.orgId)
      if (
        actor.role === 'ORG_ADMIN' &&
        !actor.managedOrgs.some((org) => org.orgId === orgId && org.role === 'ORG_ADMIN')
      ) {
        return orgNotFound(orgId)
      }
      const row = adminUserStore.find((u) => u.id === String(params.userId))
      const held = row?.managedOrgs.find((org) => org.orgId === orgId)
      if (!row || !held) return notFound(String(params.userId))
      const body = (await request.json()) as { enabled: boolean; expectedRevision: number }
      const conflict = orgRevisionConflict(orgId, body.expectedRevision)
      if (conflict) return conflict
      if (body.enabled && held.role !== 'ORG_ADMIN' && held.role !== 'ORG_MANAGER') {
        return HttpResponse.json(
          {
            type: 'about:blank',
            title: '입력값이 올바르지 않습니다',
            status: 422,
            code: 'VALIDATION_FAILED',
            errors: [
              {
                field: 'enabled',
                message: '신청 접수 메일은 신청을 승인할 수 있는 기관 관리자와 기관 운영자만 받을 수 있습니다.',
              },
            ],
          },
          { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
        )
      }
      held.requestMail = body.enabled
      advanceOrgRevision(orgId)
      return HttpResponse.json(held, { status: 200 })
    },
  ),

  http.delete('*/api/v1/admin/users/:userId/org-roles/:orgId', ({ request, params }) => {
    const actor = actorOf(request)
    if (!actor || (actor.role !== 'ORG_ADMIN' && actor.role !== 'SYS_ADMIN')) return forbidden()
    const orgId = String(params.orgId)
    if (
      actor.role === 'ORG_ADMIN' &&
      !actor.managedOrgs.some((org) => org.orgId === orgId && org.role === 'ORG_ADMIN')
    ) {
      return orgNotFound(orgId)
    }
    const row = adminUserStore.find((u) => u.id === String(params.userId))
    if (!row) return notFound(String(params.userId))
    // 시스템 계층 계정(열람자 포함)의 기관 역할은 손댈 수 없다.
    if (row.id === actor.id || isSysTier(row.role)) {
      return forbidden()
    }
    const conflict = orgRevisionConflict(orgId, Number(new URL(request.url).searchParams.get('expectedRevision')))
    if (conflict) return conflict
    row.managedOrgs = row.managedOrgs.filter((org) => org.orgId !== orgId)
    row.role = effectiveRole(row.managedOrgs)
    advanceOrgRevision(orgId)
    return HttpResponse.json(summaryOf(row), { status: 200 })
  }),

  http.post('*/api/v1/admin/users/:userId/disable', async ({ request, params }) => {
    const actor = actorOf(request)
    if (!actor || actor.role !== 'SYS_ADMIN') return forbidden()
    const row = adminUserStore.find((u) => u.id === String(params.userId))
    if (!row) return notFound(String(params.userId))
    if (actor.id === row.id) {
      return problemResponse({
        type: 'about:blank',
        title: '비활성화할 수 없는 계정입니다',
        status: 409,
        detail: '본인 계정은 비활성화할 수 없습니다.',
        code: 'ACCOUNT_SELF_DISABLE_FORBIDDEN',
      })
    }
    if (row.status !== 'ACTIVE' && row.status !== 'PENDING_VERIFICATION') {
      return problemResponse({
        type: 'about:blank',
        title: '비활성화할 수 없는 계정입니다',
        status: 409,
        detail: '이미 비활성화되었거나 탈퇴한 계정입니다.',
        code: 'ACCOUNT_INVALID_STATE',
      })
    }
    const { reason } = (await request.json()) as { reason: string }
    if (!reason || reason.trim().length === 0) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '요청 값을 확인해 주세요.',
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'reason', message: '비활성화 사유를 입력해 주세요.' }],
      })
    }
    const from = row.status
    row.statusChanges = [
      { fromStatus: from, toStatus: 'DISABLED', actorId: actor.id, actorEmail: actor.email, actorName: actor.name, actorRole: actor.role, reason, changedAt: new Date().toISOString() },
      ...row.statusChanges,
    ]
    row.status = 'DISABLED'
    row.disabledAt = new Date().toISOString()
    row.disabledReason = reason
    return HttpResponse.json(toDetail(row, actor), { status: 200 })
  }),

  http.post('*/api/v1/admin/users/:userId/enable', ({ request, params }) => {
    const actor = actorOf(request)
    if (!actor || actor.role !== 'SYS_ADMIN') return forbidden()
    const row = adminUserStore.find((u) => u.id === String(params.userId))
    if (!row) return notFound(String(params.userId))
    if (row.status !== 'DISABLED') {
      return problemResponse({
        type: 'about:blank',
        title: '활성화할 수 없는 계정입니다',
        status: 409,
        detail: '비활성화 상태의 계정만 활성화할 수 있습니다.',
        code: 'ACCOUNT_NOT_DISABLED',
      })
    }
    const lastDisable = row.statusChanges.find((c) => c.toStatus === 'DISABLED')
    const restored = lastDisable?.fromStatus ?? 'ACTIVE'
    row.statusChanges = [
      { fromStatus: 'DISABLED', toStatus: restored, actorId: actor.id, actorEmail: actor.email, actorName: actor.name, actorRole: actor.role, reason: null, changedAt: new Date().toISOString() },
      ...row.statusChanges,
    ]
    row.status = restored
    row.disabledAt = null
    row.disabledReason = null
    return HttpResponse.json(toDetail(row, actor), { status: 200 })
  }),
]
