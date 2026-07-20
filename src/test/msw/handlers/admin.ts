import { isOrgTier } from '../../../auth/permissions'
import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { orgAdminUser, problemResponse, studentUser } from './auth'
import { orgs } from './reference'
import {
  invalidVmStateProblem,
  localDateStr,
  recordVmEvent,
  toVmSummary,
  vmStore,
} from './vms'

type Schemas = components['schemas']
type VmRequestDetail = Schemas['VmRequestDetail']
type ApprovalContext = Schemas['ApprovalContext']

/* ─── fixtures: 관리자 큐용 신청 (org 1 + org 2) ─── */

/** 승인 대기(SUBMITTED) 신청 팩토리 — 페이지네이션 테스트용 대량 시딩에 사용. */
export function submittedAdminRequest(id: number): VmRequestDetail {
  return {
    id,
    groupId: 12,
    groupName: '캡스톤 3조',
    orgId: 1,
    orgName: '정보컴퓨터공학부 실습지원센터',
    requesterId: studentUser.id,
    requesterName: studentUser.name,
    templateId: 1,
    purpose: `추가 실습 서버 ${id}`,
    courseOrProject: null,
    specReason: null,
    extraNote: null,
    reqVcpu: 2,
    reqMemoryMb: 2048,
    reqDiskGb: 20,
    reqStartDate: null,
    reqEndDate: null,
    needSsh: true,
    needHttp: false,
    needPublic: false,
    desiredSlug: null,
    desiredSubdomain: null,
    rootDomain: null,
    customDomain: null,
    status: 'SUBMITTED',
    review: null,
    createdAt: '2026-07-01T10:00:00+09:00',
    updatedAt: '2026-07-01T10:00:00+09:00',
  }
}

function initialAdminRequests(): VmRequestDetail[] {
  return [
    {
      ...submittedAdminRequest(201),
      purpose: '캡스톤 프로젝트 백엔드 서버 운영',
      courseOrProject: '2026-1 캡스톤디자인 3조',
      reqStartDate: '2026-07-15',
      reqEndDate: '2026-12-20',
      needHttp: true,
      desiredSlug: 'capstone-api',
      desiredSubdomain: 'capstone-team3',
      rootDomain: 'pickle.pnuops.com',
      createdAt: '2026-07-08T11:30:00+09:00',
      updatedAt: '2026-07-08T11:30:00+09:00',
    },
    {
      ...submittedAdminRequest(202),
      requesterId: 57,
      requesterName: '김철수',
      groupId: 13,
      groupName: '알고리즘 스터디',
      purpose: '알고리즘 스터디 채점 서버',
      status: 'APPROVED',
      review: {
        reviewerId: orgAdminUser.id,
        reviewerName: orgAdminUser.name,
        decision: 'APPROVE',
        comment: '요청 사양 그대로 승인합니다.',
        grantedVcpu: 2,
        grantedMemoryMb: 2048,
        grantedDiskGb: 20,
        grantedTemplateId: 1,
        grantedStartDate: null,
        grantedEndDate: null,
        grantSsh: true,
        grantHttp: false,
        grantPublic: false,
        nodeId: null,
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
        grantedVcpu: null,
        grantedMemoryMb: null,
        grantedDiskGb: null,
        grantedTemplateId: null,
        grantedStartDate: null,
        grantedEndDate: null,
        grantSsh: null,
        grantHttp: null,
        grantPublic: null,
        nodeId: null,
        decidedAt: '2026-07-06T16:20:00+09:00',
      },
      createdAt: '2026-07-05T13:00:00+09:00',
      updatedAt: '2026-07-06T16:20:00+09:00',
    },
    {
      ...submittedAdminRequest(204),
      requesterId: 58,
      requesterName: '박영희',
      groupId: 21,
      groupName: 'AI 동아리',
      orgId: 2,
      orgName: 'SW교육센터',
      templateId: 2,
      purpose: 'AI 동아리 모델 학습 서버',
      specReason: '데이터 전처리와 학습을 병행해 메모리가 더 필요합니다.',
      reqVcpu: 4,
      reqMemoryMb: 4096,
      reqDiskGb: 40,
      createdAt: '2026-07-08T09:10:00+09:00',
      updatedAt: '2026-07-08T09:10:00+09:00',
    },
  ]
}

function initialContexts(): Record<number, ApprovalContext> {
  return {
    201: {
      applicant: {
        id: studentUser.id,
        name: studentUser.name,
        email: studentUser.email,
        signupAt: '2026-03-02T09:00:00+09:00',
        approvedCount: 2,
        rejectedCount: 0,
      },
      applicantResources: {
        activeVms: [
          {
            id: 31,
            name: 'gildong-dev',
            status: 'RUNNING',
            vcpu: 1,
            memoryMb: 1024,
            diskGb: 10,
            endDate: '2026-08-31',
          },
        ],
        totals: { vcpu: 1, memoryMb: 1024, diskGb: 10 },
      },
      group: {
        id: 12,
        name: '캡스톤 3조',
        kind: 'PROJECT',
        members: [
          { userId: 42, name: '홍길동', role: 'OWNER' },
          { userId: 57, name: '김철수', role: 'MEMBER' },
        ],
        activeVms: [],
        totals: { vcpu: 0, memoryMb: 0, diskGb: 0 },
      },
      history: [
        {
          requestId: 88,
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
      guidance: '여유가 충분합니다. 요청 사양 그대로 승인해도 무리가 없습니다.',
    },
    204: {
      applicant: {
        id: 58,
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
      group: {
        id: 21,
        name: 'AI 동아리',
        kind: 'TEAM',
        members: [{ userId: 58, name: '박영희', role: 'OWNER' }],
        activeVms: [],
        totals: { vcpu: 0, memoryMb: 0, diskGb: 0 },
      },
      history: [
        {
          requestId: 95,
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

export let adminVmRequestStore: VmRequestDetail[] = initialAdminRequests()
let approvalContexts: Record<number, ApprovalContext> = initialContexts()
let nextOrgId = 100

/** Bodies received by decision endpoints, for payload-correctness assertions. */
export let approveBodies: { requestId: number; body: Schemas['ApproveVmRequest'] }[] = []
export let rejectBodies: { requestId: number; body: { comment: string } }[] = []
export let userPatchBodies: {
  userId: number
  body: { role?: Schemas['UserRole']; orgId?: number | null }
}[] = []

export function resetAdminFixtures() {
  adminVmRequestStore = initialAdminRequests()
  approvalContexts = initialContexts()
  approveBodies = []
  rejectBodies = []
  userPatchBodies = []
  nextOrgId = 100
}

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
const knownUsers: Record<number, Schemas['UserSummary']> = {
  42: studentUser,
  57: { id: 57, email: 'cheolsu.kim@pusan.ac.kr', name: '김철수', role: 'USER' },
}


/* ─── fixtures: 노드 현황 (SYS_ADMIN 노드/용량 화면) ─── */

const adminNodes: Schemas['NodeSummary'][] = [
  {
    id: 1,
    name: 'pve1',
    status: 'ACTIVE',
    cpuThreads: 40,
    memoryMb: 79872,
    vmBridge: 'vmbr2',
    storage: 'local-lvm',
    runningVms: 6,
    allocatedVcpu: 14,
    allocatedMemoryMb: 20480,
    cpuOvercommitRatio: 0.35,
    memoryAllocRatio: 0.26,
    cpuWarnThreshold: 3.0,
    memoryWarnThreshold: 0.8,
    ipPool: { id: 1, cidr: '172.29.0.0/16', allocatedCount: 6, freeCount: 65200 },
  },
  {
    // 임계 초과 경고 배지 확인용 (CPU·메모리 모두 임계값 초과)
    id: 2,
    name: 'pve2',
    status: 'MAINTENANCE',
    cpuThreads: 16,
    memoryMb: 32768,
    vmBridge: 'vmbr2',
    storage: 'local-lvm',
    runningVms: 12,
    allocatedVcpu: 52,
    allocatedMemoryMb: 28672,
    cpuOvercommitRatio: 3.25,
    memoryAllocRatio: 0.88,
    cpuWarnThreshold: 3.0,
    memoryWarnThreshold: 0.8,
    ipPool: { id: 2, cidr: '172.30.0.0/24', allocatedCount: 240, freeCount: 12 },
  },
]

/**
 * 계약 v0.6.1의 `sort` 재현 — 화이트리스트 키(name/endDate/createdAt, `-` 접두사
 * 내림차순), endDate 미지정은 방향과 무관하게 마지막, 동률·미지정은 id 내림차순.
 */
function adminVmComparator(sort: string | null) {
  type Row = (typeof vmStore)[number]
  const byIdDesc = (a: Row, b: Row) => b.id - a.id
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

export const adminHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/vm-requests', ({ request }) => {
    const url = new URL(request.url)
    // 계약(v0.2.3): status 미지정 시 모든 상태를 반환한다.
    const status = url.searchParams.get('status')
    const orgId = url.searchParams.get('orgId')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const filtered = adminVmRequestStore
      .filter((r) => !status || r.status === status)
      .filter((r) => !orgId || r.orgId === Number(orgId))
      .sort((a, b) => b.id - a.id)
    const body: Schemas['VmRequestPage'] = {
      content: filtered.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.get('*/api/v1/admin/vm-requests/:requestId', ({ params }) => {
    const found = adminVmRequestStore.find((r) => r.id === Number(params.requestId))
    if (!found) return notFound()
    return HttpResponse.json(found, { status: 200 })
  }),

  http.get('*/api/v1/admin/vm-requests/:requestId/context', ({ params }) => {
    const context = approvalContexts[Number(params.requestId)]
    if (!context) return notFound()
    return HttpResponse.json(context, { status: 200 })
  }),

  http.post('*/api/v1/admin/vm-requests/:requestId/approve', async ({ params, request }) => {
    const requestId = Number(params.requestId)
    const found = adminVmRequestStore.find((r) => r.id === requestId)
    if (!found) return notFound()
    if (found.status !== 'SUBMITTED') {
      return alreadyDecided(`/api/v1/admin/vm-requests/${requestId}/approve`)
    }
    const body = (await request.json()) as Schemas['ApproveVmRequest']
    approveBodies.push({ requestId, body })
    found.status = 'APPROVED'
    found.review = {
      reviewerId: orgAdminUser.id,
      reviewerName: orgAdminUser.name,
      decision: 'APPROVE',
      comment: body.comment ?? null,
      grantedVcpu: body.grantedVcpu,
      grantedMemoryMb: body.grantedMemoryMb,
      grantedDiskGb: body.grantedDiskGb,
      grantedTemplateId: body.grantedTemplateId,
      grantedStartDate: body.grantedStartDate ?? null,
      grantedEndDate: body.grantedEndDate ?? null,
      grantSsh: body.grantSsh,
      grantHttp: body.grantHttp,
      grantPublic: body.grantPublic,
      nodeId: body.nodeId ?? null,
      decidedAt: '2026-07-08T17:00:00+09:00',
    }
    found.updatedAt = '2026-07-08T17:00:00+09:00'
    return HttpResponse.json(found, { status: 200 })
  }),

  http.post('*/api/v1/admin/vm-requests/:requestId/reject', async ({ params, request }) => {
    const requestId = Number(params.requestId)
    const found = adminVmRequestStore.find((r) => r.id === requestId)
    if (!found) return notFound()
    if (found.status !== 'SUBMITTED') {
      return alreadyDecided(`/api/v1/admin/vm-requests/${requestId}/reject`)
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
      grantedVcpu: null,
      grantedMemoryMb: null,
      grantedDiskGb: null,
      grantedTemplateId: null,
      grantedStartDate: null,
      grantedEndDate: null,
      grantSsh: null,
      grantHttp: null,
      grantPublic: null,
      nodeId: null,
      decidedAt: '2026-07-08T17:00:00+09:00',
    }
    found.updatedAt = '2026-07-08T17:00:00+09:00'
    return HttpResponse.json(found, { status: 200 })
  }),

  http.post('*/api/v1/admin/orgs', async ({ request }) => {
    const body = (await request.json()) as {
      name: string
      slug: string
      description?: string | null
    }
    if (orgs.some((org) => org.slug === body.slug)) {
      return problemResponse({
        type: 'about:blank',
        title: '이미 사용 중인 slug입니다',
        status: 409,
        detail: `'${body.slug}'은(는) 이미 다른 기관이 사용 중입니다.`,
        code: 'ORG_SLUG_DUPLICATE',
      })
    }
    const created: Schemas['OrgDetail'] = {
      id: nextOrgId++,
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
      status: 'ACTIVE',
      createdAt: '2026-07-08T17:30:00+09:00',
    }
    orgs.push({
      id: created.id,
      name: created.name,
      slug: created.slug,
      description: created.description,
      status: created.status,
    })
    return HttpResponse.json(created, { status: 201 })
  }),

  http.patch('*/api/v1/admin/orgs/:orgId', async ({ params, request }) => {
    const found = orgs.find((org) => org.id === Number(params.orgId))
    if (!found) return notFound()
    const body = (await request.json()) as { name?: string; description?: string | null }
    if (body.name !== undefined) found.name = body.name
    if (body.description !== undefined) found.description = body.description
    const detail: Schemas['OrgDetail'] = {
      id: found.id,
      name: found.name,
      slug: found.slug,
      description: found.description ?? null,
      status: 'ACTIVE',
      createdAt: '2026-01-05T09:00:00+09:00',
    }
    return HttpResponse.json(detail, { status: 200 })
  }),

  http.patch('*/api/v1/admin/users/:userId', async ({ params, request }) => {
    const user = knownUsers[Number(params.userId)]
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
      orgId?: number | null
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
    userPatchBodies.push({ userId: Number(params.userId), body })
    const updated: Schemas['UserSummary'] = { ...user, role: body.role ?? user.role }
    return HttpResponse.json(updated, { status: 200 })
  }),

  /* ─── admin VM ops (M3) ─── */

  http.get('*/api/v1/admin/nodes', () => HttpResponse.json(adminNodes, { status: 200 })),

  http.get('*/api/v1/admin/vms', ({ request }) => {
    const url = new URL(request.url)
    const orgId = url.searchParams.get('orgId')
    const groupId = url.searchParams.get('groupId')
    const status = url.searchParams.get('status')
    const expiringInDays = url.searchParams.get('expiringInDays')
    const expired = url.searchParams.get('expired')
    const q = url.searchParams.get('q')?.toLowerCase()
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const today = localDateStr(0)
    const filtered = vmStore
      .filter((vm) => !orgId || vm.orgId === Number(orgId))
      .filter((vm) => !groupId || vm.groupId === Number(groupId))
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
    const body: Schemas['VmPage'] = {
      content: filtered.slice(page * size, (page + 1) * size).map(toVmSummary),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.post('*/api/v1/admin/vms/:vmId/schedule-delete', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFound()
    if (vm.deletion != null || vm.status === 'DELETING' || vm.status === 'DELETED') {
      return invalidVmStateProblem(
        `/api/v1/admin/vms/${vm.id}/schedule-delete`,
        '이미 삭제가 예약되었거나 진행 중인 VM입니다.',
      )
    }
    const body = (await request.json()) as { scheduledFor: string; reason: string }
    const errors: { field: string; message: string }[] = []
    const minNotice = Date.now() + 7 * 86_400_000
    if (!body.scheduledFor || new Date(body.scheduledFor).getTime() < minNotice) {
      errors.push({
        field: 'scheduledFor',
        message: '삭제 예정일은 최소 통보 기간(7일) 이후여야 합니다.',
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
    const deletion: NonNullable<Schemas['VmDetail']['deletion']> = {
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
      detail: body.reason,
      createdAt: '2026-07-08T16:00:00+09:00',
    })
    return HttpResponse.json(deletion, { status: 202 })
  }),

  http.post('*/api/v1/admin/vms/:vmId/cancel-scheduled-delete', ({ params }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
    if (!vm) return notFound()
    if (vm.deletion == null || vm.deletion.kind === 'FORCE' || vm.status === 'DELETED') {
      return invalidVmStateProblem(
        `/api/v1/admin/vms/${vm.id}/cancel-scheduled-delete`,
        '취소할 수 있는 삭제가 없습니다. 유예 기간이 지났다면 이미 파기된 것입니다.',
      )
    }
    const kind = vm.deletion.kind
    vm.deletion = null
    if (kind === 'SELF') vm.status = 'STOPPED'
    recordVmEvent(vm.id, {
      type: 'CANCEL_SCHEDULED_DELETE',
      actorId: orgAdminUser.id,
      detail: null,
      createdAt: '2026-07-08T16:30:00+09:00',
    })
    const message =
      kind === 'SELF'
        ? '삭제가 취소되었습니다. VM은 중지됨 상태로 남으며, 시작은 사용자가 직접 수행합니다.'
        : '삭제가 취소되었습니다. VM의 현재 전원 상태는 그대로 유지됩니다.'
    return HttpResponse.json({ message }, { status: 200 })
  }),

  /* ─── VM 사용 기간 변경 — 만료 연장 (M5) ─── */

  http.patch('*/api/v1/admin/vms/:vmId/period', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
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
      detail: `사용 종료일 변경 → ${body.endDate}`,
      createdAt: new Date().toISOString(),
    })
    return HttpResponse.json(vm, { status: 200 })
  }),

  http.post('*/api/v1/admin/vms/:vmId/force-delete', async ({ params, request }) => {
    const vm = vmStore.find((v) => v.id === Number(params.vmId))
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
      requestedById: 5,
      reason: null,
      cancelable: false,
    }
    recordVmEvent(vm.id, {
      type: 'FORCE_DELETE',
      actorId: 5,
      detail: null,
      createdAt: '2026-07-08T17:00:00+09:00',
    })
    return HttpResponse.json(
      { message: '강제 삭제를 접수했습니다. VM이 즉시 강제 종료되고 파기됩니다.' },
      { status: 202 },
    )
  }),
]
