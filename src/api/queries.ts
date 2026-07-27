import { api } from './client'
import { ApiError, toApiError } from './problem'
import type { components, operations } from './schema'

type Schemas = components['schemas']

export type GroupSummary = Schemas['GroupSummaryResponse']
export type GroupDetail = Schemas['GroupDetailResponse']
export type GroupMember = Schemas['GroupMemberResponse']
export type GroupMemberRole = Schemas['GroupMemberRole']
export type OrgSummary = Schemas['OrgSummaryResponse']
export type VmTemplate = Schemas['VmTemplateResponse']
export type VmFlavor = Schemas['VmFlavorResponse']
export type CreateVmFlavor = Schemas['CreateVmFlavorRequest']
export type UpdateVmFlavor = Schemas['UpdateVmFlavorRequest']
export type CreateVmRequest = Schemas['CreateVmRequestRequest']
export type VmRequestDetail = Schemas['VmRequestDetailResponse']
export type VmRequestPage = Schemas['PageResponseVmRequestDetailResponse']
export type VmRequestStatus = Schemas['VmRequestStatus']
export type VmSummary = Schemas['VmSummaryResponse']
export type VmDetail = Schemas['VmDetailResponse']
export type VmPage = Schemas['PageResponseVmSummaryResponse']
/** GET /admin/vms sort 화이트리스트 (계약 v0.6.1) */
export type AdminVmSort = NonNullable<
  operations['listAdminVms']['parameters']['query']
>['sort']
export type ApprovalContext = Schemas['ApprovalContextResponse']
export type ApproveVmRequest = Schemas['ApproveVmRequestRequest']
export type OrgDetail = Schemas['OrgDetailResponse']
export type OrgStatus = Schemas['OrgStatus']
export type UserSummary = Schemas['UserSummaryResponse']
export type UserRole = Schemas['UserRole']
export type UserStatus = Schemas['UserStatus']
export type AuthTokenResponse = Schemas['AuthTokenResponse']
/* ─── 계정 수명주기 ─── */
export type UserAdminView = Schemas['UserAdminViewResponse']
export type UserAdminDetail = Schemas['UserAdminDetailResponse']
export type UserAdminPage = Schemas['PageResponseUserAdminViewResponse']
export type UserStatusChange = Schemas['UserStatusChangeResponse']
/** GET /admin/users sort 화이트리스트 (계약 v0.9.0) */
export type AdminUserSort = NonNullable<
  operations['listUsers']['parameters']['query']
>['sort']
export type VmStatus = Schemas['VmStatus']
export type VmDeletion = Schemas['VmDeletionResponse']
export type VmEvent = Schemas['VmEventResponse']
export type VmEventPage = Schemas['PageResponseVmEventResponse']
export type ProvisioningTaskView = Schemas['ProvisioningTaskResponse']
export type VmPasswordResponse = Schemas['VmPasswordResponse']
export type NodeSummary = Schemas['NodeSummaryResponse']
export type AdminTemplate = Schemas['AdminTemplateResponse']
export type TemplateStatus = Schemas['TemplateStatus']

/* ─── SSH 키·VM 설정 ─── */
export type SshKeyView = Schemas['SshKeyView']
export type SshKeyAlgorithm = Schemas['SshKeyAlgorithm']
export type SshKeyCreateRequest = Schemas['SshKeyCreateRequest']
export type SshKeyGenerateRequest = Schemas['SshKeyGenerateRequest']
export type SshKeyPrivateKeyResponse = Schemas['SshKeyPrivateKeyResponse']
export type VmSettingView = Schemas['VmSettingView']
export type VmSettingValueType = Schemas['VmSettingValueType']
export type VmSettingsUpdateRequest = Schemas['VmSettingsUpdateRequest']
export type IpPoolSummary = Schemas['IpPoolSummaryResponse']
export type MessageResponse = Schemas['MessageResponse']

/* ─── 웹 터미널 ─── */
export type TerminalSessionTicket = Schemas['TerminalTicketResponse']
export type TerminalSessionView = Schemas['TerminalSessionView']

/* ─── 2FA·약관 동의 ─── */
export type MfaSetupResponse = Schemas['MfaSetupResponse']
export type MfaRecoveryCodesResponse = Schemas['MfaRecoveryCodesResponse']
export type TermsDocType = Schemas['TermsDocType']
export type TermsVersionView = Schemas['TermsVersionView']
export type TermsDocumentView = Schemas['TermsDocumentView']
export type ConsentView = Schemas['ConsentView']
export type ConsentInput = Schemas['ConsentInput']

/* ─── HTTP 공개·도메인·인증서 ─── */
export type PublicationView = Schemas['PublicationView']
export type PublishRequest = Schemas['PublishRequest']
export type UpdatePublicationRequest = Schemas['UpdatePublicationRequest']
export type RouteView = Schemas['RouteView']
export type CertificateView = Schemas['CertificateView']
export type DomainSummary = Schemas['DomainSummaryView']
export type DomainDetail = Schemas['DomainDetailView']
export type DomainVerification = Schemas['DomainVerificationView']
export type DomainPage = Schemas['PageResponseDomainSummaryView']
export type DomainStatus = Schemas['DomainStatus']
export type DomainKind = Schemas['DomainKind']
export type RouteStatus = Schemas['RouteStatus']
export type CertificateStatus = Schemas['CertificateStatus']
export type AdminRouteView = Schemas['AdminRouteView']
export type AdminRoutePage = Schemas['PageResponseAdminRouteView']
export type AdminDomainView = Schemas['AdminDomainView']
export type AdminDomainPage = Schemas['PageResponseAdminDomainView']
export type AdminCertificateView = Schemas['AdminCertificateView']
export type AdminCertificatePage = Schemas['PageResponseAdminCertificateView']

/* ─── 알림·운영 콘솔 ─── */
export type NotificationView = Schemas['NotificationView']
export type NotificationPage = Schemas['PageResponseNotificationView']
export type UnreadCountResponse = Schemas['UnreadCountResponse']
export type VmPeriodUpdateRequest = Schemas['VmPeriodUpdateRequest']
export type AdminTaskView = Schemas['AdminTaskResponse']
export type AdminTaskPage = Schemas['PageResponseAdminTaskResponse']
export type ProvisioningTaskKind = Schemas['ProvisioningTaskKind']
export type ProvisioningTaskStatus = Schemas['ProvisioningTaskStatus']
export type AuditLogView = Schemas['AuditLogViewResponse']
export type AuditLogPage = Schemas['PageResponseAuditLogViewResponse']
export type ActivityEntry = Schemas['ActivityEntryResponse']
export type ActivityPage = Schemas['PageResponseActivityEntryResponse']
export type SettingView = Schemas['SettingView']
export type DriftFindingView = Schemas['DriftFindingResponse']
export type DriftFindingPage = Schemas['PageResponseDriftFindingResponse']
export type DriftFindingStatus = Schemas['DriftFindingStatus']
export type IpAllocationView = Schemas['IpAllocationResponse']
export type IpAllocationPage = Schemas['PageResponseIpAllocationResponse']
export type IpAllocationStatus = Schemas['AllocationStatus']
export type AdminNotificationView = Schemas['AdminNotificationResponse']
export type AdminNotificationPage = Schemas['PageResponseAdminNotificationResponse']
export type NotificationDeliveryStatus = Schemas['NotificationStatus']
export type AdminGroupOption = Schemas['AdminGroupOptionResponse']
export type AdminGroupDetail = Schemas['AdminGroupDetailResponse']
export type AnnouncementScope = Schemas['AnnouncementScope']
export type AnnouncementCreateRequest = Schemas['AnnouncementCreateRequest']
export type AnnouncementView = Schemas['AnnouncementView']
export type AnnouncementPage = Schemas['PageResponseAnnouncementView']
export type OrgDashboardSummary = Schemas['OrgDashboardSummaryResponse']
export type SystemDashboardSummary = Schemas['SystemDashboardSummaryResponse']

export interface RequestOptions {
  allowedRootDomains: string[]
  reservedSubdomains: string[]
  /** SSH 게이트웨이 접속 호스트 — 신청서의 `ssh <슬러그>@<host>` 미리보기용 (0.12.0). */
  sshHost: string
}

/* ─── 점검 모드·배너·문의처 (GET /meta/status) ─── */
export type SystemStatus = Schemas['SystemStatusResponse']

/**
 * fetch 단계 예외(네트워크 단절 등)를 한국어 ApiError로 변환한다.
 * openapi-fetch는 HTTP 오류는 `error`로 돌려주지만, 요청 자체가 실패하면
 * 영문 TypeError("Failed to fetch")를 그대로 던지므로 여기서 감싼다.
 */
export async function guardNetwork<T>(run: () => Promise<T>): Promise<T> {
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

/** 신청 위저드의 사양 축 — ACTIVE 프리셋만 id 순으로 온다. */
export function fetchVmFlavors(): Promise<VmFlavor[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/vm-flavors')
    if (!data) throw toApiError(error, '사양 프리셋 목록을 불러오지 못했습니다.')
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

/** 공개 시스템 상태(점검 모드·배너·문의처). 로그인 화면·인증 셸이 주기 폴링한다. */
export function fetchSystemStatus(): Promise<SystemStatus> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/meta/status')
    if (!data) throw toApiError(error, '시스템 상태를 불러오지 못했습니다.')
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

/* ─── admin ─── */

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

/* ─── vm lifecycle ─── */

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

export function revealVmPassword(vmId: number): Promise<VmPasswordResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/vms/{vmId}/password', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, '비밀번호를 열람하지 못했습니다.')
    return data
  })
}

/** VM 비밀번호 재생성 (시스템 생성, EDITOR 이상) — 즉시 적용된 새 비밀번호를 돌려받는다. */
export function regenerateVmPassword(vmId: number): Promise<VmPasswordResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/password/regenerate', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, '비밀번호를 재생성하지 못했습니다.')
    return data
  })
}

/* ─── VM별 설정 (EDITOR 이상) ─── */

export function fetchVmSettings(vmId: number): Promise<VmSettingView[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/vms/{vmId}/settings', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM 설정을 불러오지 못했습니다.')
    return data
  })
}

/** 설정 키의 부분 맵을 원자적으로 변경한다 — 갱신된 전체 설정 목록을 돌려받는다. */
export function updateVmSettings(
  vmId: number,
  settings: Record<string, unknown>,
): Promise<VmSettingView[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/vms/{vmId}/settings', {
      params: { path: { vmId } },
      body: { settings },
    })
    if (!data) throw toApiError(error, 'VM 설정을 변경하지 못했습니다.')
    return data
  })
}

/* ─── 내 SSH 키 ─── */

export function fetchMySshKeys(): Promise<SshKeyView[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/me/ssh-keys')
    if (!data) throw toApiError(error, 'SSH 키 목록을 불러오지 못했습니다.')
    return data
  })
}

/** 공개키 붙여넣기 등록 — 409(SSH_KEY_DUPLICATE/LIMIT)·422는 호출부가 problem으로 분기한다. */
export function registerMySshKey(body: SshKeyCreateRequest): Promise<SshKeyView> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/me/ssh-keys', { body })
    if (!data) throw toApiError(error, 'SSH 키를 등록하지 못했습니다.')
    return data
  })
}

/** 서버 생성 키 만들기 — 생성된 키(privateKeyStored=true)를 돌려받는다. */
export function generateMySshKey(body: SshKeyGenerateRequest): Promise<SshKeyView> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/me/ssh-keys/generate', { body })
    if (!data) throw toApiError(error, 'SSH 키를 만들지 못했습니다.')
    return data
  })
}

/** 서버 생성 키의 개인키 재다운로드 (매 다운로드 감사) — 붙여넣기 키는 404. */
export function downloadMySshKeyPrivateKey(
  keyId: number,
): Promise<SshKeyPrivateKeyResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/me/ssh-keys/{keyId}/private-key', {
      params: { path: { keyId } },
    })
    if (!data) throw toApiError(error, '개인키를 다운로드하지 못했습니다.')
    return data
  })
}

export function deleteMySshKey(keyId: number): Promise<void> {
  return guardNetwork(async () => {
    const { error, response } = await api.DELETE('/me/ssh-keys/{keyId}', {
      params: { path: { keyId } },
    })
    if (!response.ok) throw toApiError(error, 'SSH 키를 삭제하지 못했습니다.')
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

/* ─── 웹 터미널 ─── */

/**
 * 웹 터미널 1회용 접속 티켓 발급 (POST /vms/{vmId}/terminal-sessions).
 * 실패는 ApiError로 던져 호출부(훅)가 Problem code로 한국어 메시지를 분기한다.
 */
export function createTerminalSession(vmId: number): Promise<TerminalSessionTicket> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/terminal-sessions', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, '터미널 접속 티켓을 발급하지 못했습니다.')
    return data
  })
}

/** 라이브 웹 터미널 세션 목록 (관리자). 배열 반환 — 페이지 없음. */
export function fetchAdminTerminalSessions(): Promise<TerminalSessionView[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/terminal-sessions')
    if (!data) throw toApiError(error, '터미널 세션 목록을 불러오지 못했습니다.')
    return data
  })
}

/** 웹 터미널 세션 강제 종료 (SYS_ADMIN, 멱등 204). */
export function terminateTerminalSession(sessionId: string): Promise<void> {
  return guardNetwork(async () => {
    const { error, response } = await api.POST(
      '/admin/terminal-sessions/{sessionId}/terminate',
      { params: { path: { sessionId } } },
    )
    if (!response.ok) throw toApiError(error, '터미널 세션을 종료하지 못했습니다.')
  })
}

/* ─── HTTP 공개·도메인 (사용자) ─── */

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

/* ─── admin ─── */

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
  q?: string
  sort?: AdminVmSort
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
    if (!data) throw toApiError(error, '일반 삭제를 접수하지 못했습니다.')
    return data
  })
}

export function cancelScheduledVmDeletion(vmId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vms/{vmId}/cancel-scheduled-delete', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, '접수된 삭제를 취소하지 못했습니다.')
    return data
  })
}

export function forceDeleteVm(
  vmId: number,
  confirmName: string,
): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vms/{vmId}/force-delete', {
      params: { path: { vmId } },
      body: { confirmName },
    })
    if (!data) throw toApiError(error, '강제 삭제를 접수하지 못했습니다.')
    return data
  })
}

/* ─── admin: 도메인·라우트·인증서 ─── */

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

/* ─── 작업 큐 (SYS_ADMIN) ─── */

export function fetchAdminTasks(params: {
  status?: ProvisioningTaskStatus
  kind?: ProvisioningTaskKind
  vmId?: number
  page?: number
  size?: number
} = {}): Promise<AdminTaskPage> {
  return guardNetwork(async () => {
    // 계약 v0.9.0에서 status가 다중값(배열)이 됐다 — 화면은 아직 단일 선택이라
    // 여기서 배열로 감싼다 (다중 선택 UI가 생기면 시그니처를 배열로 올린다).
    const { status, ...rest } = params
    const { data, error } = await api.GET('/admin/tasks', {
      params: { query: { ...rest, status: status ? [status] : undefined } },
    })
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

/* ─── 운영 설정 (SYS_ADMIN) ─── */

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

/* ─── 대시보드 요약 ─── */

export function fetchAdminSummary(params: { orgId?: number } = {}): Promise<OrgDashboardSummary> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/summary', { params: { query: params } })
    if (!data) throw toApiError(error, '대시보드 요약을 불러오지 못했습니다.')
    return data
  })
}

export function fetchSystemSummary(): Promise<SystemDashboardSummary> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/system-summary')
    if (!data) throw toApiError(error, '시스템 요약을 불러오지 못했습니다.')
    return data
  })
}

/* ─── 알림 발송 로그·공지 ─── */

export function fetchAdminNotifications(params: {
  status?: NotificationDeliveryStatus
  event?: string
  email?: string
  page?: number
  size?: number
} = {}): Promise<AdminNotificationPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/notifications', {
      params: { query: params },
    })
    if (!data) throw toApiError(error, '알림 발송 로그를 불러오지 못했습니다.')
    return data
  })
}

export function resendAdminNotification(notificationId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/notifications/{notificationId}/resend', {
      params: { path: { notificationId } },
    })
    if (!data) throw toApiError(error, '알림 재발송을 접수하지 못했습니다.')
    return data
  })
}

export function fetchAdminGroups(params: { orgId?: number } = {}): Promise<AdminGroupOption[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/groups', { params: { query: params } })
    if (!data) throw toApiError(error, '그룹 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchAdminGroup(groupId: number): Promise<AdminGroupDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/groups/{groupId}', {
      params: { path: { groupId } },
    })
    if (!data) throw toApiError(error, '그룹 정보를 불러오지 못했습니다.')
    return data
  })
}

export function fetchAnnouncements(params: {
  page?: number
  size?: number
} = {}): Promise<AnnouncementPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/announcements', {
      params: { query: params },
    })
    if (!data) throw toApiError(error, '공지 목록을 불러오지 못했습니다.')
    return data
  })
}

export function createAnnouncement(
  body: AnnouncementCreateRequest,
): Promise<AnnouncementView> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/announcements', { body })
    if (!data) throw toApiError(error, '공지를 발송하지 못했습니다.')
    return data
  })
}

/* ─── 드리프트·IP 할당 (SYS_ADMIN) ─── */

export function fetchDriftFindings(params: {
  status?: DriftFindingStatus
  kind?: Schemas['DriftFindingKind']
  page?: number
  size?: number
} = {}): Promise<DriftFindingPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/drift-findings', {
      params: { query: params },
    })
    if (!data) throw toApiError(error, '드리프트 목록을 불러오지 못했습니다.')
    return data
  })
}

export function resolveDriftFinding(
  findingId: number,
  note?: string,
): Promise<DriftFindingView> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/drift-findings/{findingId}/resolve', {
      params: { path: { findingId } },
      body: note ? { note } : {},
    })
    if (!data) throw toApiError(error, '드리프트를 해결 처리하지 못했습니다.')
    return data
  })
}

export function fetchIpAllocations(params: {
  poolId?: number
  status?: IpAllocationStatus
  page?: number
  size?: number
} = {}): Promise<IpAllocationPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/ip-allocations', {
      params: { query: params },
    })
    if (!data) throw toApiError(error, 'IP 할당 현황을 불러오지 못했습니다.')
    return data
  })
}

/* ─── 감사 로그·내 활동 ─── */

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

/* ─── 알림 ─── */

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

/* ─── 계정 수명주기 ─── */

export function changeMyPassword(body: {
  currentPassword: string
  newPassword: string
}): Promise<AuthTokenResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.PUT('/me/password', { body })
    if (!data) throw toApiError(error, '비밀번호를 변경하지 못했습니다.')
    return data
  })
}

export function withdrawMyAccount(body: {
  password: string
  totpCode?: string
  recoveryCode?: string
}): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/me/withdraw', { body })
    if (!data) throw toApiError(error, '회원 탈퇴를 처리하지 못했습니다.')
    return data
  })
}

/* ─── 2FA ─── */

export function beginMfaSetup(password: string): Promise<MfaSetupResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/me/mfa/totp', { body: { password } })
    if (!data) throw toApiError(error, '2단계 인증 등록을 시작하지 못했습니다.')
    return data
  })
}

export function activateMfa(code: string): Promise<MfaRecoveryCodesResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/me/mfa/totp/activate', { body: { code } })
    if (!data) throw toApiError(error, '2단계 인증을 활성화하지 못했습니다.')
    return data
  })
}

export function disableMfa(body: {
  password: string
  code?: string
  recoveryCode?: string
}): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/me/mfa/disable', { body })
    if (!data) throw toApiError(error, '2단계 인증을 해제하지 못했습니다.')
    return data
  })
}

export function regenerateRecoveryCodes(body: {
  password: string
  code: string
}): Promise<MfaRecoveryCodesResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/me/mfa/recovery-codes', { body })
    if (!data) throw toApiError(error, '복구 코드를 재발급하지 못했습니다.')
    return data
  })
}

export function resetUserMfa(userId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/users/{userId}/mfa-reset', {
      params: { path: { userId } },
    })
    if (!data) throw toApiError(error, '2단계 인증을 초기화하지 못했습니다.')
    return data
  })
}

/* ─── 약관·동의 ─── */

export function fetchCurrentTerms(): Promise<TermsVersionView[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/meta/terms')
    if (!data) throw toApiError(error, '약관 정보를 불러오지 못했습니다.')
    return data
  })
}

export function fetchTermsDocument(docType: TermsDocType): Promise<TermsDocumentView> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/meta/terms/{docType}', {
      params: { path: { docType } },
    })
    if (!data) throw toApiError(error, '약관 본문을 불러오지 못했습니다.')
    return data
  })
}

export function fetchMyConsents(): Promise<ConsentView[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/me/consents')
    if (!data) throw toApiError(error, '동의 이력을 불러오지 못했습니다.')
    return data
  })
}

export function acceptConsents(consents: ConsentInput[]): Promise<ConsentView[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/me/consents', { body: { consents } })
    if (!data) throw toApiError(error, '약관 동의를 기록하지 못했습니다.')
    return data
  })
}

export function requestPasswordReset(email: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/auth/password-reset', { body: { email } })
    if (!data) throw toApiError(error, '비밀번호 재설정 요청을 처리하지 못했습니다.')
    return data
  })
}

export function confirmPasswordReset(body: {
  token: string
  newPassword: string
}): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/auth/password-reset/confirm', { body })
    if (!data) throw toApiError(error, '비밀번호를 변경하지 못했습니다.')
    return data
  })
}

export function fetchAdminUsers(params: {
  q?: string
  status?: UserStatus
  role?: UserRole
  orgId?: number
  sort?: AdminUserSort
  page?: number
  size?: number
}): Promise<UserAdminPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/users', { params: { query: params } })
    if (!data) throw toApiError(error, '사용자 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchAdminUser(userId: number): Promise<UserAdminDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/users/{userId}', {
      params: { path: { userId } },
    })
    if (!data) throw toApiError(error, '사용자 정보를 불러오지 못했습니다.')
    return data
  })
}

export function fetchAdminTemplates(): Promise<AdminTemplate[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/templates')
    if (!data) throw toApiError(error, '템플릿 목록을 불러오지 못했습니다.')
    return data
  })
}

export function updateAdminTemplate(
  templateId: number,
  body: { status: TemplateStatus },
): Promise<AdminTemplate> {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/admin/templates/{templateId}', {
      params: { path: { templateId } },
      body,
    })
    if (!data) throw toApiError(error, '템플릿 상태를 변경하지 못했습니다.')
    return data
  })
}

/** 사양 프리셋 인벤토리 (전 상태 — 공개 /vm-flavors와 달리 은퇴 프리셋 포함). */
export function fetchAdminVmFlavors(): Promise<VmFlavor[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/vm-flavors')
    if (!data) throw toApiError(error, '사양 프리셋 목록을 불러오지 못했습니다.')
    return data
  })
}

export function createAdminVmFlavor(body: CreateVmFlavor): Promise<VmFlavor> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vm-flavors', { body })
    if (!data) throw toApiError(error, '사양 프리셋을 만들지 못했습니다.')
    return data
  })
}

export function updateAdminVmFlavor(
  flavorId: number,
  body: UpdateVmFlavor,
): Promise<VmFlavor> {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/admin/vm-flavors/{flavorId}', {
      params: { path: { flavorId } },
      body,
    })
    if (!data) throw toApiError(error, '사양 프리셋을 수정하지 못했습니다.')
    return data
  })
}

export function updateAdminNode(
  nodeId: number,
  body: { status: NodeSummary['status'] },
): Promise<NodeSummary> {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/admin/nodes/{nodeId}', {
      params: { path: { nodeId } },
      body,
    })
    if (!data) throw toApiError(error, '노드 상태를 변경하지 못했습니다.')
    return data
  })
}

export function fetchAdminOrgs(): Promise<OrgDetail[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/orgs')
    if (!data) throw toApiError(error, '기관 목록을 불러오지 못했습니다.')
    return data
  })
}

export function createOrg(body: {
  name: string
  slug: string
  description: string | null
}): Promise<OrgDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/orgs', { body })
    if (!data) throw toApiError(error, '기관을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')
    return data
  })
}

export function updateOrg(
  orgId: number,
  body: { name?: string; description?: string | null; status?: OrgStatus; hidden?: boolean },
): Promise<OrgDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/admin/orgs/{orgId}', {
      params: { path: { orgId } },
      body,
    })
    if (!data) throw toApiError(error, '기관 정보를 수정하지 못했습니다.')
    return data
  })
}

export function forceReleaseDomain(domainId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/domains/{domainId}/force-release', {
      params: { path: { domainId } },
    })
    if (!data) throw toApiError(error, '도메인을 강제 해제하지 못했습니다.')
    return data
  })
}

export function verifyAdminDomain(domainId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/domains/{domainId}/verify', {
      params: { path: { domainId } },
    })
    if (!data) throw toApiError(error, '재검증을 접수하지 못했습니다.')
    return data
  })
}

export function applyAdminRoute(routeId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/routes/{routeId}/apply', {
      params: { path: { routeId } },
    })
    if (!data) throw toApiError(error, '라우트 재적용을 접수하지 못했습니다.')
    return data
  })
}

export function fetchAdminVm(vmId: number): Promise<VmDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/vms/{vmId}', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM 정보를 불러오지 못했습니다.')
    return data
  })
}

export function fetchAdminVmEvents(
  vmId: number,
  params: { page?: number; size?: number } = {},
): Promise<VmEventPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/vms/{vmId}/events', {
      params: { path: { vmId }, query: params },
    })
    if (!data) throw toApiError(error, 'VM 이벤트를 불러오지 못했습니다.')
    return data
  })
}

export function adminStartVm(vmId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vms/{vmId}/start', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM 시작 요청을 접수하지 못했습니다.')
    return data
  })
}

export function adminShutdownVm(vmId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vms/{vmId}/shutdown', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM 종료 요청을 접수하지 못했습니다.')
    return data
  })
}

export function adminRebootVm(vmId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vms/{vmId}/reboot', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM 재부팅 요청을 접수하지 못했습니다.')
    return data
  })
}

export function adminForceStopVm(vmId: number): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vms/{vmId}/force-stop', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM 강제 종료 요청을 접수하지 못했습니다.')
    return data
  })
}

export function updateVmGatewayBlock(
  vmId: number,
  body: { blocked: boolean; reason?: string },
): Promise<VmDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/admin/vms/{vmId}/gateway-block', {
      params: { path: { vmId } },
      body,
    })
    if (!data) throw toApiError(error, '차단 상태를 변경하지 못했습니다.')
    return data
  })
}

export function updateUserRole(
  userId: number,
  body: { role: UserRole; orgId: number | null },
): Promise<UserSummary> {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/admin/users/{userId}', {
      params: { path: { userId } },
      body,
    })
    if (!data) throw toApiError(error, '사용자 역할을 변경하지 못했습니다.')
    return data
  })
}

export function disableUser(userId: number, reason: string): Promise<UserAdminDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/users/{userId}/disable', {
      params: { path: { userId } },
      body: { reason },
    })
    if (!data) throw toApiError(error, '사용자를 비활성화하지 못했습니다.')
    return data
  })
}

export function enableUser(userId: number): Promise<UserAdminDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/users/{userId}/enable', {
      params: { path: { userId } },
    })
    if (!data) throw toApiError(error, '사용자를 활성화하지 못했습니다.')
    return data
  })
}
