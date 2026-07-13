import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { ACCESS_TOKENS, problemResponse } from './auth'

type Schemas = components['schemas']
type AdminTaskView = Schemas['AdminTaskView']

/* ─── fixtures: 작업(태스크) 큐 (SYS_ADMIN 운영 화면) ─── */

function initialTasks(): AdminTaskView[] {
  return [
    {
      taskId: 77,
      vmId: 58,
      vmName: 'stuck-vm',
      hostname: 'stuck-vm',
      orgId: 1,
      orgName: '정보컴퓨터공학부 실습지원센터',
      jobrunrJobId: '7f9b1a2c-3d4e-5f60-8123-456789abcdef',
      kind: 'PROVISION',
      status: 'NEEDS_ADMIN',
      currentStep: 5,
      totalSteps: 10,
      stepLabel: 'cloud-init 설정 중',
      attempts: 4,
      lastError: 'Proxmox API 응답 시간 초과 (qm set 5058)',
      createdAt: '2026-07-08T12:00:00+09:00',
      updatedAt: '2026-07-08T13:00:00+09:00',
    },
    {
      taskId: 76,
      vmId: 59,
      vmName: 'broken-vm',
      hostname: 'broken-vm',
      orgId: 1,
      orgName: '정보컴퓨터공학부 실습지원센터',
      jobrunrJobId: '11112222-3333-4444-5555-666677778888',
      kind: 'PROVISION',
      status: 'FAILED',
      currentStep: 2,
      totalSteps: 10,
      stepLabel: 'IP 할당 중',
      attempts: 1,
      lastError: 'IP 풀 여유가 없어 생성에 실패했습니다.',
      createdAt: '2026-07-07T12:00:00+09:00',
      updatedAt: '2026-07-07T13:00:00+09:00',
    },
    {
      taskId: 75,
      vmId: 55,
      vmName: 'capstone-team3-api',
      hostname: 'capstone-team3-api',
      orgId: 1,
      orgName: '정보컴퓨터공학부 실습지원센터',
      jobrunrJobId: 'aaaa1111-bbbb-2222-cccc-3333dddd4444',
      kind: 'PROVISION',
      status: 'RUNNING',
      currentStep: 3,
      totalSteps: 10,
      stepLabel: '템플릿 복제 중',
      attempts: 1,
      lastError: null,
      createdAt: '2026-07-08T14:03:05+09:00',
      updatedAt: '2026-07-08T14:03:40+09:00',
    },
    {
      taskId: 74,
      vmId: 61,
      vmName: 'ai-train',
      hostname: 'ai-train',
      orgId: 2,
      orgName: 'SW교육센터',
      jobrunrJobId: '9999aaaa-8888-bbbb-7777-cccc6666dddd',
      kind: 'REINSTALL',
      status: 'DONE',
      currentStep: 10,
      totalSteps: 10,
      stepLabel: '완료',
      attempts: 1,
      lastError: null,
      createdAt: '2026-07-05T09:00:00+09:00',
      updatedAt: '2026-07-05T09:20:00+09:00',
    },
  ]
}

/* ─── fixtures: 드리프트 발견 ─── */

type DriftFindingView = Schemas['DriftFindingView']

function initialDriftFindings(): DriftFindingView[] {
  return [
    {
      id: 9,
      kind: 'MISSING_IN_PROXMOX',
      vmId: 59,
      proxmoxVmid: 5059,
      nodeName: 'pve1',
      summary: 'DB에 등록된 VM(broken-vm, vmid 5059)을 Proxmox에서 찾을 수 없습니다.',
      detail: null,
      status: 'OPEN',
      firstSeenAt: '2026-07-12T03:00:00+09:00',
      lastSeenAt: '2026-07-13T03:00:00+09:00',
      resolvedAt: null,
      resolvedById: null,
      resolvedByEmail: null,
      resolutionNote: null,
    },
    {
      id: 8,
      kind: 'UNMANAGED_GUEST',
      vmId: null,
      proxmoxVmid: 9001,
      nodeName: 'pve1',
      summary: 'Proxmox에 플랫폼이 모르는 게스트(vmid 9001)가 있습니다.',
      detail: null,
      status: 'OPEN',
      firstSeenAt: '2026-07-11T03:00:00+09:00',
      lastSeenAt: '2026-07-13T03:00:00+09:00',
      resolvedAt: null,
      resolvedById: null,
      resolvedByEmail: null,
      resolutionNote: null,
    },
    {
      id: 7,
      kind: 'SPEC_MISMATCH',
      vmId: 56,
      proxmoxVmid: 5056,
      nodeName: 'pve1',
      summary: 'algo-judge의 메모리 설정이 DB(1024MiB)와 실제(2048MiB) 사이에 다릅니다.',
      detail: null,
      status: 'RESOLVED',
      firstSeenAt: '2026-07-08T03:00:00+09:00',
      lastSeenAt: '2026-07-09T03:00:00+09:00',
      resolvedAt: '2026-07-09T10:00:00+09:00',
      resolvedById: 5,
      resolvedByEmail: 'sysadmin.lee@pusan.ac.kr',
      resolutionNote: '실제 스펙을 DB 기준으로 되돌렸습니다.',
    },
    {
      id: 6,
      kind: 'UNMANAGED_GUEST',
      vmId: null,
      proxmoxVmid: 9000,
      nodeName: 'pve1',
      summary: 'Proxmox에 플랫폼이 모르는 게스트(vmid 9000)가 있습니다.',
      detail: null,
      status: 'RESOLVED',
      firstSeenAt: '2026-07-05T03:00:00+09:00',
      lastSeenAt: '2026-07-06T03:00:00+09:00',
      // 조정자가 소멸을 확인해 자동 해결 (resolvedBy* = null)
      resolvedAt: '2026-07-07T03:00:00+09:00',
      resolvedById: null,
      resolvedByEmail: null,
      resolutionNote: null,
    },
  ]
}

/* ─── fixtures: IP 할당 현황 ─── */

type IpAllocationView = Schemas['IpAllocationView']

function initialIpAllocations(): IpAllocationView[] {
  return [
    {
      id: 205,
      poolId: 1,
      poolName: 'pve1-pool',
      ip: '172.29.0.11',
      vmId: 56,
      vmName: 'algo-judge',
      hostname: 'algo-judge',
      status: 'ALLOCATED',
      allocatedAt: '2026-06-20T10:01:00+09:00',
      releasedAt: null,
    },
    {
      id: 204,
      poolId: 1,
      poolName: 'pve1-pool',
      ip: '172.29.0.10',
      vmId: 55,
      vmName: 'capstone-team3-api',
      hostname: 'capstone-team3-api',
      status: 'ALLOCATED',
      allocatedAt: '2026-07-08T14:03:20+09:00',
      releasedAt: null,
    },
    {
      id: 201,
      poolId: 1,
      poolName: 'pve1-pool',
      ip: '172.29.0.5',
      vmId: 60,
      vmName: 'retiring-vm',
      hostname: 'retiring-vm',
      status: 'RELEASED',
      allocatedAt: '2026-05-01T10:00:00+09:00',
      releasedAt: '2026-07-08T14:20:00+09:00',
    },
  ]
}

/* ─── fixtures: 대시보드 요약 ─── */

function initialOrgSummary(): Schemas['OrgDashboardSummary'] {
  return {
    pendingRequestCount: 2,
    recentDecisions14d: { approvedCount: 5, rejectedCount: 1 },
    vmCountsByStatus: { RUNNING: 6, STOPPED: 3, CREATING: 1, ERROR: 1, NEEDS_ADMIN: 1 },
    resource: {
      allocatedVcpu: 34,
      allocatedMemoryMb: 51200,
      allocatedDiskGb: 460,
      capacityVcpu: 40,
      capacityMemoryMb: 79872,
      guidance: '여유가 충분합니다. 요청 스펙 그대로 승인해도 무리가 없습니다.',
    },
    topGroupsByVmCount: [
      { groupId: 12, name: '캡스톤 3조', vmCount: 3 },
      { groupId: 15, name: '알고리즘 스터디', vmCount: 2 },
    ],
    publishedServiceCount: 4,
    expiringVmCount30d: 3,
    attention: { failedTaskCount: 1, needsAdminVmCount: 1, expiredVmCount: 1 },
  }
}

function initialSystemSummary(): Schemas['SystemDashboardSummary'] {
  return {
    nodes: [
      {
        id: 1,
        name: 'pve1',
        status: 'ACTIVE',
        cpuOvercommitRatio: 0.35,
        memoryAllocRatio: 0.26,
        warn: false,
      },
      {
        id: 2,
        name: 'pve2',
        status: 'MAINTENANCE',
        cpuOvercommitRatio: 3.25,
        memoryAllocRatio: 0.88,
        warn: true,
      },
    ],
    vmCountsByStatus: { RUNNING: 18, STOPPED: 7, CREATING: 1, ERROR: 1, NEEDS_ADMIN: 1 },
    tasks: { runningCount: 1, retryingCount: 0, needsAdminCount: 1, failed24hCount: 1 },
    notificationFailureCount: 1,
    certExpiring30dCount: 1,
    openDriftFindingCount: 2,
    ipPools: [
      { id: 1, name: 'pve1-pool', cidr: '172.29.0.0/16', allocatedCount: 6, freeCount: 65200 },
      { id: 2, name: 'pve2-pool', cidr: '172.30.0.0/24', allocatedCount: 240, freeCount: 12 },
    ],
  }
}

export let adminTaskStore: AdminTaskView[] = initialTasks()
export let driftStore: DriftFindingView[] = initialDriftFindings()
export let ipAllocationStore: IpAllocationView[] = initialIpAllocations()
export let orgSummaryFixture: Schemas['OrgDashboardSummary'] = initialOrgSummary()
export let systemSummaryFixture: Schemas['SystemDashboardSummary'] = initialSystemSummary()

export function resetAdminOpsFixtures() {
  adminTaskStore = initialTasks()
  driftStore = initialDriftFindings()
  ipAllocationStore = initialIpAllocations()
  orgSummaryFixture = initialOrgSummary()
  systemSummaryFixture = initialSystemSummary()
}

const notFound = () =>
  problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '요청한 리소스가 존재하지 않습니다.',
    code: 'RESOURCE_NOT_FOUND',
  })

export const adminOpsHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/tasks', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const kind = url.searchParams.get('kind')
    const vmId = url.searchParams.get('vmId')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const filtered = adminTaskStore
      .filter((t) => !status || t.status === status)
      .filter((t) => !kind || t.kind === kind)
      .filter((t) => !vmId || t.vmId === Number(vmId))
      .sort((a, b) => b.taskId - a.taskId)
    const body: Schemas['AdminTaskPage'] = {
      content: filtered.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.post('*/api/v1/admin/tasks/:taskId/retry', ({ params }) => {
    const task = adminTaskStore.find((t) => t.taskId === Number(params.taskId))
    if (!task) return notFound()
    if (task.status !== 'NEEDS_ADMIN') {
      return problemResponse({
        type: 'about:blank',
        title: '재시도할 수 없는 작업입니다',
        status: 409,
        detail: '관리자 개입 대기(NEEDS_ADMIN) 상태의 작업만 재시도할 수 있습니다.',
        instance: `/api/v1/admin/tasks/${task.taskId}/retry`,
        code: 'TASK_NOT_RETRYABLE',
      })
    }
    // 접수 즉시 202 — 비동기 재시도를 흉내내 RETRYING으로 전이해 둔다.
    task.status = 'RETRYING'
    task.updatedAt = new Date().toISOString()
    return HttpResponse.json(
      { message: '작업 재시도를 접수했습니다. 잠시 후 작업 상태가 갱신됩니다.' },
      { status: 202 },
    )
  }),

  /* ─── 드리프트 리포트 ─── */

  http.get('*/api/v1/admin/drift-findings', ({ request }) => {
    const url = new URL(request.url)
    // 계약: status 생략 시 OPEN으로 동작
    const status = url.searchParams.get('status') ?? 'OPEN'
    const kind = url.searchParams.get('kind')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const filtered = driftStore
      .filter((f) => f.status === status)
      .filter((f) => !kind || f.kind === kind)
      .sort((a, b) => b.id - a.id)
    const body: Schemas['DriftFindingPage'] = {
      content: filtered.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.post(
    '*/api/v1/admin/drift-findings/:findingId/resolve',
    async ({ params, request }) => {
      const finding = driftStore.find((f) => f.id === Number(params.findingId))
      if (!finding) return notFound()
      if (finding.status !== 'OPEN') {
        return problemResponse({
          type: 'about:blank',
          title: '이미 해결된 발견입니다',
          status: 409,
          detail: '이 드리프트 발견은 이미 해결 처리되었습니다.',
          instance: `/api/v1/admin/drift-findings/${finding.id}/resolve`,
          code: 'DRIFT_FINDING_ALREADY_RESOLVED',
        })
      }
      const body = (await request.json().catch(() => ({}))) as { note?: string }
      finding.status = 'RESOLVED'
      finding.resolvedAt = new Date().toISOString()
      finding.resolvedById = 5
      finding.resolvedByEmail = 'sysadmin.lee@pusan.ac.kr'
      finding.resolutionNote = body.note ?? null
      return HttpResponse.json(finding, { status: 200 })
    },
  ),

  /* ─── 대시보드 요약 ─── */

  http.get('*/api/v1/admin/summary', ({ request }) => {
    const url = new URL(request.url)
    const orgId = url.searchParams.get('orgId')
    const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const profile = ACCESS_TOKENS[token]
    // 계약: orgId는 SYS_ADMIN 드릴인 전용 — ORG_ADMIN이 다른 기관을 지정하면 404 (존재 비공개)
    if (
      orgId &&
      profile &&
      profile.role !== 'SYS_ADMIN' &&
      Number(orgId) !== profile.orgId
    ) {
      return notFound()
    }
    return HttpResponse.json(orgSummaryFixture, { status: 200 })
  }),

  http.get('*/api/v1/admin/system-summary', () =>
    HttpResponse.json(systemSummaryFixture, { status: 200 }),
  ),

  /* ─── IP 할당 현황 ─── */

  http.get('*/api/v1/admin/ip-allocations', ({ request }) => {
    const url = new URL(request.url)
    const poolId = url.searchParams.get('poolId')
    const status = url.searchParams.get('status')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const filtered = ipAllocationStore
      .filter((a) => !poolId || a.poolId === Number(poolId))
      .filter((a) => !status || a.status === status)
      .sort((a, b) => b.id - a.id)
    const body: Schemas['IpAllocationPage'] = {
      content: filtered.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),
]
