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

/* ─── HTTP 공개·도메인·인증서 (M4A) ─── */
export type PublicationView = Schemas['PublicationView']
export type PublishRequest = Schemas['PublishRequest']
export type UpdatePublicationRequest = Schemas['UpdatePublicationRequest']
export type RouteView = Schemas['RouteView']
export type CertificateView = Schemas['CertificateView']
export type DomainSummary = Schemas['DomainSummary']
export type DomainDetail = Schemas['DomainDetail']
export type DomainVerification = Schemas['DomainVerification']
export type DomainPage = Schemas['DomainPage']
export type DomainStatus = Schemas['DomainStatus']
export type DomainKind = Schemas['DomainKind']
export type RouteStatus = Schemas['RouteStatus']
export type CertificateStatus = Schemas['CertificateStatus']
export type AdminRouteView = Schemas['AdminRouteView']
export type AdminRoutePage = Schemas['AdminRoutePage']
export type AdminDomainView = Schemas['AdminDomainView']
export type AdminDomainPage = Schemas['AdminDomainPage']
export type AdminCertificateView = Schemas['AdminCertificateView']
export type AdminCertificatePage = Schemas['AdminCertificatePage']

/* ─── 알림·운영 콘솔 (M5) ─── */
export type NotificationView = Schemas['NotificationView']
export type NotificationPage = Schemas['NotificationPage']
export type UnreadCountResponse = Schemas['UnreadCountResponse']
export type VmPeriodUpdateRequest = Schemas['VmPeriodUpdateRequest']
export type AdminTaskView = Schemas['AdminTaskView']
export type AdminTaskPage = Schemas['AdminTaskPage']
export type ProvisioningTaskKind = Schemas['ProvisioningTaskKind']
export type ProvisioningTaskStatus = Schemas['ProvisioningTaskStatus']
export type AuditLogView = Schemas['AuditLogView']
export type AuditLogPage = Schemas['AuditLogPage']
export type ActivityEntry = Schemas['ActivityEntry']
export type ActivityPage = Schemas['ActivityPage']
export type SettingView = Schemas['SettingView']

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

/* ─── HTTP 공개·도메인 (M4A, 학생) ─── */

export function publishVm(
  vmId: number,
  body: PublishRequest,
): Promise<PublicationView> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/publish', {
      params: { path: { vmId } },
      body,
    })
    if (!data) throw toApiError(error, 'HTTP 서비스 공개를 접수하지 못했습니다.')
    return data
  })
}

export function updatePublication(
  vmId: number,
  body: UpdatePublicationRequest,
): Promise<PublicationView> {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/vms/{vmId}/publication', {
      params: { path: { vmId } },
      body,
    })
    if (!data) throw toApiError(error, '공개 설정 변경을 접수하지 못했습니다.')
    return data
  })
}

export function unpublishVm(vmId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.DELETE('/vms/{vmId}/publication', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, '공개 해제를 접수하지 못했습니다.')
    return data
  })
}

export function fetchDomains(params: {
  vmId?: number
  status?: DomainStatus
  page?: number
  size?: number
} = {}): Promise<DomainPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/domains', { params: { query: params } })
    if (!data) throw toApiError(error, '도메인 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchDomain(domainId: number): Promise<DomainDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/domains/{domainId}', {
      params: { path: { domainId } },
    })
    if (!data) throw toApiError(error, '도메인 정보를 불러오지 못했습니다.')
    return data
  })
}

export function deleteDomain(domainId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.DELETE('/domains/{domainId}', {
      params: { path: { domainId } },
    })
    if (!data) throw toApiError(error, '도메인 삭제를 접수하지 못했습니다.')
    return data
  })
}

export function verifyDomain(domainId: number): Promise<DomainDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/domains/{domainId}/verify', {
      params: { path: { domainId } },
    })
    if (!data) throw toApiError(error, '도메인 검증 재시도를 접수하지 못했습니다.')
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
  expiringInDays?: number
  expired?: boolean
  page?: number
  size?: number
}): Promise<VmPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/vms', { params: { query: params } })
    if (!data) throw toApiError(error, 'VM 목록을 불러오지 못했습니다.')
    return data
  })
}

/** VM 사용 기간 변경(만료 연장) — 동기 반영이라 갱신된 VM 상세를 돌려받는다. */
export function updateVmPeriod(
  vmId: number,
  body: VmPeriodUpdateRequest,
): Promise<VmDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/admin/vms/{vmId}/period', {
      params: { path: { vmId } },
      body,
    })
    if (!data) throw toApiError(error, '사용 기간을 변경하지 못했습니다.')
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

/* ─── admin: 도메인·라우트·인증서 (M4A) ─── */

export function fetchAdminRoutes(params: {
  orgId?: number
  status?: RouteStatus
  page?: number
  size?: number
} = {}): Promise<AdminRoutePage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/routes', { params: { query: params } })
    if (!data) throw toApiError(error, '라우트 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchAdminDomains(params: {
  orgId?: number
  kind?: DomainKind
  status?: DomainStatus
  page?: number
  size?: number
} = {}): Promise<AdminDomainPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/domains', { params: { query: params } })
    if (!data) throw toApiError(error, '도메인 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchAdminCertificates(params: {
  orgId?: number
  status?: CertificateStatus
  expiringInDays?: number
  page?: number
  size?: number
} = {}): Promise<AdminCertificatePage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/certificates', {
      params: { query: params },
    })
    if (!data) throw toApiError(error, '인증서 목록을 불러오지 못했습니다.')
    return data
  })
}

export function resyncRoutes(): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/routes/resync')
    if (!data) throw toApiError(error, '라우트 재동기화를 접수하지 못했습니다.')
    return data
  })
}

/* ─── 작업 큐 (M5, SYS_ADMIN) ─── */

export function fetchAdminTasks(params: {
  status?: ProvisioningTaskStatus
  kind?: ProvisioningTaskKind
  vmId?: number
  page?: number
  size?: number
} = {}): Promise<AdminTaskPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/tasks', { params: { query: params } })
    if (!data) throw toApiError(error, '작업 목록을 불러오지 못했습니다.')
    return data
  })
}

export function retryAdminTask(taskId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/tasks/{taskId}/retry', {
      params: { path: { taskId } },
    })
    if (!data) throw toApiError(error, '작업 재시도를 접수하지 못했습니다.')
    return data
  })
}

/* ─── 운영 설정 (M5, SYS_ADMIN) ─── */

export function fetchSettings(): Promise<SettingView[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/settings')
    if (!data) throw toApiError(error, '운영 설정을 불러오지 못했습니다.')
    return data
  })
}

export function updateSetting(key: string, value: unknown): Promise<SettingView> {
  return guardNetwork(async () => {
    const { data, error } = await api.PUT('/admin/settings/{key}', {
      params: { path: { key } },
      body: { value },
    })
    if (!data) throw toApiError(error, '설정을 수정하지 못했습니다.')
    return data
  })
}

/* ─── 감사 로그·내 활동 (M5) ─── */

export function fetchAuditLogs(params: {
  actorEmail?: string
  action?: string
  targetType?: string
  targetId?: string
  from?: string
  to?: string
  orgId?: number
  page?: number
  size?: number
} = {}): Promise<AuditLogPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/audit', { params: { query: params } })
    if (!data) throw toApiError(error, '감사 로그를 불러오지 못했습니다.')
    return data
  })
}

export function fetchMyActivity(params: {
  action?: string
  from?: string
  to?: string
  page?: number
  size?: number
} = {}): Promise<ActivityPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/me/activity', { params: { query: params } })
    if (!data) throw toApiError(error, '활동 이력을 불러오지 못했습니다.')
    return data
  })
}

/* ─── 알림 (M5) ─── */

export function fetchNotifications(params: {
  unreadOnly?: boolean
  page?: number
  size?: number
} = {}): Promise<NotificationPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/notifications', { params: { query: params } })
    if (!data) throw toApiError(error, '알림 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchUnreadCount(): Promise<UnreadCountResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/notifications/unread-count')
    if (!data) throw toApiError(error, '읽지 않은 알림 수를 불러오지 못했습니다.')
    return data
  })
}

export function markNotificationRead(notificationId: number): Promise<NotificationView> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/notifications/{notificationId}/read', {
      params: { path: { notificationId } },
    })
    if (!data) throw toApiError(error, '알림을 읽음 처리하지 못했습니다.')
    return data
  })
}

export function markAllNotificationsRead(): Promise<{ updatedCount: number }> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/notifications/read-all')
    if (!data) throw toApiError(error, '알림을 모두 읽음 처리하지 못했습니다.')
    return data
  })
}
