import { api } from './client'
import { ApiError, toApiError } from './problem'
import type { components } from './schema'

type Schemas = components['schemas']

export type GroupSummary = Schemas['GroupSummary']
export type GroupDetail = Schemas['GroupDetail']
export type GroupMember = Schemas['GroupMember']
export type GroupMemberRole = Schemas['GroupMemberRole']
export type OrgSummary = Schemas['OrgSummary']
export type VmTemplate = Schemas['VmTemplate']
export type CreateVmRequest = Schemas['CreateVmRequest']
export type VmRequestDetail = Schemas['VmRequestDetail']
export type VmRequestPage = Schemas['VmRequestPage']
export type VmRequestStatus = Schemas['VmRequestStatus']
export type VmSummary = Schemas['VmSummary']
export type VmDetail = Schemas['VmDetail']
export type VmPage = Schemas['VmPage']
export type ApprovalContext = Schemas['ApprovalContext']
export type ApproveVmRequest = Schemas['ApproveVmRequest']
export type OrgDetail = Schemas['OrgDetail']
export type UserSummary = Schemas['UserSummary']
export type VmStatus = Schemas['VmStatus']
export type VmDeletion = Schemas['VmDeletion']
export type VmEvent = Schemas['VmEvent']
export type VmEventPage = Schemas['VmEventPage']
export type ProvisioningTaskView = Schemas['ProvisioningTaskView']
export type InitialPasswordResponse = Schemas['InitialPasswordResponse']
export type NodeSummary = Schemas['NodeSummary']
export type IpPoolSummary = Schemas['IpPoolSummary']
export type MessageResponse = Schemas['MessageResponse']

export interface RequestOptions {
  allowedRootDomains: string[]
  reservedSubdomains: string[]
}

/**
 * fetch 단계 예외(네트워크 단절 등)를 한국어 ApiError로 변환한다.
 * openapi-fetch는 HTTP 오류는 `error`로 돌려주지만, 요청 자체가 실패하면
 * 영문 TypeError("Failed to fetch")를 그대로 던지므로 여기서 감싼다.
 */
async function guardNetwork<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(
      null,
      '서버에 연결할 수 없습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.',
    )
  }
}

/* ─── query functions (throw ApiError so useQuery surfaces Korean messages) ─── */

export function fetchGroups(): Promise<GroupSummary[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/groups')
    if (!data) throw toApiError(error, '그룹 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchGroup(groupId: number): Promise<GroupDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/groups/{groupId}', {
      params: { path: { groupId } },
    })
    if (!data) throw toApiError(error, '그룹 정보를 불러오지 못했습니다.')
    return data
  })
}

export function fetchOrgs(): Promise<OrgSummary[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/orgs')
    if (!data) throw toApiError(error, '기관 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchTemplates(): Promise<VmTemplate[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/templates')
    if (!data) throw toApiError(error, '템플릿 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchRequestOptions(): Promise<RequestOptions> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/meta/request-options')
    if (!data) throw toApiError(error, '신청 선택지를 불러오지 못했습니다.')
    return data
  })
}

export function fetchVmRequests(params: {
  status?: VmRequestStatus
  page?: number
  size?: number
}): Promise<VmRequestPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/vm-requests', { params: { query: params } })
    if (!data) throw toApiError(error, '신청 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchVmRequest(requestId: number): Promise<VmRequestDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/vm-requests/{requestId}', {
      params: { path: { requestId } },
    })
    if (!data) throw toApiError(error, '신청 정보를 불러오지 못했습니다.')
    return data
  })
}

export function fetchVms(params: { page?: number; size?: number }): Promise<VmPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/vms', { params: { query: params } })
    if (!data) throw toApiError(error, 'VM 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchVm(vmId: number): Promise<VmDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/vms/{vmId}', { params: { path: { vmId } } })
    if (!data) throw toApiError(error, 'VM 정보를 불러오지 못했습니다.')
    return data
  })
}

/* ─── admin (WP-F3) ─── */

export function fetchAdminVmRequests(params: {
  status?: VmRequestStatus
  orgId?: number
  page?: number
  size?: number
}): Promise<VmRequestPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/vm-requests', {
      params: { query: params },
    })
    if (!data) throw toApiError(error, '신청 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchAdminVmRequest(requestId: number): Promise<VmRequestDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/vm-requests/{requestId}', {
      params: { path: { requestId } },
    })
    if (!data) throw toApiError(error, '신청 정보를 불러오지 못했습니다.')
    return data
  })
}

export function fetchApprovalContext(requestId: number): Promise<ApprovalContext> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/vm-requests/{requestId}/context', {
      params: { path: { requestId } },
    })
    if (!data) throw toApiError(error, '승인 참고 정보를 불러오지 못했습니다.')
    return data
  })
}

/* ─── vm lifecycle (M3) ─── */

export function startVm(vmId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/start', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM을 시작하지 못했습니다.')
    return data
  })
}

export function shutdownVm(vmId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/shutdown', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM을 종료하지 못했습니다.')
    return data
  })
}

export function rebootVm(vmId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/reboot', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM을 재부팅하지 못했습니다.')
    return data
  })
}

export function forceStopVm(vmId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/force-stop', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM을 강제 종료하지 못했습니다.')
    return data
  })
}

export function deleteVm(vmId: number): Promise<VmDeletion> {
  return guardNetwork(async () => {
    const { data, error } = await api.DELETE('/vms/{vmId}', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM 삭제를 접수하지 못했습니다.')
    return data
  })
}

export function cancelVmDeletion(vmId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/cancel-deletion', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, '삭제를 취소하지 못했습니다.')
    return data
  })
}

export function revealInitialPassword(vmId: number): Promise<InitialPasswordResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/initial-password', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, '초기 비밀번호를 열람하지 못했습니다.')
    return data
  })
}

export function fetchVmEvents(
  vmId: number,
  params: { page?: number; size?: number } = {},
): Promise<VmEventPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/vms/{vmId}/events', {
      params: { path: { vmId }, query: params },
    })
    if (!data) throw toApiError(error, 'VM 이벤트 이력을 불러오지 못했습니다.')
    return data
  })
}

/* ─── admin (M3) ─── */

export function fetchAdminNodes(): Promise<NodeSummary[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/nodes')
    if (!data) throw toApiError(error, '노드 현황을 불러오지 못했습니다.')
    return data
  })
}

export function fetchAdminVms(params: {
  orgId?: number
  groupId?: number
  status?: VmStatus
  page?: number
  size?: number
}): Promise<VmPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/vms', { params: { query: params } })
    if (!data) throw toApiError(error, 'VM 목록을 불러오지 못했습니다.')
    return data
  })
}

export function scheduleVmDeletion(
  vmId: number,
  body: { scheduledFor: string; reason: string },
): Promise<VmDeletion> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vms/{vmId}/schedule-delete', {
      params: { path: { vmId } },
      body,
    })
    if (!data) throw toApiError(error, '삭제 예약을 접수하지 못했습니다.')
    return data
  })
}

export function cancelScheduledVmDeletion(vmId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vms/{vmId}/cancel-scheduled-delete', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, '삭제 예약을 취소하지 못했습니다.')
    return data
  })
}

export function emergencyDeleteVm(
  vmId: number,
  confirmName: string,
): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vms/{vmId}/emergency-delete', {
      params: { path: { vmId } },
      body: { confirmName },
    })
    if (!data) throw toApiError(error, '긴급 삭제를 접수하지 못했습니다.')
    return data
  })
}
