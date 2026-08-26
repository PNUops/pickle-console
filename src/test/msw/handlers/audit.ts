import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { ACCESS_TOKENS, problemResponse, unauthorizedProblem } from './auth'
import { adminOperatedScope } from './org-scope'
import { uuid } from '../ids'

type Schemas = components['schemas']
type AuditLogView = Schemas['AuditLogViewResponse']
type ActivityEntry = Schemas['ActivityEntryResponse']

/** 내부 저장용 감사 행 — 가시성 판정을 위해 행위자 기관을 함께 든다. */
interface StoredAuditRow extends AuditLogView {
  /** 행위자 소속 기관 (ORG_ADMIN 가시성 판정용, 시스템·무소속은 null) */
  actorOrgId: string | null
}

function initialAuditRows(): StoredAuditRow[] {
  return [
    {
      // sshgw 감사 행 — actorRole은 UserRole 밖의 열린 값 (계약 v0.5.x 정합 수정)
      id: uuid(505),
      actorOrgId: null,
      actorId: uuid(90),
      actorEmail: null,
      actorName: 'ssh-gateway',
      actorRole: 'SSHGW',
      action: 'sshgw.route',
      targetType: 'vm',
      targetId: uuid(56),
      detail: null,
      ip: '203.0.113.40',
      createdAt: '2026-07-13T11:00:00+09:00',
    },
    {
      id: uuid(504),
      actorOrgId: uuid(2),
      actorId: uuid(58),
      actorEmail: 'younghee.park@pusan.ac.kr',
      actorName: '박영희',
      actorRole: 'USER',
      action: 'auth.login_failed',
      targetType: null,
      targetId: null,
      detail: null,
      ip: '203.0.113.9',
      createdAt: '2026-07-13T10:30:00+09:00',
    },
    {
      id: uuid(503),
      actorOrgId: null,
      actorId: uuid(5),
      actorEmail: 'sysadmin.lee@pusan.ac.kr',
      actorName: '이시스템',
      actorRole: 'SYS_ADMIN',
      action: 'setting.update',
      targetType: 'setting',
      targetId: 'ssh_gateway_enabled',
      detail: null,
      ip: '10.0.0.2',
      createdAt: '2026-07-13T10:00:00+09:00',
    },
    {
      id: uuid(502),
      actorOrgId: uuid(1),
      actorId: uuid(7),
      actorEmail: 'admin.kim@pusan.ac.kr',
      actorName: '김관리',
      actorRole: 'ORG_ADMIN',
      action: 'vm.period_update',
      targetType: 'vm',
      targetId: uuid(46),
      detail: null,
      ip: '10.0.0.5',
      createdAt: '2026-07-13T09:40:00+09:00',
    },
    {
      id: uuid(501),
      actorOrgId: uuid(1),
      actorId: uuid(42),
      actorEmail: 'example@pusan.ac.kr',
      actorName: '홍길동',
      actorRole: 'USER',
      action: 'auth.login',
      targetType: null,
      targetId: null,
      detail: null,
      ip: '127.0.0.1',
      createdAt: '2026-07-13T09:00:00+09:00',
    },
  ]
}

/** 사용자 홍길동(42)의 내 활동 이력. */
function initialActivityRows(): ActivityEntry[] {
  return [
    {
      id: uuid(601),
      action: 'auth.login',
      targetType: null,
      targetId: null,
      detail: null,
      ip: '127.0.0.1',
      createdAt: '2026-07-13T09:00:00+09:00',
    },
    {
      id: uuid(600),
      action: 'vm.self_delete',
      targetType: 'vm',
      targetId: uuid(60),
      detail: null,
      ip: '127.0.0.1',
      createdAt: '2026-07-08T14:10:00+09:00',
    },
    {
      id: uuid(599),
      action: 'auth.login',
      targetType: null,
      targetId: null,
      detail: null,
      ip: '127.0.0.2',
      createdAt: '2026-07-07T22:10:00+09:00',
    },
  ]
}

export let auditStore: StoredAuditRow[] = initialAuditRows()
export let activityStore: ActivityEntry[] = initialActivityRows()

export function resetAuditFixtures() {
  auditStore = initialAuditRows()
  activityStore = initialActivityRows()
}

function profileOf(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  return ACCESS_TOKENS[token] ?? null
}

function toView({ actorOrgId: _actorOrgId, ...view }: StoredAuditRow): AuditLogView {
  return view
}

function paged<T>(rows: T[], page: number, size: number) {
  return {
    content: rows.slice(page * size, (page + 1) * size),
    page,
    size,
    totalElements: rows.length,
    totalPages: Math.max(1, Math.ceil(rows.length / size)),
  }
}

export const auditHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/audit', ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const url = new URL(request.url)
    const action = url.searchParams.get('action')
    const actorEmail = url.searchParams.get('actorEmail')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const orgId = url.searchParams.get('orgId')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')

    // 계약 v0.46.0: 감사 로그는 조회 중 가장 좁다 — 역할을 보유한 기관이 아니라
    // 행위할 수 있는(관리자나 운영자인) 기관만이며, 그 밖을 지정하면 404
    // (존재 비공개). 열람 역할(ORG_VIEWER)은 이 표면 자체가 403이지만, 여기서는
    // 스코프만 재현한다.
    const scope = adminOperatedScope(profile, orgId, '/api/v1/admin/audit')
    if (scope.notFound) return scope.notFound

    const filtered = auditStore
      .filter((row) => scope.matches(row.actorOrgId))
      .filter((row) => !action || row.action === action)
      .filter((row) => !actorEmail || (row.actorEmail ?? '').includes(actorEmail))
      .filter((row) => !from || row.createdAt.slice(0, 10) >= from)
      .filter((row) => !to || row.createdAt.slice(0, 10) <= to)
      .sort((a, b) => b.id.localeCompare(a.id))
      .map(toView)
    return HttpResponse.json(paged(filtered, page, size), { status: 200 })
  }),

  http.get('*/api/v1/me/activity', ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const url = new URL(request.url)
    const action = url.searchParams.get('action')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    // 픽스처는 사용자(42) 기준 — 다른 계정은 빈 목록.
    const rows = (profile.id === uuid(42) ? activityStore : [])
      .filter((row) => !action || row.action === action)
      .sort((a, b) => b.id.localeCompare(a.id))
    return HttpResponse.json(paged(rows, page, size), { status: 200 })
  }),
]
