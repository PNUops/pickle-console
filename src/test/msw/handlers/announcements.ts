import { isOrgTier, isSysTier } from '../../../auth/permissions'
import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { ACCESS_TOKENS, problemResponse, unauthorizedProblem } from './auth'
import { uuid } from '../ids'
import { mockAuthorityActor, mockAllowedWorkIds } from '../institution-authority'
import { hasAnyWork, hasWork, workSources, SYS_ADMIN, SYS_READERS } from '../../../auth/institution-authority'
import type { StoredFacts } from '../facts'
import { adminUserStore } from './users'
import { notificationStore } from './notifications'
import { mailDeliveryStore } from './mail-deliveries'
import { workspaceStore } from './workspaces'
import { vmStore } from './vms'
import { orgs } from './reference'

type Schemas = components['schemas']
type AnnouncementView = Schemas['AnnouncementView']
type AdminWorkspaceOption = StoredFacts<Schemas['AdminWorkspaceOptionResponse'], 'memberCount' | 'createdAt'>

/* ─── fixtures ─── */

/** 워크스페이스 선택지 — 기관별. SYS_ADMIN은 전체, ORG_ADMIN은 자기 기관 워크스페이스만. */
const workspaceOptionsByOrg: Record<string, AdminWorkspaceOption[]> = {
  [uuid(1)]: [
    {
      id: uuid(12),
      name: '캡스톤 3조',
      metadataVisible: true, allowedWorkIds: [],
      memberCount: 4,
      kind: 'PROJECT',
      createdAt: '2026-06-01T10:00:00+09:00',
    },
    {
      id: uuid(15),
      name: '알고리즘 스터디',
      metadataVisible: true, allowedWorkIds: [],
      memberCount: 6,
      kind: 'STUDY',
      createdAt: '2026-06-10T10:00:00+09:00',
    },
  ],
  [uuid(2)]: [
    {
      id: uuid(21),
      name: 'AI 동아리',
      metadataVisible: true, allowedWorkIds: [],
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
  for (const key of Object.keys(workspaceDetails)) delete workspaceDetails[key]
  Object.assign(workspaceDetails, structuredClone(initialWorkspaceDetails))
}

function profileOf(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const profile = ACCESS_TOKENS[token]
  return profile ? mockAuthorityActor(profile) : null
}

function toView({ senderOrgId: _senderOrgId, senderUserId: _senderUserId, body: _body, ...view }: StoredAnnouncement): AnnouncementView {
  return view
}

/** 워크스페이스 상세 픽스처 (계약 v0.19.0 — 구성원은 계정 상태 무관 전원). */
type WorkspaceFacts = Omit<StoredFacts<Schemas['AdminWorkspaceDetailResponse'], 'memberCount' | 'vmCount' | 'createdAt'>, 'members'> & { members: StoredFacts<Schemas['AdminWorkspaceMemberResponse'], 'email' | 'joinedAt'>[] }
export const workspaceDetails: Record<string, WorkspaceFacts> = {
  [uuid(12)]: {
    id: uuid(12),
    kind: 'PROJECT',
    name: '캡스톤 3조',
    description: '캡스톤 디자인 3조',
    createdAt: '2026-06-01T10:00:00+09:00',
    memberCount: 4,
    vmCount: 2,
    metadataVisible: true, allowedWorkIds: [],
    canUpdateInfo: false, canInviteMembers: false, canManageMembers: false, canManageOwners: false, canDelete: false, deleteBlockedReason: 'FORBIDDEN',
    members: [
      {
        userId: uuid(42),
        name: '홍길동',
        email: 'example@pusan.ac.kr',
        workspaceRole: 'OWNER',
        userStatus: 'ACTIVE',
        supportDetailVisible: true,
        canChangeRole: false, canRemove: false,
        joinedAt: '2026-06-01T10:00:00+09:00',
      },
      {
        userId: uuid(77),
        name: '박탈퇴',
        email: 'left.park@pusan.ac.kr',
        workspaceRole: 'MEMBER',
        userStatus: 'WITHDRAWN',
        supportDetailVisible: true,
        canChangeRole: false, canRemove: false,
        joinedAt: '2026-06-02T10:00:00+09:00',
      },
      {
        userId: uuid(5), name: '이시스템', email: 'sysadmin.lee@pusan.ac.kr',
        workspaceRole: 'MEMBER', userStatus: 'ACTIVE', supportDetailVisible: false, canChangeRole: false, canRemove: false,
        joinedAt: '2026-10-01T10:00:00+09:00',
      },
    ],
  },
}

const initialWorkspaceDetails = structuredClone(workspaceDetails)

function workspaceWork(profile: NonNullable<ReturnType<typeof profileOf>>, id: string): string[] {
  const linked = Object.entries(workspaceOptionsByOrg).filter(([, rows]) => rows.some((row) => row.id === id)).map(([institution]) => institution)
  const ordinary = mockAllowedWorkIds(profile, { workspaceId: id, qualifiedInstitutionIds: linked }, 'WORKSPACE')
  for (const work of ['vm.roster.issue', 'llm.roster.issue', 'vm.request.decide', 'llm.request.decide', 'domain.request.decide', 'gpu.request.decide']) {
    if (profile.role === 'SYS_ADMIN' || workSources(profile, work).some((source) => hasWork(profile, work, { orgId: source.institutionId, workspaceId: id }))) ordinary.push(work)
  }
  return [...new Set(ordinary)]
}

export const announcementHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/workspaces/:workspaceId/invitations', ({ request, params }) => {
    const actor = profileOf(request)
    return actor && ['workspace.support.read', 'workspace.invitations.manage'].some((work) => hasWork(actor, work, { workspaceId: String(params.workspaceId) }, work.endsWith('.manage') ? SYS_ADMIN : SYS_READERS)) ? HttpResponse.json([]) : forbidden()
  }),
  http.get('*/api/v1/admin/workspaces/:workspaceId', ({ params, request }) => {
    const id = String(params.workspaceId)
    const ordinary = workspaceStore.find((row) => row.detail.id === id)
    const detail = workspaceDetails[id] ?? (ordinary ? {
      id, name: ordinary.detail.name, description: ordinary.detail.description, kind: ordinary.detail.kind, createdAt: ordinary.detail.createdAt,
      metadataVisible: true, allowedWorkIds: [],
      memberCount: ordinary.members.length, vmCount: vmStore.filter((row) => row.workspaceId === id && row.status !== 'DELETED').length,
      members: ordinary.members.map((member) => ({ userId: member.userId, name: member.name, email: member.email, workspaceRole: member.role,
        userStatus: adminUserStore.find((row) => row.id === member.userId)?.status ?? 'ACTIVE', supportDetailVisible: false, canChangeRole: false, canRemove: false, joinedAt: ordinary.detail.createdAt })),
    } : null)
    if (!detail) {
      return problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: '해당 워크스페이스가 존재하지 않습니다.',
        code: 'RESOURCE_NOT_FOUND',
      })
    }
    const actor = profileOf(request)
    if (!actor) return problemResponse(unauthorizedProblem)
    const allowedWorkIds = workspaceWork(actor, id)
    if (allowedWorkIds.length === 0) return forbidden()
    const allowed = (work: string) => allowedWorkIds.includes(work)
    const metadataVisible = allowed('workspace.support.read')
    const info = allowed('workspace.info.update')
    const owner = allowed('workspace.owners.manage') && detail.kind !== 'PERSONAL'
    const member = allowed('workspace.members.manage') && detail.kind !== 'PERSONAL'
    const invite = allowed('workspace.invitations.manage') && detail.kind !== 'PERSONAL'
    const terminate = allowed('workspace.terminate') && detail.kind !== 'PERSONAL'
    const owners = detail.members.filter((row) => row.workspaceRole === 'OWNER').length
    const readMembers = metadataVisible || owner || member
    return HttpResponse.json({ ...detail, metadataVisible, allowedWorkIds,
      createdAt: metadataVisible ? detail.createdAt : null, memberCount: metadataVisible ? detail.memberCount : null,
      vmCount: metadataVisible && hasWork(actor, 'vm.metadata.support.read', { workspaceId: id }, SYS_READERS) ? detail.vmCount : null, description: metadataVisible || info ? detail.description : null,
      canUpdateInfo: info, canInviteMembers: invite, canManageMembers: member, canManageOwners: owner,
      canDelete: terminate && detail.vmCount === 0, deleteBlockedReason: !terminate ? detail.kind === 'PERSONAL' ? 'PERSONAL' : 'FORBIDDEN' : detail.vmCount > 0 ? 'REMAINING_RESOURCES' : null,
      rosterCandidates: allowed('vm.roster.issue') || allowed('llm.roster.issue') ? detail.members.filter((row) => row.userStatus === 'ACTIVE').map((row) => ({ userId: row.userId, name: row.name, role: row.workspaceRole, status: row.userStatus })) : null,
      members: readMembers ? detail.members.map((row) => ({ ...row, email: metadataVisible ? row.email : null, joinedAt: metadataVisible ? row.joinedAt : null,
        canChangeRole: owner && (row.workspaceRole !== 'OWNER' || owners > 1),
        canRemove: row.workspaceRole === 'OWNER' ? owner && owners > 1 : member,
        supportDetailVisible: hasWork(actor, 'student.support.read', {}, SYS_READERS) && (isSysTier(actor.role) || !isSysTier(adminUserStore.find((user) => user.id === row.userId)?.role ?? 'USER')) })) : null,
    }, { status: 200 })
  }),

  http.get('*/api/v1/admin/workspaces', ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    const url = new URL(request.url)
    const orgId = url.searchParams.get('orgId')
    const all = url.searchParams.get('all') === 'true'
    const fixed = Object.entries(workspaceOptionsByOrg).filter(([institution]) => all || !orgId || institution === orgId).flatMap(([, rows]) => rows)
    const rows = [...fixed, ...workspaceStore.map((row) => ({ id: row.detail.id, name: row.detail.name, kind: row.detail.kind,
      memberCount: row.members.length, createdAt: row.detail.createdAt, metadataVisible: true, allowedWorkIds: [] }))]
    const unique = [...new Map(rows.map((row) => [row.id, row])).values()]
    return HttpResponse.json(unique.flatMap((row) => {
      const allowedWorkIds = workspaceWork(profile, row.id)
      if (allowedWorkIds.length === 0) return []
      const metadataVisible = allowedWorkIds.includes('workspace.support.read')
      return [{ ...row, allowedWorkIds, metadataVisible, memberCount: metadataVisible ? row.memberCount : null, createdAt: metadataVisible ? row.createdAt : null }]
    }), { status: 200 })
  }),

  http.get('*/api/v1/admin/announcements', ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    if (!hasAnyWork(profile, ['institution.announcement.read'], SYS_READERS)) return forbidden()
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const visible = announcementStore.filter((row) => visibleAnnouncement(row, profile)).sort((a, b) => b.id.localeCompare(a.id))
    return HttpResponse.json({ content: visible.slice(page * size, (page + 1) * size).map(toView), page, size, totalElements: visible.length, totalPages: Math.ceil(visible.length / size) })
  }),
  http.get('*/api/v1/admin/announcements/:announcementId', ({ request, params }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    if (!hasAnyWork(profile, ['institution.announcement.read'], SYS_READERS)) return forbidden()
    const row = announcementStore.find((item) => item.id === String(params.announcementId) && visibleAnnouncement(item, profile))
    if (!row) return problemResponse({ type: 'about:blank', status: 404, code: 'RESOURCE_NOT_FOUND', title: '발송건을 찾을 수 없습니다' })
    return HttpResponse.json({ ...toView(row), body: row.body })
  }),
  ...(['preview', 'create'] as const).map((operation) => http.post(`*/api/v1/admin/announcements${operation === 'preview' ? '/preview' : ''}`, async ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return problemResponse(unauthorizedProblem)
    if (!hasAnyWork(profile, ['institution.announcement.send', 'workspace.announcement.send'], SYS_ADMIN)) return forbidden()
    const body = await request.json() as Schemas['AnnouncementCreateRequest']
    const resolved = resolveTarget(body, profile)
    if ('error' in resolved) return resolved.error
    const recipients = adminUserStore.filter((row) => row.status === 'ACTIVE' && (body.scope === 'ALL' || (body.scope === 'WORKSPACE' ? row.memberships.some((membership) => membership.workspaceId === resolved.workspaceId) : row.memberships.some((membership) => membership.vmOrgIds?.includes(resolved.orgId!)) || row.managedOrgs.some((held) => held.orgId === resolved.orgId && (held.role === 'ORG_ADMIN' || held.role === 'ORG_MANAGER')))))
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
function visibleAnnouncement(row: StoredAnnouncement, profile: NonNullable<ReturnType<typeof profileOf>>) {
  if (isSysTier(profile.role)) return true
  const sources = workSources(profile, 'institution.announcement.read')
  if (sources.length === 0) return false
  if (row.scope === 'ALL') return true
  const author = adminUserStore.find((candidate) => candidate.id === row.senderUserId)
  return author?.managedOrgs.some((held) => sources.some((source) => source.institutionId === held.orgId)) === true
}
function resolveTarget(body: Schemas['AnnouncementCreateRequest'], profile: NonNullable<ReturnType<typeof profileOf>>): { orgId: string | null; workspaceId: string | null } | { error: Response } {
  if (body.scope === 'ALL' && profile.role !== 'SYS_ADMIN') return { error: forbidden() }
  const errors: { field: string; message: string }[] = []
  if (body.scope === 'ALL' && body.orgId != null) errors.push({ field: 'orgId', message: '전체 공지에는 기관을 지정할 수 없습니다.' })
  if (body.scope !== 'WORKSPACE' && body.workspaceId != null) errors.push({ field: 'workspaceId', message: body.scope === 'ALL' ? '전체 공지에는 워크스페이스를 지정할 수 없습니다.' : '기관 공지에는 워크스페이스를 지정할 수 없습니다.' })
  if (body.scope === 'WORKSPACE' && body.orgId != null) errors.push({ field: 'orgId', message: '워크스페이스 공지에는 기관을 지정할 수 없습니다.' })
  const sources = workSources(profile, 'institution.announcement.send')
  const orgId = body.scope === 'ORG' ? body.orgId ?? (sources.length === 1 ? sources[0].institutionId : null) : null
  if (body.scope === 'ORG' && profile.role !== 'SYS_ADMIN') {
    if (sources.length === 0) return { error: forbidden() }
    if (orgId && !hasWork(profile, 'institution.announcement.send', { orgId }, SYS_ADMIN)) errors.push({ field: 'orgId', message: '자기 기관에만 기관 공지를 발송할 수 있습니다.' })
  }
  if (body.scope === 'ORG' && !orgId) errors.push({ field: 'orgId', message: '기관 공지에는 대상 기관이 필요합니다.' })
  if (body.scope === 'WORKSPACE' && !body.workspaceId) errors.push({ field: 'workspaceId', message: '워크스페이스 공지에는 대상 워크스페이스가 필요합니다.' })
  if (errors.length) return { error: problemResponse({ type: 'about:blank', status: 422, code: 'VALIDATION_FAILED', title: '입력값이 올바르지 않습니다', errors }) }
  if (body.scope === 'ORG' && !orgs.some((org) => org.id === orgId)) return { error: problemResponse({ type: 'about:blank', status: 404, code: 'RESOURCE_NOT_FOUND', title: '해당 기관이 존재하지 않습니다.' }) }
  if (body.scope === 'WORKSPACE' && !workspaceWork(profile, body.workspaceId!).includes('workspace.announcement.send')) return { error: problemResponse({ type: 'about:blank', status: 404, code: 'RESOURCE_NOT_FOUND', title: '대상 워크스페이스를 찾을 수 없습니다' }) }
  return { orgId, workspaceId: body.scope === 'WORKSPACE' ? body.workspaceId ?? null : null }
}
