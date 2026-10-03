import { isOrgTier, isSysTier } from '../../../auth/permissions'
import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { ACCESS_TOKENS, problemResponse, unauthorizedProblem } from './auth'
import { adminReadScope } from './org-scope'
import { uuid } from '../ids'
import { adminUserStore } from './users'
import { notificationStore } from './notifications'
import { mailDeliveryStore } from './mail-deliveries'
import { orgs } from './reference'

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
      kind: 'PROJECT',
      createdAt: '2026-06-01T10:00:00+09:00',
    },
    {
      id: uuid(15),
      name: '알고리즘 스터디',
      memberCount: 6,
      kind: 'STUDY',
      createdAt: '2026-06-10T10:00:00+09:00',
    },
  ],
  [uuid(2)]: [
    {
      id: uuid(21),
      name: 'AI 동아리',
      memberCount: 5,
      kind: 'CLUB',
      createdAt: '2026-06-15T10:00:00+09:00',
    },
  ],
}

interface StoredAnnouncement extends AnnouncementView {
  /** 발송자 기관 (ORG_ADMIN 가시성 판정용 — SYS_ADMIN 발송은 null) */
  senderOrgId: string | null
  senderUserId: string
  body: string
}

function initialAnnouncements(): StoredAnnouncement[] {
  return [
    {
      id: uuid(11),
      senderOrgId: uuid(1),
      senderUserId: uuid(7),
      body: '정기 점검 중 일부 서비스가 중단됩니다.',
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
      senderUserId: uuid(5),
      body: '플랫폼을 공개했습니다.',
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

function toView({ senderOrgId: _senderOrgId, senderUserId: _senderUserId, body: _body, ...view }: StoredAnnouncement): AnnouncementView {
  return view
}

/** 워크스페이스 상세 픽스처 (계약 v0.19.0 — 구성원은 계정 상태 무관 전원). */
const workspaceDetails: Record<string, Schemas['AdminWorkspaceDetailResponse']> = {
  [uuid(12)]: {
    id: uuid(12),
    kind: 'PROJECT',
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
  // No pending invitations unless a test overrides this.
  http.get('*/api/v1/admin/workspaces/:workspaceId/invitations', () => HttpResponse.json([])),
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
    // all=true: every workspace to any admin role (the admin request screen).
    if (url.searchParams.get('all') === 'true') {
      return HttpResponse.json(Object.values(workspaceOptionsByOrg).flat(), { status: 200 })
    }
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
    if (profile.role === 'USER') return forbidden()
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const visible = announcementStore.filter((row) => visibleAnnouncement(row, profile)).sort((a, b) => b.id.localeCompare(a.id))
    return HttpResponse.json({ content: visible.slice(page * size, (page + 1) * size).map(toView), page, size, totalElements: visible.length, totalPages: Math.ceil(visible.length / size) })
  }),
  http.get('*/api/v1/admin/announcements/:announcementId', ({ request, params }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    if (profile.role === 'USER') return forbidden()
    const row = announcementStore.find((item) => item.id === String(params.announcementId) && visibleAnnouncement(item, profile))
    if (!row) return problemResponse({ type: 'about:blank', status: 404, code: 'RESOURCE_NOT_FOUND', title: '발송건을 찾을 수 없습니다' })
    return HttpResponse.json({ ...toView(row), body: row.body })
  }),
  ...(['preview', 'create'] as const).map((operation) => http.post(`*/api/v1/admin/announcements${operation === 'preview' ? '/preview' : ''}`, async ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    if (profile.role !== 'SYS_ADMIN' && profile.role !== 'ORG_ADMIN') return forbidden()
    const body = await request.json() as Schemas['AnnouncementCreateRequest']
    const resolved = resolveTarget(body, profile)
    if ('error' in resolved) return resolved.error
    const recipients = adminUserStore.filter((row) => row.status === 'ACTIVE' && (body.scope === 'ALL' || (body.scope === 'WORKSPACE' ? row.memberships.some((membership) => membership.workspaceId === resolved.workspaceId) : row.memberships.some((membership) => membership.vmOrgIds.includes(resolved.orgId!)) || row.managedOrgs.some((held) => held.orgId === resolved.orgId && (held.role === 'ORG_ADMIN' || held.role === 'ORG_MANAGER')))))
    const sample = recipients.filter((row) => isSysTier(profile.role) || !isSysTier(row.role)).slice(0, 20).map((row) => ({ userId: row.id, name: row.name, email: row.email }))
    const warnings = recipients.length === 0 ? ['발송 대상자가 0명입니다. 알림과 메일이 생성되지 않습니다.'] : []
    if (isOrgTier(profile.role) && recipients.some((row) => isSysTier(row.role))) warnings.push('일부 발송 대상자는 계정 열람 권한 때문에 예시에 표시되지 않습니다.')
    if (operation === 'preview') return HttpResponse.json({ scope: body.scope, orgId: resolved.orgId, workspaceId: resolved.workspaceId, recipientCount: recipients.length, observedAt: new Date().toISOString(), sample, truncated: recipients.length > sample.length, warnings })
    const created: StoredAnnouncement = { id: uuid(nextAnnouncementId++), senderOrgId: isSysTier(profile.role) ? null : resolved.orgId, senderUserId: profile.id, title: body.title.trim(), body: body.body.trim(), scope: body.scope, orgId: resolved.orgId, workspaceId: resolved.workspaceId, recipientCount: recipients.length, createdAt: new Date().toISOString() }
    announcementStore.unshift(created)
    recipients.forEach((recipient, index) => {
      const id = uuid(20_000 + nextAnnouncementId * 1000 + index)
      notificationStore.push({ id, userId: recipient.id, title: created.title, body: created.body, event: 'announcement', importance: 'NORMAL', linkPath: null, readAt: null, createdAt: created.createdAt })
      mailDeliveryStore.push({ id, notificationId: id, announcementId: created.id, sourceKind: 'NOTIFICATION', title: created.title, event: 'announcement', userId: recipient.id, recipientEmail: recipient.email, currentUserEmail: recipient.email, status: 'PENDING', queueState: 'NORMAL_WAIT', attempts: 0, failureCode: null, nextAttemptAt: created.createdAt, sentAt: null, createdAt: created.createdAt, orgId: resolved.orgId, requestId: null, linkPath: null, policyRevision: null, mailMode: null, legacyAddressUnknown: false, processingUnconfirmed: false, canResend: false, cannotResendReason: 'NOT_FAILED' })
    })
    return HttpResponse.json(toView(created), { status: 201 })
  })),
]

function forbidden() { return problemResponse({ type: 'about:blank', status: 403, code: 'ACCESS_DENIED', title: '발송 권한이 없습니다' }) }
function visibleAnnouncement(row: StoredAnnouncement, profile: Schemas['UserProfileResponse']) {
  if (isSysTier(profile.role) || row.scope === 'ALL') return true
  const author = adminUserStore.find((candidate) => candidate.id === row.senderUserId)
  return !!author?.managedOrgs.some((held) => profile.managedOrgs.some((readable) => readable.orgId === held.orgId))
}
function resolveTarget(body: Schemas['AnnouncementCreateRequest'], profile: Schemas['UserProfileResponse']): { orgId: string | null; workspaceId: string | null } | { error: Response } {
  if (body.scope === 'ALL' && profile.role !== 'SYS_ADMIN') return { error: forbidden() }
  const errors: { field: string; message: string }[] = []
  if (body.scope === 'ALL' && body.orgId != null) errors.push({ field: 'orgId', message: '전체 공지에는 기관을 지정할 수 없습니다.' })
  if (body.scope !== 'WORKSPACE' && body.workspaceId != null) errors.push({ field: 'workspaceId', message: body.scope === 'ALL' ? '전체 공지에는 워크스페이스를 지정할 수 없습니다.' : '기관 공지에는 워크스페이스를 지정할 수 없습니다.' })
  if (body.scope === 'WORKSPACE' && body.orgId != null) errors.push({ field: 'orgId', message: '워크스페이스 공지에는 기관을 지정할 수 없습니다.' })
  const administered = profile.managedOrgs.filter((held) => held.role === 'ORG_ADMIN')
  const orgId = body.scope === 'ORG' ? body.orgId ?? (isOrgTier(profile.role) && administered.length === 1 ? administered[0].orgId : null) : null
  if (body.scope === 'ORG' && isOrgTier(profile.role) && administered.length === 0) return { error: forbidden() }
  if (body.scope === 'ORG' && isOrgTier(profile.role) && body.orgId != null && (!orgs.some((org) => org.id === orgId) || !administered.some((held) => held.orgId === orgId))) errors.push({ field: 'orgId', message: '자기 기관에만 기관 공지를 발송할 수 있습니다.' })
  if (body.scope === 'ORG' && !orgId) errors.push({ field: 'orgId', message: '기관 공지에는 대상 기관이 필요합니다.' })
  if (body.scope === 'WORKSPACE' && !body.workspaceId) errors.push({ field: 'workspaceId', message: '워크스페이스 공지에는 대상 워크스페이스가 필요합니다.' })
  if (errors.length) return { error: problemResponse({ type: 'about:blank', status: 422, code: 'VALIDATION_FAILED', title: '입력값이 올바르지 않습니다', errors }) }
  if (body.scope === 'ORG' && !orgs.some((org) => org.id === orgId)) return { error: problemResponse({ type: 'about:blank', status: 404, code: 'RESOURCE_NOT_FOUND', title: '해당 기관이 존재하지 않습니다.' }) }
  if (body.scope === 'WORKSPACE' && !Object.entries(workspaceOptionsByOrg).some(([heldOrgId, rows]) => (isSysTier(profile.role) || administered.some((held) => held.orgId === heldOrgId)) && rows.some((workspace) => workspace.id === body.workspaceId))) return { error: problemResponse({ type: 'about:blank', status: 404, code: 'RESOURCE_NOT_FOUND', title: '대상 워크스페이스를 찾을 수 없습니다' }) }
  return { orgId, workspaceId: body.scope === 'WORKSPACE' ? body.workspaceId ?? null : null }
}
