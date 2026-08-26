import { isOrgTier, isSysTier } from '../../../auth/permissions'
import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { ACCESS_TOKENS, problemResponse, unauthorizedProblem } from './auth'
import { adminReadScope } from './org-scope'
import { uuid } from '../ids'

type Schemas = components['schemas']
type AnnouncementView = Schemas['AnnouncementView']
type AdminWorkspaceOption = Schemas['AdminWorkspaceOptionResponse']

/* ─── fixtures ─── */

/** 워크스페이스 선택지 — 기관별. SYS_ADMIN은 전체, ORG_ADMIN은 자기 기관 워크스페이스만. */
const workspaceOptionsByOrg: Record<string, AdminWorkspaceOption[]> = {
  [uuid(1)]: [
    {
      id: uuid(12),
      name: '캡스톤 3조',
      memberCount: 4,
      kind: 'TEAM',
      createdAt: '2026-06-01T10:00:00+09:00',
    },
    {
      id: uuid(15),
      name: '알고리즘 스터디',
      memberCount: 6,
      kind: 'TEAM',
      createdAt: '2026-06-10T10:00:00+09:00',
    },
  ],
  [uuid(2)]: [
    {
      id: uuid(21),
      name: 'AI 동아리',
      memberCount: 5,
      kind: 'PROJECT',
      createdAt: '2026-06-15T10:00:00+09:00',
    },
  ],
}

interface StoredAnnouncement extends AnnouncementView {
  /** 발송자 기관 (ORG_ADMIN 가시성 판정용 — SYS_ADMIN 발송은 null) */
  senderOrgId: string | null
}

function initialAnnouncements(): StoredAnnouncement[] {
  return [
    {
      id: uuid(11),
      senderOrgId: uuid(1),
      title: '7월 정기 점검 안내',
      scope: 'ORG',
      orgId: uuid(1),
      workspaceId: null,
      recipientCount: 132,
      createdAt: '2026-07-10T11:00:00+09:00',
    },
    {
      id: uuid(10),
      senderOrgId: null,
      title: '플랫폼 오픈 안내',
      scope: 'ALL',
      orgId: null,
      workspaceId: null,
      recipientCount: 480,
      createdAt: '2026-07-01T09:00:00+09:00',
    },
  ]
}

export let announcementStore: StoredAnnouncement[] = initialAnnouncements()
let nextAnnouncementId = 12

export function resetAnnouncementFixtures() {
  announcementStore = initialAnnouncements()
  nextAnnouncementId = 12
}

function profileOf(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  return ACCESS_TOKENS[token] ?? null
}

function toView({ senderOrgId: _senderOrgId, ...view }: StoredAnnouncement): AnnouncementView {
  return view
}

/** 워크스페이스 상세 픽스처 (계약 v0.19.0 — 구성원은 계정 상태 무관 전원). */
const workspaceDetails: Record<string, Schemas['AdminWorkspaceDetailResponse']> = {
  [uuid(12)]: {
    id: uuid(12),
    kind: 'TEAM',
    name: '캡스톤 3조',
    description: '캡스톤 디자인 3조',
    createdAt: '2026-06-01T10:00:00+09:00',
    memberCount: 4,
    vmCount: 2,
    members: [
      {
        userId: uuid(42),
        name: '홍길동',
        email: 'example@pusan.ac.kr',
        workspaceRole: 'OWNER',
        userStatus: 'ACTIVE',
        joinedAt: '2026-06-01T10:00:00+09:00',
      },
      {
        userId: uuid(77),
        name: '박탈퇴',
        email: 'left.park@pusan.ac.kr',
        workspaceRole: 'MEMBER',
        userStatus: 'WITHDRAWN',
        joinedAt: '2026-06-02T10:00:00+09:00',
      },
    ],
  },
}

export const announcementHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/workspaces/:workspaceId', ({ params }) => {
    const detail = workspaceDetails[String(params.workspaceId)]
    if (!detail) {
      return problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: '해당 워크스페이스가 존재하지 않습니다.',
        code: 'RESOURCE_NOT_FOUND',
      })
    }
    return HttpResponse.json(detail, { status: 200 })
  }),

  http.get('*/api/v1/admin/workspaces', ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const url = new URL(request.url)
    const orgId = url.searchParams.get('orgId')
    // 계약 v0.46.0: 기관 계층은 역할을 보유한 기관 안만 본다. 보유하지 않은
    // 기관이나 없는 기관을 지정하면 404 (존재 비공개).
    const scope = adminReadScope(profile, orgId, '/api/v1/admin/workspaces')
    if (scope.notFound) return scope.notFound
    if (orgId && !(orgId in workspaceOptionsByOrg)) {
      return problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: '요청한 리소스가 존재하지 않습니다.',
        instance: '/api/v1/admin/workspaces',
        code: 'RESOURCE_NOT_FOUND',
      })
    }
    const options = Object.entries(workspaceOptionsByOrg)
      .filter(([optionOrgId]) => scope.matches(optionOrgId))
      .flatMap(([, list]) => list)
    return HttpResponse.json(options, { status: 200 })
  }),

  http.get('*/api/v1/admin/announcements', ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    // 계약: 기관 계층은 관리 기관 발송분 + ALL 공지
    const visible = announcementStore
      .filter(
        (a) =>
          isSysTier(profile.role) ||
          a.scope === 'ALL' ||
          profile.managedOrgs.some((org) => org.orgId === a.senderOrgId),
      )
      .sort((a, b) => b.id.localeCompare(a.id))
    const body: Schemas['PageResponseAnnouncementView'] = {
      content: visible.slice(page * size, (page + 1) * size).map(toView),
      page,
      size,
      totalElements: visible.length,
      totalPages: Math.max(1, Math.ceil(visible.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.post('*/api/v1/admin/announcements', async ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const body = (await request.json()) as Schemas['AnnouncementCreateRequest']

    if (body.scope === 'ALL' && profile.role !== 'SYS_ADMIN') {
      return problemResponse({
        type: 'about:blank',
        title: '접근 권한이 없습니다',
        status: 403,
        detail: '전체 공지는 시스템 관리자만 발송할 수 있습니다.',
        instance: '/api/v1/admin/announcements',
        code: 'ACCESS_DENIED',
      })
    }
    // 계약 v0.46.0: ORG 범위에서 ORG_ADMIN은 자신이 관리하는 기관에만 발송할 수 있고,
    // 두 기관 이상을 관리하면 대상 기관을 지정해야 한다 (모두 422).
    const administered = profile.managedOrgs.filter((org) => org.role === 'ORG_ADMIN')
    if (body.scope === 'ORG' && isOrgTier(profile.role)) {
      if (body.orgId != null && !administered.some((org) => org.orgId === body.orgId)) {
        return problemResponse({
          type: 'about:blank',
          title: '입력값이 올바르지 않습니다',
          status: 422,
          detail: '요청 값을 확인해 주세요.',
          instance: '/api/v1/admin/announcements',
          code: 'VALIDATION_FAILED',
          errors: [{ field: 'orgId', message: '자기 기관에만 기관 공지를 발송할 수 있습니다.' }],
        })
      }
      if (body.orgId == null && administered.length !== 1) {
        return problemResponse({
          type: 'about:blank',
          title: '입력값이 올바르지 않습니다',
          status: 422,
          detail: '요청 값을 확인해 주세요.',
          instance: '/api/v1/admin/announcements',
          code: 'VALIDATION_FAILED',
          errors: [{ field: 'orgId', message: '기관 공지에는 대상 기관이 필요합니다.' }],
        })
      }
    }
    if (body.scope === 'WORKSPACE' && body.workspaceId == null) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '요청 값을 확인해 주세요.',
        instance: '/api/v1/admin/announcements',
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'workspaceId', message: '대상 워크스페이스를 선택해 주세요.' }],
      })
    }

    const recipientCount =
      body.scope === 'ALL'
        ? 480
        : body.scope === 'ORG'
          ? 132
          : (Object.values(workspaceOptionsByOrg)
              .flat()
              .find((g) => g.id === body.workspaceId)?.memberCount ?? 0)
    const resolvedOrgId = body.orgId ?? administered[0]?.orgId ?? null
    const created: StoredAnnouncement = {
      id: uuid(nextAnnouncementId++),
      senderOrgId: isSysTier(profile.role) ? null : resolvedOrgId,
      title: body.title,
      scope: body.scope,
      orgId: body.scope === 'ORG' ? resolvedOrgId : null,
      workspaceId: body.scope === 'WORKSPACE' ? (body.workspaceId ?? null) : null,
      recipientCount,
      createdAt: new Date().toISOString(),
    }
    announcementStore.unshift(created)
    return HttpResponse.json(toView(created), { status: 201 })
  }),
]
