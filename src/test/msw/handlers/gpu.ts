import { http, HttpResponse } from 'msw'
import type { components } from '../../../api/schema'
import type { Gpu, GpuAllocation, GpuReview } from '../../../api/gpu'
import { uuid } from '../ids'
import { workspaceMembersOf } from './workspaces'
import { vmStore } from './vms'
import { regularUser, problemResponse } from './auth'

type Schemas = components['schemas']
export const gpuFixture: Gpu = { id: uuid(900), nodeId: uuid(9), model: '테스트 GPU', vramMb: 32768, status: 'ACTIVE', available: false }
export function gpuAllocationFixture(patch: Partial<GpuAllocation> = {}): GpuAllocation {
  return {
    id: uuid(901), name: '학습 GPU', status: 'ALLOCATED', connectionStatus: 'NONE', utilizationPercent: null, sampleObservedAt: null,
    workspaceId: uuid(12), workspaceName: '캡스톤 3조', orgId: uuid(1), orgName: '정보컴퓨터공학부 실습지원센터',
    accessLimited: false, ownerNames: [regularUser.name], accessManageAllowed: true, myRole: 'OWNER',
    gpu: gpuFixture, vmId: null, vmName: null, grantedLeaseHours: 48,
    allocatedAt: '2026-09-12T00:00:00Z', leaseEndsAt: '2026-09-14T00:00:00Z', unattachedSince: '2026-09-12T00:00:00Z',
    queuePosition: null, priority: 0, releaseReason: null, error: null,
    createdAt: '2026-09-12T00:00:00Z', updatedAt: '2026-09-12T00:00:00Z', ...patch,
  }
}
export const gpuStore: Gpu[] = []
export const gpuAllocationStore: GpuAllocation[] = []
export const gpuReviewStore: GpuReview[] = []
const gpuGrantStore = new Map<string, Schemas['ResourceAccessGrantView'][]>()
let nextGpuGrantId = 1000
function grantsOf(row: GpuAllocation) {
  let grants = gpuGrantStore.get(row.id)
  if (!grants) {
    grants = [{ id: uuid(909), granteeType: 'USER', role: 'OWNER', user: { userId: regularUser.id, name: regularUser.name, email: regularUser.email }, createdAt: row.createdAt }]
    gpuGrantStore.set(row.id, grants)
  }
  return grants
}
function isRole(role: unknown): role is Schemas['ResourceRole'] { return role === 'OWNER' || role === 'EDITOR' || role === 'MEMBER' || role === 'VIEWER' }
export const gpuActions: { action: string; body: unknown }[] = []
export const gpuAttachmentOptions: Schemas['GpuAttachmentOption'][] = []
export function resetGpuFixtures() {
  gpuGrantStore.clear(); nextGpuGrantId = 1000
  gpuStore.splice(0); gpuAllocationStore.splice(0); gpuReviewStore.splice(0); gpuActions.splice(0); gpuAttachmentOptions.splice(0)
}
function notFound() { return problemResponse({ type: 'about:blank', title: '리소스를 찾을 수 없습니다', status: 404, detail: 'GPU 할당이 존재하지 않습니다.', code: 'RESOURCE_NOT_FOUND' }) }
function find(id: unknown) { return gpuAllocationStore.find((row) => row.id === id) }
function list(request: Request) {
  const params = new URL(request.url).searchParams
  const rows = gpuAllocationStore.filter((row) => (!params.get('workspaceId') || row.workspaceId === params.get('workspaceId')) && (!params.get('orgId') || row.orgId === params.get('orgId')) && (!params.get('status') || row.status === params.get('status')))
  const page = Number(params.get('page') ?? 0), size = Number(params.get('size') ?? 20)
  return HttpResponse.json({ content: rows.slice(page * size, (page + 1) * size), page, size, totalElements: rows.length, totalPages: Math.ceil(rows.length / size) })
}
export const gpuHandlers = [
  http.get('*/api/v1/gpus', () => HttpResponse.json(gpuStore)),
  http.get('*/api/v1/admin/gpus', () => HttpResponse.json(gpuStore)),
  http.get('*/api/v1/gpu-allocations', ({ request }) => list(request)),
  http.get('*/api/v1/admin/gpu-allocations', ({ request }) => list(request)),
  http.get('*/api/v1/gpu-allocations/:allocationId', ({ params }) => { const row = find(params.allocationId); return row ? HttpResponse.json(row) : notFound() }),
  http.get('*/api/v1/admin/gpu-allocations/:allocationId', ({ params }) => { const row = find(params.allocationId); return row ? HttpResponse.json(row) : notFound() }),
  http.get('*/api/v1/gpu-allocations/:allocationId/attachment-options', () => HttpResponse.json(gpuAttachmentOptions)),
  http.get('*/api/v1/gpu-allocations/:allocationId/access', ({ params }) => {
    const row = find(params.allocationId)
    if (!row) return notFound()
    return HttpResponse.json({
      resource: { id: row.id, name: row.name, type: 'GPU', status: row.status, workspaceId: row.workspaceId, workspaceName: row.workspaceName },
      grants: grantsOf(row),
    } satisfies Schemas['ResourceAccessListResponse'])
  }),
  http.post('*/api/v1/gpu-allocations/:allocationId/access', async ({ params, request }) => {
    const row = find(params.allocationId)
    if (!row) return notFound()
    const body: unknown = await request.json()
    if (typeof body !== 'object' || !body || !('role' in body) || !isRole(body.role) || !('granteeType' in body) || (body.granteeType !== 'USER' && body.granteeType !== 'WORKSPACE')) return notFound()
    const member = 'userId' in body ? workspaceMembersOf(row.workspaceId).find((item) => item.userId === body.userId) : null
    if (body.granteeType === 'USER' && !member) return notFound()
    const grant: Schemas['ResourceAccessGrantView'] = { id: uuid(nextGpuGrantId++), role: body.role, granteeType: body.granteeType, user: member ? { userId: member.userId, name: member.name, email: member.email } : null, createdAt: new Date().toISOString() }
    grantsOf(row).push(grant)
    gpuActions.push({ action: 'access-add', body })
    return HttpResponse.json(grant, { status: 201 })
  }),
  http.patch('*/api/v1/gpu-allocations/:allocationId/access/:grantId', async ({ params, request }) => {
    const row = find(params.allocationId)
    if (!row) return notFound()
    const grant = grantsOf(row).find((item) => item.id === params.grantId)
    const body: unknown = await request.json()
    if (!grant || typeof body !== 'object' || !body || !('role' in body) || !isRole(body.role)) return notFound()
    grant.role = body.role
    gpuActions.push({ action: 'access-update', body })
    return HttpResponse.json(grant)
  }),
  http.delete('*/api/v1/gpu-allocations/:allocationId/access/:grantId', ({ params }) => {
    const row = find(params.allocationId)
    if (!row) return notFound()
    const grants = grantsOf(row)
    const index = grants.findIndex((item) => item.id === params.grantId)
    if (index < 0) return notFound()
    grants.splice(index, 1)
    gpuActions.push({ action: 'access-remove', body: null })
    return new HttpResponse(null, { status: 204 })
  }),
  ...(['attach', 'detach', 'release', 'extend'] as const).map((action) => http.post(`*/api/v1/gpu-allocations/:allocationId/${action}`, async ({ params, request }) => {
    const row = find(params.allocationId)
    if (!row) return notFound()
    const body: unknown = await request.json()
    gpuActions.push({ action, body })
    if (action === 'attach' && typeof body === 'object' && body && 'vmId' in body && typeof body.vmId === 'string') {
      row.connectionStatus = 'ATTACHED'; row.vmId = body.vmId
      const vm = vmStore.find((item) => item.id === row.vmId)
      row.vmName = vm?.name ?? gpuAttachmentOptions.find((item) => item.vmId === row.vmId)?.vmName ?? null
      if (vm && row.gpu) vm.gpu = { allocationId: row.id, allocationName: row.name, model: row.gpu.model, connectionStatus: row.connectionStatus, detailAccessAllowed: true }
    }
    if (action === 'detach' || action === 'release') { const vm = vmStore.find((item) => item.id === row.vmId); if (vm) vm.gpu = null }
    if (action === 'detach') { row.connectionStatus = 'NONE'; row.vmId = null; row.vmName = null }
    if (action === 'release') { row.status = 'RELEASED'; row.connectionStatus = 'NONE'; row.vmId = null; row.vmName = null }
    if (action === 'extend' && typeof body === 'object' && body && 'hours' in body && typeof body.hours === 'number' && row.leaseEndsAt) row.leaseEndsAt = new Date(Date.parse(row.leaseEndsAt) + body.hours * 3600000).toISOString()
    return HttpResponse.json(row)
  })),
  ...(['priority', 'reclaim', 'extend', 'reconcile'] as const).map((action) => http.post(`*/api/v1/admin/gpu-allocations/:allocationId/${action}`, async ({ params, request }) => {
    const row = find(params.allocationId)
    if (!row) return notFound()
    const body: unknown = await request.json()
    gpuActions.push({ action, body })
    if (action === 'reconcile') { row.connectionStatus = 'NONE'; row.error = null }
    if (action === 'reclaim') { row.status = 'RELEASED'; row.connectionStatus = 'NONE'; row.vmId = null; row.vmName = null }
    if (typeof body === 'object' && body) {
      if (action === 'priority' && 'priority' in body && typeof body.priority === 'number') row.priority = body.priority
      if (action === 'extend' && 'hours' in body && typeof body.hours === 'number' && row.leaseEndsAt) row.leaseEndsAt = new Date(Date.parse(row.leaseEndsAt) + body.hours * 3600000).toISOString()
    }
    return HttpResponse.json(row)
  })),
  http.get('*/api/v1/admin/gpu-reclaim-reviews', () => HttpResponse.json({ content: gpuReviewStore, page: 0, size: 20, totalElements: gpuReviewStore.length, totalPages: Math.ceil(gpuReviewStore.length / 20) })),
  http.post('*/api/v1/admin/gpu-reclaim-reviews/:reviewId/decision', async ({ params, request }) => {
    const row = gpuReviewStore.find((review) => review.id === params.reviewId)
    if (!row) return notFound()
    const body: unknown = await request.json()
    gpuActions.push({ action: 'decision', body })
    if (typeof body === 'object' && body && 'decision' in body && (body.decision === 'KEEP' || body.decision === 'RECLAIM')) {
      row.decision = body.decision
      row.decisionReason = 'reason' in body && typeof body.reason === 'string' ? body.reason : null
      row.decidedAt = new Date().toISOString()
    }
    return new HttpResponse(null, { status: 204 })
  }),
  http.patch('*/api/v1/admin/gpus/:gpuId', async ({ params, request }) => {
    const row = gpuStore.find((gpu) => gpu.id === params.gpuId)
    if (!row) return notFound()
    const body: unknown = await request.json()
    gpuActions.push({ action: 'status', body })
    if (typeof body === 'object' && body && 'status' in body && (body.status === 'ACTIVE' || body.status === 'MAINTENANCE' || body.status === 'RETIRED')) row.status = body.status
    return HttpResponse.json(row)
  }),
]

/** Development-only data for exercising the UI without calling a live API. */
export function seedGpuPreviewFixtures() {
  resetGpuFixtures()
  const now = new Date()
  const at = now.toISOString()
  const end = new Date(now.getTime() + 48 * 3600000).toISOString()
  gpuStore.push(gpuFixture, { ...gpuFixture, id: uuid(907), model: '복구 확인 GPU', status: 'MAINTENANCE' })
  gpuAllocationStore.push(
    gpuAllocationFixture({ allocatedAt: at, leaseEndsAt: end, unattachedSince: at }),
    gpuAllocationFixture({ id: uuid(903), name: '다음 학습 GPU', status: 'QUEUED', gpu: null, allocatedAt: null, leaseEndsAt: null, queuePosition: 1 }),
    gpuAllocationFixture({ id: uuid(904), name: 'GPU 상태 확인', gpu: gpuStore[1], connectionStatus: 'ERROR', error: 'GPU 연결 상태를 확인해 주세요.', allocatedAt: at, leaseEndsAt: end }),
  )
  const vm = vmStore.find((item) => item.id === uuid(55))
  if (vm) {
    vm.status = 'STOPPED'
    vm.provisioning = null
    vmStore.push({ ...vm, id: uuid(906), name: '다른 노드 VM' }, { ...vm, id: uuid(908), name: '드라이버 준비 중 VM' })
  }
  gpuAttachmentOptions.push(
    { vmId: uuid(55), vmName: 'capstone-team3-api', nodeId: uuid(9), ready: true, reason: null },
    { vmId: uuid(906), vmName: '다른 노드 VM', nodeId: uuid(8), ready: false, reason: '다른 노드의 VM 이동은 아직 지원하지 않습니다.' },
    { vmId: uuid(908), vmName: '드라이버 준비 중 VM', nodeId: uuid(9), ready: false, reason: 'VM의 GPU 드라이버 준비 상태를 확인할 수 없습니다. 관리자에게 준비 상태 확인을 요청해 주세요.' },
  )
  gpuReviewStore.push({ id: uuid(902), allocationId: uuid(901), allocationName: '학습 GPU', reason: 'UNATTACHED', evidence: { reviewHours: 12, unattachedSince: new Date(now.getTime() - 13 * 3600000).toISOString(), evaluatedAt: at }, decision: null, decisionReason: null, createdAt: at, decidedAt: null })
}
