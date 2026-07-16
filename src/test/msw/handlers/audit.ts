import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { ACCESS_TOKENS, problemResponse, unauthorizedProblem } from './auth'

type Schemas = components['schemas']
type AuditLogView = Schemas['AuditLogView']
type ActivityEntry = Schemas['ActivityEntry']

/** 내부 저장용 감사 행 — 가시성 판정을 위해 행위자 기관을 함께 든다. */
interface StoredAuditRow extends AuditLogView {
  /** 행위자 소속 기관 (ORG_ADMIN 가시성 판정용, 시스템·무소속은 null) */
  actorOrgId: number | null
}

function initialAuditRows(): StoredAuditRow[] {
  return [
    {
      // sshgw 감사 행 — actorRole은 UserRole 밖의 열린 값 (계약 v0.5.x 정합 수정)
      id: 505,
      actorOrgId: null,
      actorId: 90,
      actorEmail: null,
      actorName: 'ssh-gateway',
      actorRole: 'SSHGW',
      action: 'sshgw.route',
      targetType: 'vm',
      targetId: '56',
      detail: null,
      ip: '203.0.113.40',
      createdAt: '2026-07-13T11:00:00+09:00',
    },
    {
      id: 504,
      actorOrgId: 2,
      actorId: 58,
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
      id: 503,
      actorOrgId: null,
      actorId: 5,
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
      id: 502,
      actorOrgId: 1,
      actorId: 7,
      actorEmail: 'admin.kim@pusan.ac.kr',
      actorName: '김관리',
      actorRole: 'ORG_ADMIN',
      action: 'vm.period_update',
      targetType: 'vm',
      targetId: '46',
      detail: null,
      ip: '10.0.0.5',
      createdAt: '2026-07-13T09:40:00+09:00',
    },
    {
      id: 501,
      actorOrgId: 1,
      actorId: 42,
      actorEmail: 'gildong.hong@pusan.ac.kr',
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

/** 학생 홍길동(42)의 내 활동 이력. */
function initialActivityRows(): ActivityEntry[] {
  return [
    {
      id: 601,
      action: 'auth.login',
      targetType: null,
      targetId: null,
      detail: null,
      ip: '127.0.0.1',
      createdAt: '2026-07-13T09:00:00+09:00',
    },
    {
      id: 600,
      action: 'vm.self_delete',
      targetType: 'vm',
      targetId: '60',
      detail: null,
      ip: '127.0.0.1',
      createdAt: '2026-07-08T14:10:00+09:00',
    },
    {
      id: 599,
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

    // 계약: orgId 필터는 SYS_ADMIN 전용 — ORG_ADMIN이 다른 기관을 지정하면 404 (존재 비공개)
    if (orgId && profile.role !== 'SYS_ADMIN' && Number(orgId) !== profile.orgId) {
      return problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: '요청한 리소스가 존재하지 않습니다.',
        instance: '/api/v1/admin/audit',
        code: 'RESOURCE_NOT_FOUND',
      })
    }

    const filtered = auditStore
      // ORG_ADMIN은 행위자가 자기 기관 소속인 행만 (계약)
      .filter((row) => profile.role === 'SYS_ADMIN' || row.actorOrgId === profile.orgId)
      .filter((row) => !orgId || row.actorOrgId === Number(orgId))
      .filter((row) => !action || row.action === action)
      .filter((row) => !actorEmail || (row.actorEmail ?? '').includes(actorEmail))
      .filter((row) => !from || row.createdAt.slice(0, 10) >= from)
      .filter((row) => !to || row.createdAt.slice(0, 10) <= to)
      .sort((a, b) => b.id - a.id)
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
    // 픽스처는 학생(42) 기준 — 다른 계정은 빈 목록.
    const rows = (profile.id === 42 ? activityStore : [])
      .filter((row) => !action || row.action === action)
      .sort((a, b) => b.id - a.id)
    return HttpResponse.json(paged(rows, page, size), { status: 200 })
  }),
]
