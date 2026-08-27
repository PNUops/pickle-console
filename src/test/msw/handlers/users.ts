import { isSysTier } from '../../../auth/permissions'
import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { ACCESS_TOKENS, problemResponse } from './auth'
import { uuid } from '../ids'

type Schemas = components['schemas']
type UserAdminDetail = Schemas['UserAdminDetailResponse']

/**
 * Admin-user fixture. Reads are global for every admin tier (contract v0.46.0);
 * {@code visibleToOrg} models derived membership so the ordinary {@code orgId}
 * filter can narrow to an org's administrators plus its derived members.
 */
interface AdminUserRecord extends UserAdminDetail {
  visibleToOrg: string | null
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
      memberships: [{ workspaceId: uuid(5), workspaceName: '이시스템', workspaceKind: 'PERSONAL', role: 'OWNER' }],
      activeVmCount: 0,
      statusChanges: [],
      visibleToOrg: null,
    },
    {
      id: uuid(7),
      email: 'admin.kim@pusan.ac.kr',
      name: '김관리',
      role: 'ORG_ADMIN',
      managedOrgs: [{ orgId: uuid(1), orgName: '정보컴퓨터공학부 실습지원센터', role: 'ORG_ADMIN' }],
      status: 'ACTIVE',
      mfaEnabled: false,
      createdAt: '2026-01-03T09:00:00+09:00',
      withdrawnAt: null,
      disabledAt: null,
      disabledReason: null,
      memberships: [{ workspaceId: uuid(9), workspaceName: '김관리', workspaceKind: 'PERSONAL', role: 'OWNER' }],
      activeVmCount: 0,
      statusChanges: [],
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
        { workspaceId: uuid(7), workspaceName: '홍길동', workspaceKind: 'PERSONAL', role: 'OWNER' },
        { workspaceId: uuid(11), workspaceName: '연구팀', workspaceKind: 'TEAM', role: 'MEMBER' },
      ],
      activeVmCount: 2,
      statusChanges: [],
      // 잠긴 프로필. 본인은 못 바꾸고 SYS_ADMIN 만 정정한다.
      position: 'STUDENT_UNDERGRAD',
      studentNo: '202012345',
      departmentCode: 'COMPUTER_SCIENCE',
      departmentName: '정보컴퓨터공학부',
      departmentOther: null,
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
      memberships: [],
      activeVmCount: 0,
      statusChanges: [],
      visibleToOrg: uuid(2),
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

function actorOf(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  return ACCESS_TOKENS[token] ?? null
}

/** 계약 v0.46.0: 조회는 전 계층이 전 기관을 본다. orgId는 좁히는 보통 필터다. */
function matchesOrg(row: AdminUserRecord, orgId: string | null): boolean {
  if (!orgId) return true
  return row.managedOrgs.some((org) => org.orgId === orgId) || row.visibleToOrg === orgId
}

function toView(row: AdminUserRecord): Schemas['UserAdminViewResponse'] {
  const { visibleToOrg: _drop, memberships: _m, activeVmCount: _v, statusChanges: _s, ...view } = row
  return view
}

/**
 * 상세 응답. **프로필 다섯 필드는 시스템 계층에만 실린다.**
 *
 * 이 엔드포인트는 기관이 다른 기관 직원에게 주는 ORG_VIEWER 까지 받고 기관 범위로
 * 좁히지도 않으므로, 채워 보내면 모든 기관의 직원이 모든 계정의 학번을 읽는다. 서버가
 * 그렇게 하므로 모의도 그렇게 한다 — 여기서 채워 보내면 콘솔이 경계를 지키는지 이 테스트
 * 세계에서는 확인할 수 없다.
 */
function toDetail(row: AdminUserRecord, actorRole: Schemas['UserRole']): UserAdminDetail {
  const { visibleToOrg: _drop, ...detail } = row
  if (isSysTier(actorRole)) return detail
  return {
    ...detail,
    position: null,
    studentNo: null,
    departmentCode: null,
    departmentName: null,
    departmentOther: null,
  }
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
  [uuid(2)]: '전자공학과',
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
    if (!actor || actor.role === 'USER') return forbidden()
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const status = url.searchParams.get('status')
    const role = url.searchParams.get('role')
    const orgId = url.searchParams.get('orgId')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')

    const filtered = adminUserStore
      .filter((row) => matchesOrg(row, orgId))
      .filter((row) => (status ? row.status === status : true))
      .filter((row) => (role ? row.role === role : true))
      .filter((row) =>
        q ? row.email.toLowerCase().includes(q) || row.name.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => b.id.localeCompare(a.id))

    const body: Schemas['PageResponseUserAdminViewResponse'] = {
      content: filtered.slice(page * size, (page + 1) * size).map(toView),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.get('*/api/v1/admin/users/:userId', ({ request, params }) => {
    const actor = actorOf(request)
    if (!actor || actor.role === 'USER') return forbidden()
    const row = adminUserStore.find((u) => u.id === String(params.userId))
    if (!row) return notFound(String(params.userId))
    return HttpResponse.json(toDetail(row, actor.role), { status: 200 })
  }),

  /**
   * 계약 v0.51.0 — 다른 계정의 프로필 정정. SYS_ADMIN 전용.
   *
   * 본인 경로와 달리 명시적 null 로 값을 비운다. 값 규칙은 그대로여서, 비OTHER 코드
   * 옆에 자유 입력을 함께 보내면 422다.
   */
  http.patch('*/api/v1/admin/users/:userId/profile', async ({ request, params }) => {
    const actor = actorOf(request)
    if (!actor || actor.role !== 'SYS_ADMIN') return forbidden()
    const row = adminUserStore.find((u) => u.id === String(params.userId))
    if (!row) return notFound(String(params.userId))
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
    row.position = body.position ?? null
    // 학번은 요구하지 않는 직책에서 버려진다. 본인 경로와 같은 정규화다.
    const keepsStudentNo = row.position != null && row.position.startsWith('STUDENT_')
    row.studentNo = keepsStudentNo ? (body.studentNo ?? null) : null
    row.departmentCode = code
    row.departmentName = code === 'COMPUTER_SCIENCE' ? '정보컴퓨터공학부' : code
    row.departmentOther = other
    return HttpResponse.json(toDetail(row, actor.role), { status: 200 })
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
    const body = (await request.json()) as { role: Schemas['UserRole'] }
    const held = row.managedOrgs.filter((org) => org.orgId !== orgId)
    row.managedOrgs = [...held, { orgId, orgName: orgNameOf(orgId), role: body.role }]
    row.role = effectiveRole(row.managedOrgs)
    return HttpResponse.json(summaryOf(row), { status: 200 })
  }),

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
    row.managedOrgs = row.managedOrgs.filter((org) => org.orgId !== orgId)
    row.role = effectiveRole(row.managedOrgs)
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
      { fromStatus: from, toStatus: 'DISABLED', actorId: actor.id, actorEmail: actor.email, actorName: actor.name, reason, changedAt: new Date().toISOString() },
      ...row.statusChanges,
    ]
    row.status = 'DISABLED'
    row.disabledAt = new Date().toISOString()
    row.disabledReason = reason
    return HttpResponse.json(toDetail(row, actor.role), { status: 200 })
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
      { fromStatus: 'DISABLED', toStatus: restored, actorId: actor.id, actorEmail: actor.email, actorName: actor.name, reason: null, changedAt: new Date().toISOString() },
      ...row.statusChanges,
    ]
    row.status = restored
    row.disabledAt = null
    row.disabledReason = null
    return HttpResponse.json(toDetail(row, actor.role), { status: 200 })
  }),
]
