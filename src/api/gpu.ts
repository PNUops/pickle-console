import { api } from './client'
import { toApiError } from './problem'
import { guardNetwork, fetchVms, type ResourceRole, type VmAccessGrant, type VmAccessList, type VmSummary } from './queries'
import type { components } from './schema'

type Schemas = components['schemas']
export type Gpu = Schemas['GpuView']
export type GpuAllocation = Schemas['GpuAllocationView']
export type GpuReview = Schemas['GpuReclaimReviewView']

export function fetchGpus() {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/gpus')
    if (!data) throw toApiError(error, 'GPU 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchGpuAllocations(params: { workspaceId?: string; page?: number; size?: number } = {}) {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/gpu-allocations', { params: { query: params } })
    if (!data) throw toApiError(error, 'GPU 할당 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchGpuAllocation(allocationId: string): Promise<GpuAllocation> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/gpu-allocations/{allocationId}', { params: { path: { allocationId } } })
    if (!data) throw toApiError(error, 'GPU 할당을 불러오지 못했습니다.')
    return data
  })
}

/** Exhaust pagination so a selectable VM never disappears behind the first page. */
export async function fetchGpuRequestVms(workspaceId?: string): Promise<VmSummary[]> {
  const first = await fetchVms({ workspaceId, page: 0, size: 100 })
  const result: VmSummary[] = [...first.content]
  for (let page = 1; page < first.totalPages; page++) {
    const response = await fetchVms({ workspaceId, page, size: 100 })
    result.push(...response.content)
  }
  return result
}

export function attachGpu(allocationId: string, vmId: string): Promise<GpuAllocation> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/gpu-allocations/{allocationId}/attach', {
      params: { path: { allocationId } }, body: { vmId, confirmed: true },
    })
    if (!data) throw toApiError(error, 'GPU 연결을 시작하지 못했습니다.')
    return data
  })
}

export function detachGpu(allocationId: string): Promise<GpuAllocation> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/gpu-allocations/{allocationId}/detach', {
      params: { path: { allocationId } }, body: { confirmed: true },
    })
    if (!data) throw toApiError(error, 'GPU 연결 해제를 시작하지 못했습니다.')
    return data
  })
}

export function releaseGpu(allocationId: string): Promise<GpuAllocation> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/gpu-allocations/{allocationId}/release', {
      params: { path: { allocationId } }, body: { confirmed: true },
    })
    if (!data) throw toApiError(error, 'GPU 반납을 시작하지 못했습니다.')
    return data
  })
}

export function extendGpu(allocationId: string, hours: number): Promise<GpuAllocation> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/gpu-allocations/{allocationId}/extend', {
      params: { path: { allocationId } }, body: { hours },
    })
    if (!data) throw toApiError(error, 'GPU 임대를 연장하지 못했습니다.')
    return data
  })
}

export function fetchGpuAccessGrants(allocationId: string): Promise<VmAccessList> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/gpu-allocations/{allocationId}/access', { params: { path: { allocationId } } })
    if (!data) throw toApiError(error, 'GPU 접근 권한을 불러오지 못했습니다.')
    return data
  })
}

export function addGpuAccessGrant(allocationId: string, body: { granteeType: 'USER' | 'WORKSPACE'; userId?: string; role: ResourceRole }): Promise<VmAccessGrant> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/gpu-allocations/{allocationId}/access', { params: { path: { allocationId } }, body })
    if (!data) throw toApiError(error, 'GPU 접근 권한을 부여하지 못했습니다.')
    return data
  })
}

export function updateGpuAccessGrant(allocationId: string, grantId: string, role: ResourceRole): Promise<VmAccessGrant> {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/gpu-allocations/{allocationId}/access/{grantId}', { params: { path: { allocationId, grantId } }, body: { role } })
    if (!data) throw toApiError(error, 'GPU 접근 권한을 변경하지 못했습니다.')
    return data
  })
}

export function removeGpuAccessGrant(allocationId: string, grantId: string): Promise<void> {
  return guardNetwork(async () => {
    const { error, response } = await api.DELETE('/gpu-allocations/{allocationId}/access/{grantId}', { params: { path: { allocationId, grantId } } })
    if (!response.ok) throw toApiError(error, 'GPU 접근 권한을 회수하지 못했습니다.')
  })
}

export function fetchAdminGpus() {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/gpus')
    if (!data) throw toApiError(error, 'GPU 인벤토리를 불러오지 못했습니다.')
    return data
  })
}

export function updateAdminGpu(gpuId: string, body: Schemas['UpdateGpuStatusRequest']) {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/admin/gpus/{gpuId}', { params: { path: { gpuId } }, body })
    if (!data) throw toApiError(error, 'GPU 상태를 변경하지 못했습니다.')
    return data
  })
}

export function fetchAdminGpuAllocations(params: { orgId?: string; workspaceId?: string; page?: number; size?: number; status?: GpuAllocation['status'] } = {}) {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/gpu-allocations', { params: { query: params } })
    if (!data) throw toApiError(error, 'GPU 할당 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchAdminGpuAllocation(allocationId: string): Promise<GpuAllocation> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/gpu-allocations/{allocationId}', { params: { path: { allocationId } } })
    if (!data) throw toApiError(error, 'GPU 할당을 불러오지 못했습니다.')
    return data
  })
}

export function prioritizeGpu(allocationId: string, priority: number, reason: string) {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/gpu-allocations/{allocationId}/priority', { params: { path: { allocationId } }, body: { priority, reason } })
    if (!data) throw toApiError(error, 'GPU 대기 순서를 변경하지 못했습니다.')
    return data
  })
}

export function reclaimGpu(allocationId: string, reason: string) {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/gpu-allocations/{allocationId}/reclaim', { params: { path: { allocationId } }, body: { reason } })
    if (!data) throw toApiError(error, 'GPU 회수를 시작하지 못했습니다.')
    return data
  })
}

export function extendAdminGpu(allocationId: string, hours: number, reason: string) {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/gpu-allocations/{allocationId}/extend', { params: { path: { allocationId } }, body: { hours, reason } })
    if (!data) throw toApiError(error, 'GPU 임대를 연장하지 못했습니다.')
    return data
  })
}

export function fetchGpuReviews(params: { orgId?: string; page?: number; size?: number } = {}) {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/gpu-reclaim-reviews', { params: { query: params } })
    if (!data) throw toApiError(error, 'GPU 회수 검토를 불러오지 못했습니다.')
    return data
  })
}

export function decideGpuReview(reviewId: string, decision: 'KEEP' | 'RECLAIM', reason: string) {
  return guardNetwork(async () => {
    const { error, response } = await api.POST('/admin/gpu-reclaim-reviews/{reviewId}/decision', { params: { path: { reviewId } }, body: { decision, reason } })
    if (!response.ok) throw toApiError(error, 'GPU 검토 결과를 저장하지 못했습니다.')
  })
}

export function fetchGpuAttachmentOptions(allocationId: string) {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/gpu-allocations/{allocationId}/attachment-options', { params: { path: { allocationId } } })
    if (!data) throw toApiError(error, '연결할 VM 목록을 불러오지 못했습니다.')
    return data
  })
}

export function reconcileGpu(allocationId: string, reason: string) {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/gpu-allocations/{allocationId}/reconcile', { params: { path: { allocationId } }, body: { reason } })
    if (!data) throw toApiError(error, 'GPU 상태를 확인하지 못했습니다.')
    return data
  })
}
