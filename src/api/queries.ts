import type { QueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError, toApiError } from './problem'
import type { components, operations } from './schema'

type Schemas = components['schemas']

export type WorkspaceSummary = Schemas['WorkspaceSummaryResponse']
export type WorkspaceDetail = Schemas['WorkspaceDetailResponse']
export type WorkspaceMember = Schemas['WorkspaceMemberResponse']
export type WorkspaceMemberRole = Schemas['WorkspaceMemberRole']
export type ResourceRole = Schemas['ResourceRole']
export type OrgSummary = Schemas['OrgSummaryResponse']
export type OsImage = Schemas['OsImageResponse']
export type VmFlavor = Schemas['VmFlavorResponse']
export type CreateVmFlavor = Schemas['CreateVmFlavorRequest']
export type UpdateVmFlavor = Schemas['UpdateVmFlavorRequest']
export type CreateRequest = Schemas['CreateRequestRequest']
export type RequestDetail = Schemas['RequestDetailResponse']
export type RequestPage = Schemas['PageResponseRequestDetailResponse']
export type RequestStatus = Schemas['RequestStatus']
export type VmSummary = Schemas['VmSummaryResponse']
export type VmDetail = Schemas['VmDetailResponse']
export type VmPage = Schemas['PageResponseVmSummaryResponse']
/** GET /admin/vms sort 화이트리스트 (계약 v0.6.1) */
export type AdminVmSort = NonNullable<
  operations['listAdminVms']['parameters']['query']
>['sort']
export type ApprovalContext = Schemas['ApprovalContextResponse']
export type ApproveRequest = Schemas['ApproveRequestRequest']
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
export type AdminOsImage = Schemas['AdminOsImageResponse']
export type CatalogStatus = Schemas['CatalogStatus']

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
export type CreateVmDomainRequest = Schemas['CreateVmDomainRequest']
export type UpdateDomainRequest = Schemas['UpdateDomainRequest']
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

/* ─── 포트포워딩·릴레이·캠퍼스 IP (v0.27.0) ─── */
export type PortForwardingView = Schemas['PortForwardingView']
export type CreatePortForwardingRequest = Schemas['CreatePortForwardingRequest']
export type PortMappingProto = Schemas['PortMappingProto']
export type PortForwardApplyState = Schemas['PortForwardApplyState']
export type PortMappingStatus = Schemas['PortMappingStatus']
export type CampusIpRequestView = Schemas['CampusIpRequestView']
export type CampusIpRequestStatus = Schemas['CampusIpRequestStatus']
export type CreateCampusIpRequest = Schemas['CreateCampusIpRequest']
export type AdminRelayView = Schemas['AdminRelayView']
export type RelayTokenResponse = Schemas['RelayTokenResponse']
export type AdminPortMappingView = Schemas['AdminPortMappingResponse']
export type AdminPortMappingPage = Schemas['PageResponseAdminPortMappingResponse']
export type UpdatePortMappingGuardsRequest = Schemas['UpdatePortMappingGuardsRequest']
export type AdminCampusIpRequestView = Schemas['AdminCampusIpRequestView']
export type AdminCampusIpRequestPage = Schemas['PageResponseAdminCampusIpRequestView']
export type UpdateCampusIpRequestStatusRequest =
  Schemas['UpdateCampusIpRequestStatusRequest']

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
export type AdminWorkspaceOption = Schemas['AdminWorkspaceOptionResponse']
export type AdminWorkspaceDetail = Schemas['AdminWorkspaceDetailResponse']
export type AnnouncementScope = Schemas['AnnouncementScope']
export type AnnouncementCreateRequest = Schemas['AnnouncementCreateRequest']
export type AnnouncementView = Schemas['AnnouncementView']
export type AnnouncementPage = Schemas['PageResponseAnnouncementView']
export type OrgDashboardSummary = Schemas['OrgDashboardSummaryResponse']
export type SystemDashboardSummary = Schemas['SystemDashboardSummaryResponse']
export type NodeLive = Schemas['NodeLiveResponse']
export type LiveCoverage = Schemas['LiveCoverage']
/** 시스템 요약이 함께 싣는 노드별 할당 비율·운영 상태. */
export type NodeRatio = Schemas['NodeRatio']

/* ─── 사용량·할당 추이 (계약 v0.35.0) ─── */
/** 조회 구간 — HOUR/DAY/WEEK/MONTH/YEAR (구간이 길수록 해상도가 거칠어진다). */
export type MetricsTimeframe = Schemas['RrdTimeframe']
export type VmMetrics = Schemas['VmMetricsResponse']
export type VmMetricPoint = Schemas['VmMetricPointResponse']
export type NodeMetrics = Schemas['NodeMetricsResponse']
export type NodeMetricPoint = Schemas['NodeMetricPointResponse']
export type CapacityTrend = Schemas['CapacityTrendResponse']
export type CapacityTrendPoint = Schemas['CapacityTrendPointResponse']

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

export function fetchWorkspaces(): Promise<WorkspaceSummary[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/workspaces')
    if (!data) throw toApiError(error, '워크스페이스 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchWorkspace(workspaceId: string): Promise<WorkspaceDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/workspaces/{workspaceId}', {
      params: { path: { workspaceId } },
    })
    if (!data) throw toApiError(error, '워크스페이스 정보를 불러오지 못했습니다.')
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

export function fetchOsImages(): Promise<OsImage[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/os-images')
    if (!data) throw toApiError(error, 'OS 이미지 목록을 불러오지 못했습니다.')
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

export function fetchRequests(params: {
  status?: RequestStatus
  page?: number
  size?: number
  workspaceId?: string
}): Promise<RequestPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/requests', { params: { query: params } })
    if (!data) throw toApiError(error, '신청 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchRequest(requestId: string): Promise<RequestDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/requests/{requestId}', {
      params: { path: { requestId } },
    })
    if (!data) throw toApiError(error, '신청 정보를 불러오지 못했습니다.')
    return data
  })
}

export function fetchVms(params: {
  page?: number
  size?: number
  workspaceId?: string
}): Promise<VmPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/vms', { params: { query: params } })
    if (!data) throw toApiError(error, 'VM 목록을 불러오지 못했습니다.')
    return data
  })
}

/**
 * Every list that shows a resource, invalidated together.
 *
 * A VM appears twice now — under its own kind at /vms and in the type-agnostic
 * inventory at /resources — and a mutation that refreshes only the first leaves
 * the second showing a machine that is already gone. Callers that changed one
 * resource's existence or state invalidate through here, so a second kind of
 * resource joins the set by editing this function and nothing else.
 */
export function invalidateResourceLists(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['vms'] }),
    queryClient.invalidateQueries({ queryKey: ['resources'] }),
  ])
}

export type ResourceSummary = Schemas['ResourceSummaryResponse']
export type ResourcePage = Schemas['PageResponseResourceSummaryResponse']

/** The type-agnostic inventory: what this person has, whatever kind it is. */
export function fetchResources(params: {
  page?: number
  size?: number
  workspaceId?: string
  type?: ResourceSummary['type']
}): Promise<ResourcePage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/resources', { params: { query: params } })
    if (!data) throw toApiError(error, '리소스 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchVm(vmId: string): Promise<VmDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/vms/{vmId}', { params: { path: { vmId } } })
    if (!data) throw toApiError(error, 'VM 정보를 불러오지 못했습니다.')
    return data
  })
}

/* ─── admin ─── */

export function fetchAdminRequests(params: {
  status?: RequestStatus
  orgId?: string
  page?: number
  size?: number
}): Promise<RequestPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/requests', {
      params: { query: params },
    })
    if (!data) throw toApiError(error, '신청 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchAdminRequest(requestId: string): Promise<RequestDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/requests/{requestId}', {
      params: { path: { requestId } },
    })
    if (!data) throw toApiError(error, '신청 정보를 불러오지 못했습니다.')
    return data
  })
}

export function fetchApprovalContext(requestId: string): Promise<ApprovalContext> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/requests/{requestId}/context', {
      params: { path: { requestId } },
    })
    if (!data) throw toApiError(error, '승인 참고 정보를 불러오지 못했습니다.')
    return data
  })
}

/* ─── vm lifecycle ─── */

export function startVm(vmId: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/start', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM을 시작하지 못했습니다.')
    return data
  })
}

export function shutdownVm(vmId: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/shutdown', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM을 종료하지 못했습니다.')
    return data
  })
}

export function rebootVm(vmId: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/reboot', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM을 재부팅하지 못했습니다.')
    return data
  })
}

export function forceStopVm(vmId: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/force-stop', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM을 강제 종료하지 못했습니다.')
    return data
  })
}

export function deleteVm(vmId: string): Promise<VmDeletion> {
  return guardNetwork(async () => {
    const { data, error } = await api.DELETE('/vms/{vmId}', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM 삭제를 접수하지 못했습니다.')
    return data
  })
}

export function revealVmPassword(vmId: string): Promise<VmPasswordResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/vms/{vmId}/password', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, '비밀번호를 열람하지 못했습니다.')
    return data
  })
}

/** VM 비밀번호 재생성 (시스템 생성, EDITOR 이상) — 즉시 적용된 새 비밀번호를 돌려받는다. */
export function regenerateVmPassword(vmId: string): Promise<VmPasswordResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/password/regenerate', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, '비밀번호를 재생성하지 못했습니다.')
    return data
  })
}

/* ─── VM별 설정 (EDITOR 이상) ─── */

export function fetchVmSettings(vmId: string): Promise<VmSettingView[]> {
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
  vmId: string,
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

/* ─── VM 접근 권한 (리소스 소유자·워크스페이스 소유자) ─── */

export type VmAccessGrant = Schemas['ResourceAccessGrantView']
export type VmAccessList = Schemas['ResourceAccessListResponse']

/**
 * 목록과 함께 어느 VM의 것인지도 받는다 — 이 화면을 여는 사람은 그 VM의 상세를
 * 못 여는 경우가 있어(워크스페이스 소유자), 이름을 다른 데서 가져올 수 없다.
 */
export function fetchVmAccessGrants(vmId: string): Promise<VmAccessList> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/vms/{vmId}/access', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, '접근 권한을 불러오지 못했습니다.')
    return data
  })
}

/** 사용자 지정 부여 또는 워크스페이스 전체 부여. 재인증은 클라이언트가 알아서 붙인다. */
export function addVmAccessGrant(
  vmId: string,
  body: { granteeType: 'USER' | 'WORKSPACE'; userId?: string; role: ResourceRole },
): Promise<VmAccessGrant> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/access', {
      params: { path: { vmId } },
      body,
    })
    if (!data) throw toApiError(error, '접근 권한을 부여하지 못했습니다.')
    return data
  })
}

export function updateVmAccessGrant(
  vmId: string,
  grantId: string,
  role: ResourceRole,
): Promise<VmAccessGrant> {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/vms/{vmId}/access/{grantId}', {
      params: { path: { vmId, grantId } },
      body: { role },
    })
    if (!data) throw toApiError(error, '등급을 변경하지 못했습니다.')
    return data
  })
}

export function removeVmAccessGrant(vmId: string, grantId: string): Promise<void> {
  return guardNetwork(async () => {
    const { error } = await api.DELETE('/vms/{vmId}/access/{grantId}', {
      params: { path: { vmId, grantId } },
    })
    if (error) throw toApiError(error, '접근 권한을 회수하지 못했습니다.')
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
  keyId: string,
): Promise<SshKeyPrivateKeyResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/me/ssh-keys/{keyId}/private-key', {
      params: { path: { keyId } },
    })
    if (!data) throw toApiError(error, '개인키를 다운로드하지 못했습니다.')
    return data
  })
}

export function deleteMySshKey(keyId: string): Promise<void> {
  return guardNetwork(async () => {
    const { error, response } = await api.DELETE('/me/ssh-keys/{keyId}', {
      params: { path: { keyId } },
    })
    if (!response.ok) throw toApiError(error, 'SSH 키를 삭제하지 못했습니다.')
  })
}


export function fetchVmEvents(
  vmId: string,
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

/**
 * VM 사용량 시계열 (GET /vms/{vmId}/metrics).
 * 하이퍼바이저에 물어볼 수 없으면 503 METRICS_UNAVAILABLE이 오고, 아직
 * 프로비저닝되지 않은 VM은 200 + available=false로 온다.
 */
export function fetchVmMetrics(
  vmId: string,
  timeframe: MetricsTimeframe,
): Promise<VmMetrics> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/vms/{vmId}/metrics', {
      params: { path: { vmId }, query: { timeframe } },
    })
    if (!data) throw toApiError(error, '사용량 데이터를 불러오지 못했습니다.')
    return data
  })
}

/* ─── 웹 터미널 ─── */

/**
 * 웹 터미널 1회용 접속 티켓 발급 (POST /vms/{vmId}/terminal-sessions).
 * 실패는 ApiError로 던져 호출부(훅)가 Problem code로 한국어 메시지를 분기한다.
 */
export function createTerminalSession(vmId: string): Promise<TerminalSessionTicket> {
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

/** VM에 도메인 연결 접수 — 플랫폼 서브도메인 또는 커스텀 도메인 (동시 지정 422). */
export function createVmDomain(
  vmId: string,
  body: CreateVmDomainRequest,
): Promise<PublicationView> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/domains', {
      params: { path: { vmId } },
      body,
    })
    if (!data) throw toApiError(error, '도메인 연결을 접수하지 못했습니다.')
    return data
  })
}

/** 도메인별 공개 포트 변경 — 라우트 재적용은 비동기. */
export function updateDomainPort(
  domainId: string,
  body: UpdateDomainRequest,
): Promise<PublicationView> {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/domains/{domainId}', {
      params: { path: { domainId } },
      body,
    })
    if (!data) throw toApiError(error, '공개 포트 변경을 접수하지 못했습니다.')
    return data
  })
}

export function fetchDomains(params: {
  vmId?: string
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

/**
 * 도메인 해제 — 서빙 중이면 접근이 중단되고(플랫폼 서브도메인은 이름이 일정
 * 기간 예약), 이미 예약 중인 행이면 이름을 즉시 반납한다.
 */
export function deleteDomain(domainId: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.DELETE('/domains/{domainId}', {
      params: { path: { domainId } },
    })
    if (!data) throw toApiError(error, '도메인 해제를 접수하지 못했습니다.')
    return data
  })
}

export function verifyDomain(domainId: string): Promise<DomainDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/domains/{domainId}/verify', {
      params: { path: { domainId } },
    })
    if (!data) throw toApiError(error, '도메인 검증 재시도를 접수하지 못했습니다.')
    return data
  })
}

/* ─── 포트포워딩·캠퍼스 IP (사용자) ─── */

export function fetchVmPortForwardings(vmId: string): Promise<PortForwardingView[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/vms/{vmId}/port-forwardings', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, '포트포워딩 목록을 불러오지 못했습니다.')
    return data
  })
}

export function createVmPortForwarding(
  vmId: string,
  body: CreatePortForwardingRequest,
): Promise<PortForwardingView> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/port-forwardings', {
      params: { path: { vmId } },
      body,
    })
    if (!data) throw toApiError(error, '포트포워딩을 만들지 못했습니다.')
    return data
  })
}

export function deleteVmPortForwarding(
  vmId: string,
  portForwardingId: string,
): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.DELETE(
      '/vms/{vmId}/port-forwardings/{portForwardingId}',
      { params: { path: { vmId, portForwardingId } } },
    )
    if (!data) throw toApiError(error, '포트포워딩 삭제를 접수하지 못했습니다.')
    return data
  })
}

export function fetchVmCampusIpRequests(vmId: string): Promise<CampusIpRequestView[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/vms/{vmId}/campus-ip-requests', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, '캠퍼스 IP 신청 이력을 불러오지 못했습니다.')
    return data
  })
}

export function createVmCampusIpRequest(
  vmId: string,
  body: CreateCampusIpRequest,
): Promise<CampusIpRequestView> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/vms/{vmId}/campus-ip-requests', {
      params: { path: { vmId } },
      body,
    })
    if (!data) throw toApiError(error, '캠퍼스 IP 신청을 접수하지 못했습니다.')
    return data
  })
}

/** REQUESTED 상태의 신청만 취소할 수 있다 (그 외 409, 멱등 아님 — 204). */
export function cancelVmCampusIpRequest(vmId: string, requestId: string): Promise<void> {
  return guardNetwork(async () => {
    const { error, response } = await api.DELETE(
      '/vms/{vmId}/campus-ip-requests/{requestId}',
      { params: { path: { vmId, requestId } } },
    )
    if (!response.ok) throw toApiError(error, '캠퍼스 IP 신청을 취소하지 못했습니다.')
  })
}

/* ─── admin: 릴레이·포트 매핑·캠퍼스 IP ─── */

export function fetchAdminRelays(): Promise<AdminRelayView[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/relays')
    if (!data) throw toApiError(error, '릴레이 목록을 불러오지 못했습니다.')
    return data
  })
}

/** 릴레이 동기화 토큰 발급 — 평문 토큰은 이 응답에서만 확인할 수 있다. */
export function issueAdminRelayToken(relayId: string): Promise<RelayTokenResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/relays/{relayId}/token', {
      params: { path: { relayId } },
    })
    if (!data) throw toApiError(error, '릴레이 토큰을 발급하지 못했습니다.')
    return data
  })
}

export function fetchAdminPortMappings(params: {
  relayId?: string
  vmId?: string
  status?: PortMappingStatus
  page?: number
  size?: number
} = {}): Promise<AdminPortMappingPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/port-mappings', {
      params: { query: params },
    })
    if (!data) throw toApiError(error, '포트 매핑 목록을 불러오지 못했습니다.')
    return data
  })
}

/** 매핑 정지 — 갱신된 매핑(정지 사유 포함)을 돌려받는다. 릴레이 반영은 비동기. */
export function suspendAdminPortMapping(
  mappingId: string,
  reason: string,
): Promise<AdminPortMappingView> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/port-mappings/{mappingId}/suspend', {
      params: { path: { mappingId } },
      body: { reason },
    })
    if (!data) throw toApiError(error, '포트 매핑을 정지하지 못했습니다.')
    return data
  })
}

export function unsuspendAdminPortMapping(
  mappingId: string,
): Promise<AdminPortMappingView> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST(
      '/admin/port-mappings/{mappingId}/unsuspend',
      { params: { path: { mappingId } } },
    )
    if (!data) throw toApiError(error, '포트 매핑 정지를 해제하지 못했습니다.')
    return data
  })
}

export function deleteAdminPortMapping(mappingId: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.DELETE('/admin/port-mappings/{mappingId}', {
      params: { path: { mappingId } },
    })
    if (!data) throw toApiError(error, '포트 매핑 삭제를 접수하지 못했습니다.')
    return data
  })
}

/** 매핑별 연결 가드 조정 (SYS_ADMIN) — null = 기본값 복귀, 0 = 해당 가드 해제. */
export function updateAdminPortMappingGuards(
  mappingId: string,
  body: UpdatePortMappingGuardsRequest,
): Promise<AdminPortMappingView> {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/admin/port-mappings/{mappingId}/guards', {
      params: { path: { mappingId } },
      body,
    })
    if (!data) throw toApiError(error, '연결 가드를 조정하지 못했습니다.')
    return data
  })
}

export function fetchAdminCampusIpRequests(params: {
  status?: CampusIpRequestStatus
  vmId?: string
  page?: number
  size?: number
} = {}): Promise<AdminCampusIpRequestPage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/campus-ip-requests', {
      params: { query: params },
    })
    if (!data) throw toApiError(error, '캠퍼스 IP 신청 목록을 불러오지 못했습니다.')
    return data
  })
}

export function updateAdminCampusIpRequestStatus(
  requestId: string,
  body: UpdateCampusIpRequestStatusRequest,
): Promise<AdminCampusIpRequestView> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST(
      '/admin/campus-ip-requests/{requestId}/status',
      { params: { path: { requestId } }, body },
    )
    if (!data) throw toApiError(error, '신청 상태를 전환하지 못했습니다.')
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
  orgId?: string
  workspaceId?: string
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
  vmId: string,
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
  vmId: string,
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

export function cancelScheduledVmDeletion(vmId: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vms/{vmId}/cancel-scheduled-delete', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, '접수된 삭제를 취소하지 못했습니다.')
    return data
  })
}

export function forceDeleteVm(
  vmId: string,
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
  orgId?: string
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
  orgId?: string
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
  orgId?: string
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
  vmId?: string
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

export function retryAdminTask(taskId: string): Promise<MessageResponse> {
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

export function fetchAdminSummary(params: { orgId?: string } = {}): Promise<OrgDashboardSummary> {
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

/** 노드 사용량 시계열 (GET /admin/nodes/{nodeId}/metrics — 시스템 관리자 전용). */
export function fetchAdminNodeMetrics(
  nodeId: string,
  timeframe: MetricsTimeframe,
): Promise<NodeMetrics> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/nodes/{nodeId}/metrics', {
      params: { path: { nodeId }, query: { timeframe } },
    })
    if (!data) throw toApiError(error, '노드 사용량 데이터를 불러오지 못했습니다.')
    return data
  })
}

/**
 * 할당 추이 (GET /admin/capacity-trend).
 * 기관 관리자는 자기 기관으로 고정되고, 시스템 관리자는 orgId를 지정하거나
 * 생략해 플랫폼 전체를 본다.
 */
export function fetchCapacityTrend(
  params: { days?: number; orgId?: string } = {},
): Promise<CapacityTrend> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/capacity-trend', {
      params: { query: params },
    })
    if (!data) throw toApiError(error, '할당 추이를 불러오지 못했습니다.')
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

export function resendAdminNotification(notificationId: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/notifications/{notificationId}/resend', {
      params: { path: { notificationId } },
    })
    if (!data) throw toApiError(error, '알림 재발송을 접수하지 못했습니다.')
    return data
  })
}

export function fetchAdminWorkspaces(params: { orgId?: string } = {}): Promise<AdminWorkspaceOption[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/workspaces', { params: { query: params } })
    if (!data) throw toApiError(error, '워크스페이스 목록을 불러오지 못했습니다.')
    return data
  })
}

export function fetchAdminWorkspace(workspaceId: string): Promise<AdminWorkspaceDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/workspaces/{workspaceId}', {
      params: { path: { workspaceId } },
    })
    if (!data) throw toApiError(error, '워크스페이스 정보를 불러오지 못했습니다.')
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
  findingId: string,
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
  poolId?: string
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
  orgId?: string
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

export function markNotificationRead(notificationId: string): Promise<NotificationView> {
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

export function resetUserMfa(userId: string): Promise<MessageResponse> {
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
  orgId?: string
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

export function fetchAdminUser(userId: string): Promise<UserAdminDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/users/{userId}', {
      params: { path: { userId } },
    })
    if (!data) throw toApiError(error, '사용자 정보를 불러오지 못했습니다.')
    return data
  })
}

export function fetchAdminOsImages(): Promise<AdminOsImage[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/os-images')
    if (!data) throw toApiError(error, 'OS 이미지 목록을 불러오지 못했습니다.')
    return data
  })
}

export function updateAdminOsImage(
  imageId: string,
  body: { status: CatalogStatus },
): Promise<AdminOsImage> {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/admin/os-images/{imageId}', {
      params: { path: { imageId } },
      body,
    })
    if (!data) throw toApiError(error, 'OS 이미지 상태를 변경하지 못했습니다.')
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
  flavorId: string,
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
  nodeId: string,
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
  description: string | null
}): Promise<OrgDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/orgs', { body })
    if (!data) throw toApiError(error, '기관을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')
    return data
  })
}

export function updateOrg(
  orgId: string,
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

export function forceReleaseDomain(domainId: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/domains/{domainId}/force-release', {
      params: { path: { domainId } },
    })
    if (!data) throw toApiError(error, '도메인을 강제 해제하지 못했습니다.')
    return data
  })
}

export function verifyAdminDomain(domainId: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/domains/{domainId}/verify', {
      params: { path: { domainId } },
    })
    if (!data) throw toApiError(error, '재검증을 접수하지 못했습니다.')
    return data
  })
}

export function applyAdminRoute(routeId: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/routes/{routeId}/apply', {
      params: { path: { routeId } },
    })
    if (!data) throw toApiError(error, '라우트 재적용을 접수하지 못했습니다.')
    return data
  })
}

export function fetchAdminVm(vmId: string): Promise<VmDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/vms/{vmId}', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM 정보를 불러오지 못했습니다.')
    return data
  })
}

export function fetchAdminVmEvents(
  vmId: string,
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

export function adminStartVm(vmId: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vms/{vmId}/start', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM 시작 요청을 접수하지 못했습니다.')
    return data
  })
}

export function adminShutdownVm(vmId: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vms/{vmId}/shutdown', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM 종료 요청을 접수하지 못했습니다.')
    return data
  })
}

export function adminRebootVm(vmId: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vms/{vmId}/reboot', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM 재부팅 요청을 접수하지 못했습니다.')
    return data
  })
}

export function adminForceStopVm(vmId: string): Promise<MessageResponse> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vms/{vmId}/force-stop', {
      params: { path: { vmId } },
    })
    if (!data) throw toApiError(error, 'VM 강제 종료 요청을 접수하지 못했습니다.')
    return data
  })
}

export function updateVmGatewayBlock(
  vmId: string,
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
  userId: string,
  body: { role: UserRole; orgId: string | null },
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

export function disableUser(userId: string, reason: string): Promise<UserAdminDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/users/{userId}/disable', {
      params: { path: { userId } },
      body: { reason },
    })
    if (!data) throw toApiError(error, '사용자를 비활성화하지 못했습니다.')
    return data
  })
}

export function enableUser(userId: string): Promise<UserAdminDetail> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/users/{userId}/enable', {
      params: { path: { userId } },
    })
    if (!data) throw toApiError(error, '사용자를 활성화하지 못했습니다.')
    return data
  })
}
