import { isSysTier } from '../../../auth/permissions'
import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { ACCESS_TOKENS, problemResponse } from './auth'

type Schemas = components['schemas']
type UserAdminDetail = Schemas['UserAdminDetail']

/**
 * Admin-user fixture. {@code visibleToOrg} models the derived-membership scope:
 * an ORG_ADMIN of org N sees rows whose orgId is N (fellow org admins) or whose
 * visibleToOrg is N (derived members). SYS_ADMIN sees everything.
 */
interface AdminUserRecord extends UserAdminDetail {
  visibleToOrg: number | null
}

function initialUsers(): AdminUserRecord[] {
  return [
    {
      id: 5,
      email: 'sysadmin.lee@pusan.ac.kr',
      name: '이시스템',
      role: 'SYS_ADMIN',
      orgId: null,
      status: 'ACTIVE',
      mfaEnabled: false,
      createdAt: '2026-01-02T09:00:00+09:00',
      withdrawnAt: null,
      disabledAt: null,
      disabledReason: null,
      memberships: [{ groupId: 5, groupName: '이시스템', groupKind: 'PERSONAL', role: 'OWNER' }],
      activeVmCount: 0,
      statusChanges: [],
      visibleToOrg: null,
    },
    {
      id: 7,
      email: 'admin.kim@pusan.ac.kr',
      name: '김관리',
      role: 'ORG_ADMIN',
      orgId: 1,
      status: 'ACTIVE',
      mfaEnabled: false,
      createdAt: '2026-01-03T09:00:00+09:00',
      withdrawnAt: null,
      disabledAt: null,
      disabledReason: null,
      memberships: [{ groupId: 9, groupName: '김관리', groupKind: 'PERSONAL', role: 'OWNER' }],
      activeVmCount: 0,
      statusChanges: [],
      visibleToOrg: 1,
    },
    {
      id: 42,
      email: 'example@pusan.ac.kr',
      name: '홍길동',
      role: 'USER',
      orgId: null,
      status: 'ACTIVE',
      mfaEnabled: true,
      createdAt: '2026-02-10T09:00:00+09:00',
      withdrawnAt: null,
      disabledAt: null,
      disabledReason: null,
      memberships: [
        { groupId: 7, groupName: '홍길동', groupKind: 'PERSONAL', role: 'OWNER' },
        { groupId: 11, groupName: '연구팀', groupKind: 'TEAM', role: 'MEMBER' },
      ],
      activeVmCount: 2,
      statusChanges: [],
      visibleToOrg: 1,
    },
    {
      id: 58,
      email: 'pending.choi@pusan.ac.kr',
      name: '최미인증',
      role: 'USER',
      orgId: null,
      status: 'PENDING_VERIFICATION',
      mfaEnabled: false,
      createdAt: '2026-03-01T09:00:00+09:00',
      withdrawnAt: null,
      disabledAt: null,
      disabledReason: null,
      memberships: [],
      activeVmCount: 0,
      statusChanges: [],
      visibleToOrg: 1,
    },
    {
      id: 99,
      email: 'outsider.jung@pusan.ac.kr',
      name: '정외부',
      role: 'USER',
      orgId: null,
      status: 'ACTIVE',
      mfaEnabled: false,
      createdAt: '2026-02-20T09:00:00+09:00',
      withdrawnAt: null,
      disabledAt: null,
      disabledReason: null,
      memberships: [],
      activeVmCount: 0,
      statusChanges: [],
      visibleToOrg: 2,
    },
  ]
}

export let adminUserStore: AdminUserRecord[] = initialUsers()

export function resetUserFixtures() {
  adminUserStore = initialUsers()
}

function actorOf(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  return ACCESS_TOKENS[token] ?? null
}

function inScope(actor: NonNullable<ReturnType<typeof actorOf>>, row: AdminUserRecord): boolean {
  if (isSysTier(actor.role)) return true // SYS_ADMIN·SYS_MANAGER: 전 기관
  return row.orgId === actor.orgId || row.visibleToOrg === actor.orgId
}

function toView(row: AdminUserRecord): Schemas['UserAdminView'] {
  const { visibleToOrg: _drop, memberships: _m, activeVmCount: _v, statusChanges: _s, ...view } = row
  return view
}

function toDetail(row: AdminUserRecord): UserAdminDetail {
  const { visibleToOrg: _drop, ...detail } = row
  return detail
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

export const userHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/users', ({ request }) => {
    const actor = actorOf(request)
    if (!actor || actor.role === 'USER') return forbidden()
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const status = url.searchParams.get('status')
    const role = url.searchParams.get('role')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')

    const filtered = adminUserStore
      .filter((row) => inScope(actor, row))
      .filter((row) => (status ? row.status === status : true))
      .filter((row) => (role ? row.role === role : true))
      .filter((row) =>
        q ? row.email.toLowerCase().includes(q) || row.name.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => b.id - a.id)

    const body: Schemas['UserAdminPage'] = {
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
    const row = adminUserStore.find((u) => u.id === Number(params.userId))
    if (!row || !inScope(actor, row)) return notFound(String(params.userId))
    return HttpResponse.json(toDetail(row), { status: 200 })
  }),

  http.post('*/api/v1/admin/users/:userId/disable', async ({ request, params }) => {
    const actor = actorOf(request)
    if (!actor || actor.role !== 'SYS_ADMIN') return forbidden()
    const row = adminUserStore.find((u) => u.id === Number(params.userId))
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
      { fromStatus: from, toStatus: 'DISABLED', actorId: actor.id, actorEmail: actor.email, reason, changedAt: new Date().toISOString() },
      ...row.statusChanges,
    ]
    row.status = 'DISABLED'
    row.disabledAt = new Date().toISOString()
    row.disabledReason = reason
    return HttpResponse.json(toDetail(row), { status: 200 })
  }),

  http.post('*/api/v1/admin/users/:userId/enable', ({ request, params }) => {
    const actor = actorOf(request)
    if (!actor || actor.role !== 'SYS_ADMIN') return forbidden()
    const row = adminUserStore.find((u) => u.id === Number(params.userId))
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
      { fromStatus: 'DISABLED', toStatus: restored, actorId: actor.id, actorEmail: actor.email, reason: null, changedAt: new Date().toISOString() },
      ...row.statusChanges,
    ]
    row.status = restored
    row.disabledAt = null
    row.disabledReason = null
    return HttpResponse.json(toDetail(row), { status: 200 })
  }),
]
