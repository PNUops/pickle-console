import { isOrgTier, isSysTier } from '../../../auth/permissions'
import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { ACCESS_TOKENS, problemResponse, unauthorizedProblem } from './auth'

type Schemas = components['schemas']
type AnnouncementView = Schemas['AnnouncementView']
type AdminGroupOption = Schemas['AdminGroupOptionResponse']

/* ─── fixtures ─── */

/** 그룹 선택지 — 기관별. SYS_ADMIN은 전체, ORG_ADMIN은 자기 기관 그룹만. */
const groupOptionsByOrg: Record<number, AdminGroupOption[]> = {
  1: [
    {
      id: 12,
      name: '캡스톤 3조',
      slug: 'capstone-team3',
      memberCount: 4,
      kind: 'TEAM',
      createdAt: '2026-06-01T10:00:00+09:00',
    },
    {
      id: 15,
      name: '알고리즘 스터디',
      slug: 'algo-study',
      memberCount: 6,
      kind: 'TEAM',
      createdAt: '2026-06-10T10:00:00+09:00',
    },
  ],
  2: [
    {
      id: 21,
      name: 'AI 동아리',
      slug: 'ai-club',
      memberCount: 5,
      kind: 'PROJECT',
      createdAt: '2026-06-15T10:00:00+09:00',
    },
  ],
}

interface StoredAnnouncement extends AnnouncementView {
  /** 발송자 기관 (ORG_ADMIN 가시성 판정용 — SYS_ADMIN 발송은 null) */
  senderOrgId: number | null
}

function initialAnnouncements(): StoredAnnouncement[] {
  return [
    {
      id: 11,
      senderOrgId: 1,
      title: '7월 정기 점검 안내',
      scope: 'ORG',
      orgId: 1,
      groupId: null,
      recipientCount: 132,
      createdAt: '2026-07-10T11:00:00+09:00',
    },
    {
      id: 10,
      senderOrgId: null,
      title: '플랫폼 오픈 안내',
      scope: 'ALL',
      orgId: null,
      groupId: null,
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

/** 그룹 상세 픽스처 (계약 v0.19.0 — 구성원은 계정 상태 무관 전원). */
const groupDetails: Record<number, Schemas['AdminGroupDetailResponse']> = {
  12: {
    id: 12,
    kind: 'TEAM',
    name: '캡스톤 3조',
    slug: 'capstone-team3',
    description: '캡스톤 디자인 3조',
    createdAt: '2026-06-01T10:00:00+09:00',
    memberCount: 4,
    vmCount: 2,
    members: [
      {
        userId: 42,
        name: '홍길동',
        email: 'example@pusan.ac.kr',
        groupRole: 'OWNER',
        userStatus: 'ACTIVE',
        joinedAt: '2026-06-01T10:00:00+09:00',
      },
      {
        userId: 77,
        name: '박탈퇴',
        email: 'left.park@pusan.ac.kr',
        groupRole: 'MEMBER',
        userStatus: 'WITHDRAWN',
        joinedAt: '2026-06-02T10:00:00+09:00',
      },
    ],
  },
}

export const announcementHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/groups/:groupId', ({ params }) => {
    const detail = groupDetails[Number(params.groupId)]
    if (!detail) {
      return problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: '해당 그룹이 존재하지 않습니다.',
        code: 'RESOURCE_NOT_FOUND',
      })
    }
    return HttpResponse.json(detail, { status: 200 })
  }),

  http.get('*/api/v1/admin/groups', ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const url = new URL(request.url)
    const orgId = url.searchParams.get('orgId')
    if (isOrgTier(profile.role)) {
      // 계약: orgId 필터는 SYS_ADMIN 전용 — 다른 기관 지정 시 404 (존재 비공개)
      if (orgId && Number(orgId) !== profile.orgId) {
        return problemResponse({
          type: 'about:blank',
          title: '리소스를 찾을 수 없습니다',
          status: 404,
          detail: '요청한 리소스가 존재하지 않습니다.',
          instance: '/api/v1/admin/groups',
          code: 'RESOURCE_NOT_FOUND',
        })
      }
      return HttpResponse.json(groupOptionsByOrg[profile.orgId ?? 0] ?? [], { status: 200 })
    }
    const options = orgId
      ? (groupOptionsByOrg[Number(orgId)] ?? [])
      : Object.values(groupOptionsByOrg).flat()
    return HttpResponse.json(options, { status: 200 })
  }),

  http.get('*/api/v1/admin/announcements', ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    // 계약: ORG_ADMIN은 자기 기관 발송분 + ALL 공지
    const visible = announcementStore
      .filter(
        (a) =>
          isSysTier(profile.role) ||
          a.scope === 'ALL' ||
          a.senderOrgId === profile.orgId,
      )
      .sort((a, b) => b.id - a.id)
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
    // 계약: ORG 범위에서 ORG_ADMIN의 orgId는 생략 가능하나, 지정 시 자기 기관과 일치해야 한다 (불일치 422)
    if (
      body.scope === 'ORG' &&
      isOrgTier(profile.role) &&
      body.orgId != null &&
      body.orgId !== profile.orgId
    ) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '요청 값을 확인해 주세요.',
        instance: '/api/v1/admin/announcements',
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'orgId', message: '자기 기관으로만 발송할 수 있습니다.' }],
      })
    }
    if (body.scope === 'GROUP' && body.groupId == null) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '요청 값을 확인해 주세요.',
        instance: '/api/v1/admin/announcements',
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'groupId', message: '대상 그룹을 선택해 주세요.' }],
      })
    }

    const recipientCount =
      body.scope === 'ALL'
        ? 480
        : body.scope === 'ORG'
          ? 132
          : (Object.values(groupOptionsByOrg)
              .flat()
              .find((g) => g.id === body.groupId)?.memberCount ?? 0)
    const created: StoredAnnouncement = {
      id: nextAnnouncementId++,
      senderOrgId: isSysTier(profile.role) ? null : (profile.orgId ?? null),
      title: body.title,
      scope: body.scope,
      orgId: body.scope === 'ORG' ? (body.orgId ?? profile.orgId ?? null) : null,
      groupId: body.scope === 'GROUP' ? (body.groupId ?? null) : null,
      recipientCount,
      createdAt: new Date().toISOString(),
    }
    announcementStore.unshift(created)
    return HttpResponse.json(toView(created), { status: 201 })
  }),
]
