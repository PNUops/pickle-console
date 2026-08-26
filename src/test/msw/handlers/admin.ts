import { isOrgTier } from '../../../auth/permissions'
import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { ACCESS_TOKENS, orgAdminUser, problemResponse, regularUser } from './auth'
import { adminReadScope } from './org-scope'
import { flavorStore, orgs, resetFlavorStore } from './reference'
import { uuid } from '../ids'
import {
  accessOf,
  invalidVmStateProblem,
  localDateStr,
  recordVmEvent,
  toVmSummary,
  vmEventStore,
  vmStore,
} from './vms'

type Schemas = components['schemas']
type RequestDetail = Schemas['RequestDetailResponse']
type ApprovalContext = Schemas['ApprovalContextResponse']

/* ─── fixtures: 관리자 큐용 신청 (org 1 + org 2) ─── */

/** 승인 대기(SUBMITTED) 신청 팩토리 — 페이지네이션 테스트용 대량 시딩에 사용. */
export function submittedAdminRequest(n: number): RequestDetail {
  return {
    id: uuid(n),
    workspaceId: uuid(12),
    workspaceName: '캡스톤 3조',
    orgId: uuid(1),
    orgName: '정보컴퓨터공학부 실습지원센터',
    requesterId: regularUser.id,
    requesterName: regularUser.name,
    type: 'VM',
    purpose: `추가 실습 서버 ${n}`,
    courseOrProject: null,
    extraNote: null,
    reqStartDate: null,
    reqEndDate: null,
    displayName: `추가 실습 서버 ${n}`,
    vm: {
      imageId: uuid(1),
      imageName: 'Ubuntu 24.04 LTS',
      flavorId: uuid(2),
      flavorName: '기본형',
      reqVcpu: 2,
      reqMemoryMb: 2048,
      reqDiskGb: 20,
      specReason: null,
      desiredSlug: null,
      desiredSubdomain: null,
      rootDomain: null,
      granted: null,
    },
    status: 'SUBMITTED',
    review: null,
    createdAt: '2026-07-01T10:00:00+09:00',
    updatedAt: '2026-07-01T10:00:00+09:00',
  }
}

function initialAdminRequests(): RequestDetail[] {
  return [
    {
      ...submittedAdminRequest(201),
      purpose: '캡스톤 프로젝트 백엔드 서버 운영',
      courseOrProject: '2026-1 캡스톤디자인 3조',
      reqStartDate: '2026-07-15',
      reqEndDate: '2026-12-20',
      displayName: '캡스톤 백엔드 서버',
      vm: {
        ...submittedAdminRequest(0).vm!,
        desiredSlug: 'capstone-api',
        desiredSubdomain: 'capstone-team3',
        rootDomain: 'pusan.dev',
      },
      createdAt: '2026-07-08T11:30:00+09:00',
      updatedAt: '2026-07-08T11:30:00+09:00',
    },
    {
      ...submittedAdminRequest(202),
      requesterId: uuid(57),
      requesterName: '김철수',
      workspaceId: uuid(13),
      workspaceName: '알고리즘 스터디',
      purpose: '알고리즘 스터디 채점 서버',
      status: 'APPROVED',
      review: {
        reviewerId: orgAdminUser.id,
        reviewerName: orgAdminUser.name,
        decision: 'APPROVE',
        comment: '요청 사양 그대로 승인합니다.',
        grantedStartDate: null,
        grantedEndDate: null,
        decidedAt: '2026-07-07T14:03:00+09:00',
      },
      createdAt: '2026-07-07T09:00:00+09:00',
      updatedAt: '2026-07-07T14:03:00+09:00',
    },
    {
      ...submittedAdminRequest(203),
      purpose: '개인 실험용 서버',
      status: 'REJECTED',
      review: {
        reviewerId: orgAdminUser.id,
        reviewerName: orgAdminUser.name,
        decision: 'REJECT',
        comment: '용도가 불분명합니다. 구체적인 사용 계획을 적어 다시 신청해 주세요.',
        grantedStartDate: null,
        grantedEndDate: null,
        decidedAt: '2026-07-06T16:20:00+09:00',
      },
      createdAt: '2026-07-05T13:00:00+09:00',
      updatedAt: '2026-07-06T16:20:00+09:00',
    },
    {
      ...submittedAdminRequest(204),
      requesterId: uuid(58),
      requesterName: '박영희',
      workspaceId: uuid(21),
      workspaceName: 'AI 동아리',
      orgId: uuid(2),
      orgName: '테스트 기관',
      purpose: 'AI 동아리 모델 학습 서버',
      vm: {
        ...submittedAdminRequest(0).vm!,
        flavorId: uuid(3),
        reqVcpu: 4,
        reqMemoryMb: 4096,
        reqDiskGb: 40,
        specReason: '데이터 전처리와 학습을 병행해 메모리가 더 필요합니다.',
      },
      createdAt: '2026-07-08T09:10:00+09:00',
      updatedAt: '2026-07-08T09:10:00+09:00',
    },
  ]
}

function initialContexts(): Record<string, ApprovalContext> {
  return {
    [uuid(201)]: {
      applicant: {
        id: regularUser.id,
        name: regularUser.name,
        email: regularUser.email,
        signupAt: '2026-03-02T09:00:00+09:00',
        approvedCount: 2,
        rejectedCount: 0,
      },
      applicantResources: {
        activeVms: [
          {
            id: uuid(31),
            name: 'example-dev',
            status: 'RUNNING',
            vcpu: 1,
            memoryMb: 1024,
            diskGb: 10,
            endDate: '2026-08-31',
          },
        ],
        totals: { vcpu: 1, memoryMb: 1024, diskGb: 10 },
      },
      workspace: {
        id: uuid(12),
        name: '캡스톤 3조',
        kind: 'PROJECT',
        members: [
          { userId: uuid(42), name: '홍길동', role: 'OWNER' },
          { userId: uuid(57), name: '김철수', role: 'MEMBER' },
        ],
        activeVms: [],
        totals: { vcpu: 0, memoryMb: 0, diskGb: 0 },
      },
      history: [
        {
          requestId: uuid(88),
          submittedAt: '2026-04-10T13:00:00+09:00',
          status: 'APPROVED',
          decision: 'APPROVE',
          comment: '소규모 개발용으로 승인',
          reviewerName: '김관리',
        },
      ],
      orgHeadroom: {
        allocated: { vcpu: 34, memoryMb: 51200, diskGb: 460 },
        capacity: { cpuThreads: 40, memoryMb: 79872 },
        vcpuOvercommitRatio: 0.85,
        memoryUsageRatio: 0.64,
        warnings: [],
      },
      guidance: '리소스에 여유가 있어 승인이 가능합니다.',
    },
    [uuid(204)]: {
      applicant: {
        id: uuid(58),
        name: '박영희',
        email: 'younghee.park@pusan.ac.kr',
        signupAt: '2026-05-01T10:00:00+09:00',
        approvedCount: 0,
        rejectedCount: 1,
      },
      applicantResources: {
        activeVms: [],
        totals: { vcpu: 0, memoryMb: 0, diskGb: 0 },
      },
      workspace: {
        id: uuid(21),
        name: 'AI 동아리',
        kind: 'TEAM',
        members: [{ userId: uuid(58), name: '박영희', role: 'OWNER' }],
        activeVms: [],
        totals: { vcpu: 0, memoryMb: 0, diskGb: 0 },
      },
      history: [
        {
          requestId: uuid(95),
          submittedAt: '2026-06-01T10:00:00+09:00',
          status: 'REJECTED',
          decision: 'REJECT',
          comment: '용도가 불분명하여 반려합니다.',
          reviewerName: '이시스템',
        },
      ],
      orgHeadroom: {
        allocated: { vcpu: 58, memoryMb: 114688, diskGb: 800 },
        capacity: { cpuThreads: 32, memoryMb: 131072 },
        vcpuOvercommitRatio: 1.81,
        memoryUsageRatio: 0.88,
        warnings: [
          'vCPU 오버커밋 비율이 임계값(1.5)을 초과했습니다',
          '메모리 사용률이 임계값(85%)을 초과했습니다',
        ],
      },
      guidance: '메모리 여유가 부족해 신중한 승인이 필요합니다.',
    },
  }
}

export let adminRequestStore: RequestDetail[] = initialAdminRequests()
let approvalContexts: Record<string, ApprovalContext> = initialContexts()
let nextOrgId = 100

/** Bodies received by decision endpoints, for payload-correctness assertions. */
export let approveBodies: { requestId: string; body: Schemas['ApproveRequestRequest'] }[] = []
export let rejectBodies: { requestId: string; body: { comment: string } }[] = []
export let userPatchBodies: {
  userId: string
  body: { role?: Schemas['UserRole']; orgId?: string | null }
}[] = []

export function resetAdminFixtures() {
  adminRequestStore = initialAdminRequests()
  approvalContexts = initialContexts()
  approveBodies = []
  rejectBodies = []
  userPatchBodies = []
  nextOrgId = 100
  adminOsImages = initialAdminOsImages()
  resetFlavorStore()
  nextFlavorId = 100
}

/** OS 이미지 인벤토리 (전 상태 — 공개 /os-images와 달리 은퇴 리비전 포함). */
function initialAdminOsImages(): Schemas['AdminOsImageResponse'][] {
  return [
    {
      id: uuid(1),
      name: 'ubuntu-24.04',
      displayName: 'Ubuntu 24.04 LTS',
      osFamily: 'ubuntu',
      osVersion: '24.04',
      sshUsername: 'ubuntu',
      version: 2,
      proxmoxVmid: 1000,
      nodeId: uuid(1),
      status: 'ACTIVE',
      minDiskGb: 10,
      notes: null,
    },
    {
      id: uuid(2),
      name: 'ubuntu-24.04',
      displayName: 'Ubuntu 24.04 LTS (구 리비전)',
      osFamily: 'ubuntu',
      osVersion: '24.04',
      sshUsername: 'ubuntu',
      version: 1,
      proxmoxVmid: 1900,
      nodeId: uuid(1),
      status: 'DISABLED',
      minDiskGb: 10,
      notes: '구 계정 구성 리비전',
    },
  ]
}

export let adminOsImages: Schemas['AdminOsImageResponse'][] = initialAdminOsImages()

/* 사양 프리셋 인벤토리는 공개 목록과 공유하는 저장소(flavorStore)를 그대로 쓴다 —
   관리자 목록은 전 상태를, 공개 목록은 ACTIVE만 노출한다. */

/** POST /admin/vm-flavors 로 만들어진 프리셋의 id 채번. */
let nextFlavorId = 100

const notFound = () =>
  problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '요청한 리소스가 존재하지 않습니다.',
    code: 'RESOURCE_NOT_FOUND',
  })

const alreadyDecided = (instance: string) =>
  problemResponse({
    type: 'about:blank',
    title: '이미 처리된 신청입니다',
    status: 409,
    detail: '이 신청은 이미 승인, 반려 또는 취소되었습니다.',
    instance,
    code: 'REQUEST_ALREADY_DECIDED',
  })

/** Known users for PATCH /admin/users/{userId}. */
const knownUsers: Record<string, Schemas['UserSummaryResponse']> = {
  [uuid(42)]: regularUser,
  [uuid(57)]: { id: uuid(57), email: 'cheolsu.kim@pusan.ac.kr', name: '김철수', role: 'USER' },
}


/* ─── fixtures: 노드 현황 (SYS_ADMIN 노드/용량 화면) ─── */

const adminNodes: Schemas['NodeSummaryResponse'][] = [
  {
    id: uuid(1),
    name: 'pve1',
    status: 'ACTIVE',
    cpuThreads: 40,
    memoryMb: 79872,
    vmBridge: 'vmbr2',
    storage: 'local-lvm',
    diskCapacityGb: 900,
    runningVms: 6,
    allocatedVcpu: 14,
    allocatedMemoryMb: 20480,
    cpuOvercommitRatio: 0.35,
    memoryAllocRatio: 0.26,
    cpuWarnThreshold: 3.0,
    memoryWarnThreshold: 0.8,
    ipPool: { id: uuid(1), name: 'guest-pool', cidr: '172.29.0.0/16', allocatedCount: 6, freeCount: 65200 },
  },
  {
    // 임계 초과 경고 배지 확인용 (CPU·메모리 모두 임계값 초과)
    id: uuid(2),
    name: 'pve2',
    status: 'MAINTENANCE',
    cpuThreads: 16,
    memoryMb: 32768,
    vmBridge: 'vmbr2',
    storage: 'local-lvm',
    diskCapacityGb: null,
    runningVms: 12,
    allocatedVcpu: 52,
    allocatedMemoryMb: 28672,
    cpuOvercommitRatio: 3.25,
    memoryAllocRatio: 0.88,
    cpuWarnThreshold: 3.0,
    memoryWarnThreshold: 0.8,
    ipPool: { id: uuid(2), name: 'mgmt-pool', cidr: '172.30.0.0/24', allocatedCount: 240, freeCount: 12 },
  },
]

/**
 * 계약 v0.6.1의 `sort` 재현 — 화이트리스트 키(name/endDate/createdAt, `-` 접두사
 * 내림차순), endDate 미지정은 방향과 무관하게 마지막, 동률·미지정은 id 내림차순.
 */
function adminVmComparator(sort: string | null) {
  type Row = (typeof vmStore)[number]
  const byIdDesc = (a: Row, b: Row) => b.id.localeCompare(a.id)
  if (!sort) return byIdDesc
  const desc = sort.startsWith('-')
  const key = desc ? sort.slice(1) : sort
  return (a: Row, b: Row) => {
    let cmp = 0
    if (key === 'name') cmp = a.name.localeCompare(b.name)
    else if (key === 'createdAt') cmp = a.createdAt.localeCompare(b.createdAt)
    else if (key === 'endDate') {
      if (a.endDate == null || b.endDate == null) {
        if (a.endDate == null && b.endDate == null) return byIdDesc(a, b)
        return a.endDate == null ? 1 : -1
      }
      cmp = a.endDate.localeCompare(b.endDate)
    }
    if (desc) cmp = -cmp
    return cmp !== 0 ? cmp : byIdDesc(a, b)
  }
}

/** 목 스코프용 행위자 조회 — 토큰이 없거나 모르는 값이면 null (스코프 미적용). */
function actorProfileOf(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  return ACCESS_TOKENS[token] ?? null
}

export const adminHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/requests', ({ request }) => {
    const url = new URL(request.url)
    // 계약(v0.2.3): status 미지정 시 모든 상태를 반환한다.
    const status = url.searchParams.get('status')
    const orgId = url.searchParams.get('orgId')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    // 계약 v0.46.0: 기관 계층은 역할을 보유한 기관 안만 본다 (밖은 404 마스킹).
    const profile = actorProfileOf(request)
    const scope = profile ? adminReadScope(profile, orgId, '/api/v1/admin/requests') : null
    if (scope?.notFound) return scope.notFound
    const filtered = adminRequestStore
      .filter((r) => (scope ? scope.matches(r.orgId) : !orgId || r.orgId === orgId))
      .filter((r) => !status || r.status === status)
      .sort((a, b) => b.id.localeCompare(a.id))
    const body: Schemas['PageResponseRequestDetailResponse'] = {
      content: filtered.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.get('*/api/v1/admin/requests/:requestId', ({ request, params }) => {
    const found = adminRequestStore.find((r) => r.id === String(params.requestId))
    if (!found) return notFound()
    // 계약 v0.46.0: 보유 기관 밖의 신청은 존재를 감추는 404다.
    const profile = actorProfileOf(request)
    const scope = profile
      ? adminReadScope(profile, null, `/api/v1/admin/requests/${String(params.requestId)}`)
      : null
    if (scope && !scope.matches(found.orgId)) return notFound()
    return HttpResponse.json(found, { status: 200 })
  }),

  http.get('*/api/v1/admin/requests/:requestId/context', ({ params }) => {
    const context = approvalContexts[String(params.requestId)]
    if (!context) return notFound()
    return HttpResponse.json(context, { status: 200 })
  }),

  http.post('*/api/v1/admin/requests/:requestId/approve', async ({ params, request }) => {
    const requestId = String(params.requestId)
    const found = adminRequestStore.find((r) => r.id === requestId)
    if (!found) return notFound()
    if (found.status !== 'SUBMITTED') {
      return alreadyDecided(`/api/v1/admin/requests/${requestId}/approve`)
    }
    const body = (await request.json()) as Schemas['ApproveRequestRequest']
    approveBodies.push({ requestId, body })
    found.status = 'APPROVED'
    found.review = {
      reviewerId: orgAdminUser.id,
      reviewerName: orgAdminUser.name,
      decision: 'APPROVE',
      comment: body.comment ?? null,
      grantedStartDate: body.grantedStartDate ?? null,
      grantedEndDate: body.grantedEndDate ?? null,
      decidedAt: '2026-07-08T17:00:00+09:00',
    }
    found.updatedAt = '2026-07-08T17:00:00+09:00'
    return HttpResponse.json(found, { status: 200 })
  }),

  http.post('*/api/v1/admin/requests/:requestId/reject', async ({ params, request }) => {
    const requestId = String(params.requestId)
    const found = adminRequestStore.find((r) => r.id === requestId)
    if (!found) return notFound()
    if (found.status !== 'SUBMITTED') {
      return alreadyDecided(`/api/v1/admin/requests/${requestId}/reject`)
    }
    const body = (await request.json()) as { comment: string }
    if (!body.comment) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '반려 사유를 입력해 주세요.',
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'comment', message: '반려 사유를 입력해 주세요.' }],
      })
    }
    rejectBodies.push({ requestId, body })
    found.status = 'REJECTED'
    found.review = {
      reviewerId: orgAdminUser.id,
      reviewerName: orgAdminUser.name,
      decision: 'REJECT',
      comment: body.comment,
      grantedStartDate: null,
      grantedEndDate: null,
      decidedAt: '2026-07-08T17:00:00+09:00',
    }
    found.updatedAt = '2026-07-08T17:00:00+09:00'
    return HttpResponse.json(found, { status: 200 })
  }),

  http.get('*/api/v1/admin/orgs', () =>
    HttpResponse.json(
      orgs.map((org) => ({
        id: org.id,
        name: org.name,
        description: org.description ?? null,
        status: org.status,
        hidden: org.hidden,
        createdAt: '2026-01-05T09:00:00+09:00',
      }) satisfies Schemas['OrgDetailResponse']),
      { status: 200 },
    ),
  ),

  http.post('*/api/v1/admin/orgs', async ({ request }) => {
    const body = (await request.json()) as {
      name: string
      description?: string | null
    }
    const created: Schemas['OrgDetailResponse'] = {
      id: uuid(nextOrgId++),
      name: body.name,
      description: body.description ?? null,
      status: 'ACTIVE',
      hidden: false,
      createdAt: '2026-07-08T17:30:00+09:00',
    }
    orgs.push({
      id: created.id,
      name: created.name,
      description: created.description,
      status: created.status,
      hidden: created.hidden,
    })
    return HttpResponse.json(created, { status: 201 })
  }),

  http.patch('*/api/v1/admin/orgs/:orgId', async ({ params, request }) => {
    const found = orgs.find((org) => org.id === String(params.orgId))
    if (!found) return notFound()
    const body = (await request.json()) as {
      name?: string
      description?: string | null
      status?: Schemas['OrgStatus']
      hidden?: boolean
    }
    if (body.name !== undefined) found.name = body.name
    if (body.description !== undefined) found.description = body.description
    if (body.status !== undefined) found.status = body.status
    if (body.hidden !== undefined) found.hidden = body.hidden
    const detail: Schemas['OrgDetailResponse'] = {
      id: found.id,
      name: found.name,
      description: found.description ?? null,
      status: found.status,
      hidden: found.hidden,
      createdAt: '2026-01-05T09:00:00+09:00',
    }
    return HttpResponse.json(detail, { status: 200 })
  }),

  http.patch('*/api/v1/admin/users/:userId', async ({ params, request }) => {
    const user = knownUsers[String(params.userId)]
    if (!user) {
      return problemResponse({
        type: 'about:blank',
        title: '사용자를 찾을 수 없습니다',
        status: 404,
        detail: '해당 ID의 사용자가 존재하지 않습니다.',
        code: 'RESOURCE_NOT_FOUND',
      })
    }
    const body = (await request.json()) as {
      role?: Schemas['UserRole']
      orgId?: string | null
    }
    if (body.role && isOrgTier(body.role) && body.orgId == null) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '기관 관리자는 관리할 기관을 지정해야 합니다.',
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'orgId', message: '관리할 기관을 선택해 주세요.' }],
      })
    }
    userPatchBodies.push({ userId: String(params.userId), body })
    const updated: Schemas['UserSummaryResponse'] = { ...user, role: body.role ?? user.role }
    return HttpResponse.json(updated, { status: 200 })
  }),

  /* ─── admin VM ops ─── */

  http.get('*/api/v1/admin/nodes', () => HttpResponse.json(adminNodes, { status: 200 })),

  http.patch('*/api/v1/admin/nodes/:nodeId', async ({ params, request }) => {
    const node = adminNodes.find((n) => n.id === String(params.nodeId))
    if (!node) return notFound()
    const body = (await request.json()) as { status: Schemas['NodeStatus'] }
    // adminNodes는 리셋되지 않는 공유 픽스처 — 변이 대신 갱신본만 응답한다.
    return HttpResponse.json({ ...node, status: body.status }, { status: 200 })
  }),

  http.get('*/api/v1/admin/os-images', () =>
    HttpResponse.json(adminOsImages, { status: 200 }),
  ),

  http.patch('*/api/v1/admin/os-images/:imageId', async ({ params, request }) => {
    const image = adminOsImages.find((t) => t.id === String(params.imageId))
    if (!image) return notFound()
    const body = (await request.json()) as { status: Schemas['CatalogStatus'] }
    image.status = body.status
    return HttpResponse.json(image, { status: 200 })
  }),

  http.get('*/api/v1/admin/vm-flavors', () =>
    HttpResponse.json(flavorStore, { status: 200 }),
  ),

  http.post('*/api/v1/admin/vm-flavors', async ({ request }) => {
    const body = (await request.json()) as Schemas['CreateVmFlavorRequest']
    if (flavorStore.some((f) => f.name === body.name)) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '요청 값을 확인해 주세요.',
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'name', message: '이미 사용 중인 프리셋 이름입니다.' }],
      })
    }
    const created: Schemas['VmFlavorResponse'] = {
      id: uuid(nextFlavorId++),
      name: body.name,
      displayName: body.displayName,
      vcpu: body.vcpu,
      memoryMb: body.memoryMb,
      diskGb: body.diskGb,
      status: 'ACTIVE',
      notes: body.notes ?? null,
    }
    flavorStore.push(created)
    return HttpResponse.json(created, { status: 201 })
  }),

  http.patch('*/api/v1/admin/vm-flavors/:flavorId', async ({ params, request }) => {
    const flavor = flavorStore.find((f) => f.id === String(params.flavorId))
    if (!flavor) return notFound()
    const body = (await request.json()) as Schemas['UpdateVmFlavorRequest']
    if (Object.values(body).every((value) => value == null)) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '변경할 값을 하나 이상 지정해 주세요.',
        code: 'VALIDATION_FAILED',
      })
    }
    if (body.displayName != null) flavor.displayName = body.displayName
    if (body.vcpu != null) flavor.vcpu = body.vcpu
    if (body.memoryMb != null) flavor.memoryMb = body.memoryMb
    if (body.diskGb != null) flavor.diskGb = body.diskGb
    // 부분 수정 규칙은 다른 필드와 같다 — null/미지정은 "변경 없음"이고,
    // 빈 문자열이 비고를 지운다 (서버 Texts.blankToNull과 동일).
    if (body.notes != null) flavor.notes = body.notes.trim() === '' ? null : body.notes.trim()
    if (body.status != null) flavor.status = body.status
    return HttpResponse.json(flavor, { status: 200 })
  }),

  http.get('*/api/v1/admin/vms', ({ request }) => {
    const url = new URL(request.url)
    const orgId = url.searchParams.get('orgId')
    const workspaceId = url.searchParams.get('workspaceId')
    const status = url.searchParams.get('status')
    const expiringInDays = url.searchParams.get('expiringInDays')
    const expired = url.searchParams.get('expired')
    const q = url.searchParams.get('q')?.toLowerCase()
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const today = localDateStr(0)
    // 계약 v0.46.0: 기관 계층은 역할을 보유한 기관 안만 본다 (밖은 404 마스킹).
    const profile = actorProfileOf(request)
    const scope = profile ? adminReadScope(profile, orgId, '/api/v1/admin/vms') : null
    if (scope?.notFound) return scope.notFound
    const filtered = vmStore
      .filter((vm) => (scope ? scope.matches(vm.orgId) : !orgId || vm.orgId === orgId))
      .filter((vm) => !workspaceId || vm.workspaceId === workspaceId)
      .filter((vm) => !status || vm.status === status)
      // 계약 v0.6.1: q = 이름/호스트네임 부분일치 (대소문자 무시)
      .filter(
        (vm) =>
          !q ||
          vm.name.toLowerCase().includes(q) ||
          vm.hostname.toLowerCase().includes(q),
      )
      // 계약: expiringInDays = 오늘 ≤ endDate ≤ 오늘+N (만료·삭제 상태 제외)
      .filter(
        (vm) =>
          !expiringInDays ||
          (vm.endDate != null &&
            vm.endDate >= today &&
            vm.endDate <= localDateStr(Number(expiringInDays)) &&
            vm.status !== 'DELETED' &&
            vm.status !== 'DELETING'),
      )
      // 계약: expired=true = endDate < 오늘 (삭제 상태 제외)
      .filter(
        (vm) =>
          expired !== 'true' ||
          (vm.endDate != null &&
            vm.endDate < today &&
            vm.status !== 'DELETED' &&
            vm.status !== 'DELETING'),
      )
      .sort(adminVmComparator(url.searchParams.get('sort')))
    const body: Schemas['PageResponseVmSummaryResponse'] = {
      content: filtered.slice(page * size, (page + 1) * size).map(toVmSummary),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.post('*/api/v1/admin/vms/:vmId/schedule-delete', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFound()
    if (vm.deletion != null || vm.status === 'DELETING' || vm.status === 'DELETED') {
      return invalidVmStateProblem(
        `/api/v1/admin/vms/${vm.id}/schedule-delete`,
        '이미 삭제가 예약되었거나 진행 중인 VM입니다.',
      )
    }
    const body = (await request.json()) as { scheduledFor: string; reason: string }
    const errors: { field: string; message: string }[] = []
    // 계약: 미래 시각만 요구 (최소 통보 하한 폐지 — 미만은 콘솔 경고만)
    if (!body.scheduledFor || new Date(body.scheduledFor).getTime() <= Date.now()) {
      errors.push({
        field: 'scheduledFor',
        message: '삭제 예정일은 미래 시각이어야 합니다.',
      })
    }
    if (!body.reason?.trim()) {
      errors.push({ field: 'reason', message: '삭제 사유를 입력해 주세요.' })
    }
    if (errors.length > 0) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '요청 값을 확인해 주세요.',
        instance: `/api/v1/admin/vms/${vm.id}/schedule-delete`,
        code: 'VALIDATION_FAILED',
        errors,
      })
    }
    const deletion: NonNullable<Schemas['VmDetailResponse']['deletion']> = {
      kind: 'ADMIN',
      scheduledFor: body.scheduledFor,
      requestedAt: '2026-07-08T16:00:00+09:00',
      requestedById: orgAdminUser.id,
      reason: body.reason,
      cancelable: true,
    }
    vm.deletion = deletion
    recordVmEvent(vm.id, {
      type: 'SCHEDULE_DELETE',
      actorId: orgAdminUser.id,
      actorKind: 'ADMIN',
      detail: body.reason,
      createdAt: '2026-07-08T16:00:00+09:00',
    })
    return HttpResponse.json(deletion, { status: 202 })
  }),

  http.post('*/api/v1/admin/vms/:vmId/cancel-scheduled-delete', ({ params }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFound()
    if (vm.deletion == null || vm.deletion.kind === 'FORCE' || vm.status === 'DELETED') {
      return invalidVmStateProblem(
        `/api/v1/admin/vms/${vm.id}/cancel-scheduled-delete`,
        '취소할 수 있는 삭제가 없습니다. 이미 파기가 시작되었거나 완료된 상태일 수 있습니다.',
      )
    }
    const kind = vm.deletion.kind
    vm.deletion = null
    if (kind === 'SELF') vm.status = 'STOPPED'
    recordVmEvent(vm.id, {
      type: 'CANCEL_SCHEDULED_DELETE',
      actorId: orgAdminUser.id,
      actorKind: 'ADMIN',
      detail: null,
      createdAt: '2026-07-08T16:30:00+09:00',
    })
    const message =
      kind === 'SELF'
        ? '삭제가 취소되었습니다. VM은 중지됨 상태로 남으며, 시작은 사용자가 직접 수행합니다.'
        : '삭제가 취소되었습니다. VM의 현재 전원 상태는 그대로 유지됩니다.'
    return HttpResponse.json({ message }, { status: 200 })
  }),

  /* ─── VM 사용 기간 변경 — 만료 연장 ─── */

  http.get('*/api/v1/admin/vms/:vmId', ({ params }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFound()
    // 관리자 조회의 권한은 기관 스코프라 이 VM의 접근 목록과 무관하다 — 서버도
    // myResourceRole을 null로 두고 능력 불리언을 모두 false로 내려준다.
    return HttpResponse.json(
      { ...vm, ...accessOf(null), passwordRevealAllowed: false },
      { status: 200 },
    )
  }),

  http.get('*/api/v1/admin/vms/:vmId/events', ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFound()
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const all = [...(vmEventStore[vm.id] ?? [])].sort((a, b) => b.id.localeCompare(a.id))
    return HttpResponse.json(
      {
        content: all.slice(page * size, (page + 1) * size),
        page,
        size,
        totalElements: all.length,
        totalPages: Math.max(1, Math.ceil(all.length / size)),
      },
      { status: 200 },
    )
  }),

  http.post('*/api/v1/admin/vms/:vmId/start', ({ params }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFound()
    if (vm.status !== 'STOPPED') {
      return invalidVmStateProblem(
        `/api/v1/admin/vms/${vm.id}/start`,
        'STOPPED 상태의 VM만 시작할 수 있습니다.',
      )
    }
    return HttpResponse.json(
      { message: 'VM 시작 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  http.post('*/api/v1/admin/vms/:vmId/shutdown', ({ params }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFound()
    if (vm.status !== 'RUNNING') {
      return invalidVmStateProblem(
        `/api/v1/admin/vms/${vm.id}/shutdown`,
        'RUNNING 상태의 VM만 종료할 수 있습니다.',
      )
    }
    return HttpResponse.json(
      { message: 'VM 종료 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  http.post('*/api/v1/admin/vms/:vmId/reboot', ({ params }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFound()
    return HttpResponse.json(
      { message: 'VM 재부팅 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  http.post('*/api/v1/admin/vms/:vmId/force-stop', ({ params }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFound()
    return HttpResponse.json(
      { message: 'VM 강제 종료 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  http.patch('*/api/v1/admin/vms/:vmId/gateway-block', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFound()
    const body = (await request.json()) as Schemas['VmGatewayBlockUpdateRequest']
    vm.sshGatewayBlocked = body.blocked
    return HttpResponse.json(vm, { status: 200 })
  }),

  http.patch('*/api/v1/admin/vms/:vmId/period', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFound()
    if (vm.status === 'DELETED' || vm.status === 'DELETING' || vm.deletion != null) {
      return invalidVmStateProblem(
        `/api/v1/admin/vms/${vm.id}/period`,
        '삭제가 예약되었거나 진행 중인 VM은 기간을 변경할 수 없습니다.',
      )
    }
    const body = (await request.json()) as Schemas['VmPeriodUpdateRequest']
    const startDate = body.startDate ?? vm.startDate
    if (!body.endDate || body.endDate < localDateStr(0)) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '요청 값을 확인해 주세요.',
        instance: `/api/v1/admin/vms/${vm.id}/period`,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'endDate', message: '종료일은 오늘(KST) 이후여야 합니다.' }],
      })
    }
    if (startDate && body.endDate < startDate) {
      return problemResponse({
        type: 'about:blank',
        title: '입력값이 올바르지 않습니다',
        status: 422,
        detail: '요청 값을 확인해 주세요.',
        instance: `/api/v1/admin/vms/${vm.id}/period`,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'endDate', message: '종료일은 시작일 이후여야 합니다.' }],
      })
    }
    vm.endDate = body.endDate
    if (body.startDate) vm.startDate = body.startDate
    // 계약: 만료 마커 초기화 → 만료 자동 정지된 VM도 다시 시작 가능해진다.
    vm.expiryStoppedAt = null
    vm.updatedAt = new Date().toISOString()
    recordVmEvent(vm.id, {
      type: 'PERIOD_UPDATE',
      actorId: orgAdminUser.id,
      actorKind: 'ADMIN',
      detail: `사용 종료일 변경 → ${body.endDate}`,
      createdAt: new Date().toISOString(),
    })
    return HttpResponse.json(vm, { status: 200 })
  }),

  http.post('*/api/v1/admin/vms/:vmId/force-delete', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === String(params.vmId))
    if (!vm) return notFound()
    const body = (await request.json()) as { confirmName: string }
    if (body.confirmName !== vm.name) {
      return problemResponse({
        type: 'about:blank',
        title: '확인용 이름이 일치하지 않습니다',
        status: 409,
        detail:
          '입력한 이름이 VM 이름과 일치하지 않습니다. VM 이름을 정확히 입력해 주세요.',
        instance: `/api/v1/admin/vms/${vm.id}/force-delete`,
        code: 'VM_CONFIRM_NAME_MISMATCH',
      })
    }
    vm.status = 'DELETED'
    vm.deletion = {
      kind: 'FORCE',
      scheduledFor: '2026-07-08T17:00:00+09:00',
      requestedAt: '2026-07-08T17:00:00+09:00',
      requestedById: uuid(5),
      reason: null,
      cancelable: false,
    }
    recordVmEvent(vm.id, {
      type: 'FORCE_DELETE',
      actorId: uuid(5),
      actorKind: 'ADMIN',
      detail: null,
      createdAt: '2026-07-08T17:00:00+09:00',
    })
    return HttpResponse.json(
      { message: '강제 삭제를 접수했습니다. VM이 즉시 강제 종료되고 파기됩니다.' },
      { status: 202 },
    )
  }),
]
