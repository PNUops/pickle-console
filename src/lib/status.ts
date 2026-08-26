import type { components } from '../api/schema'

export type RequestStatus = components['schemas']['RequestStatus']
export type VmStatus = components['schemas']['VmStatus']

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  SUBMITTED: '승인 대기',
  APPROVED: '승인됨',
  REJECTED: '반려됨',
  CANCELED: '취소됨',
}

export const VM_STATUS_LABELS: Record<VmStatus, string> = {
  CREATING: '생성 중',
  RUNNING: '실행 중',
  STOPPED: '중지됨',
  REBOOTING: '재시작 중',
  DELETING: '삭제 중',
  DELETED: '삭제됨',
  ERROR: '오류',
  NEEDS_ADMIN: '관리자 확인 필요',
}

export type VmEventType = components['schemas']['VmEventResponse']['type']

export const VM_EVENT_LABELS: Record<VmEventType, string> = {
  CREATE: '생성',
  START: '시작',
  STOP: '종료',
  REBOOT: '재부팅',
  FORCE_STOP: '강제 종료',
  DELETE: '파기 완료',
  SELF_DELETE: '삭제 접수',
  SCHEDULE_DELETE: '일반 삭제 접수',
  CANCEL_SCHEDULED_DELETE: '삭제 취소',
  FORCE_DELETE: '강제 삭제 접수',
  REINSTALL: '재설치',
  PUBLISH: '도메인 연결',
  UNPUBLISH: '도메인 해제',
  PERIOD_UPDATE: '사용 기간 변경',
  PORT_FORWARD_CREATE: '포트포워딩 생성',
  PORT_FORWARD_DELETE: '포트포워딩 삭제',
  EXPIRE_STOP: '만료 자동 종료',
  GATEWAY_BLOCK: 'SSH·터미널 차단',
  GATEWAY_UNBLOCK: 'SSH·터미널 차단 해제',
}

export type VmActorKind = components['schemas']['VmActorKind']

/**
 * 이벤트 한 행의 수행자 표기. 관리자 개입은 개인 신원 없이 "관리자"로만 적고,
 * 사용자 화면용 응답은 그 행의 actorId와 actorName을 이미 비워서 내려온다
 * (가리는 일을 클라이언트에 맡기면 응답에는 실려 나간다). 이름이 없는 계정은
 * "사용자"로 떨어진다.
 *
 * 관리자 화면은 같은 행에 이름이 채워져 오므로 이 함수 대신 이름을 직접 쓴다.
 */
export function vmEventActorLabel(event: {
  actorKind: VmActorKind
  actorName?: string | null
}): string {
  if (event.actorKind === 'SYSTEM') return '시스템'
  if (event.actorKind === 'ADMIN') return '관리자'
  return event.actorName ?? '사용자'
}

/* ─── LLM API 키 ─── */

export type LlmApiKeyStatus = components['schemas']['LlmApiKeyStatus']

/**
 * 키의 다섯 상태. 발급 전과 폐기됨은 서로 다른 이야기다 — 발급 전은 승인은 났고
 * 소유자가 아직 비밀을 만들지 않은 상태(그 키로는 아무것도 인증되지 않는다),
 * 폐기됨은 비밀이 죽은 상태다. 라벨이 그 차이를 먼저 말한다.
 */
export const LLM_KEY_STATUS_LABELS: Record<LlmApiKeyStatus, string> = {
  PENDING: '발급 전',
  ACTIVE: '활성',
  SUSPENDED: '정지됨',
  REVOKED: '폐기됨',
  EXPIRED: '만료됨',
}

/**
 * 화면이 믿어야 할 상태 — 저장된 문자열이 아니라 만료 시각을 함께 본다.
 *
 * 만료를 집행하는 것은 게이트웨이이고, 그 판단 근거는 `expires_at` 타임스탬프다.
 * 상태 열을 `EXPIRED`로 옮기는 코드는 서버 어디에도 없어서, 기간이 지난 키도
 * 저장된 값은 계속 `ACTIVE`다. 그 문자열만 믿으면 콘솔은 이미 거부되고 있는 키를
 * '활성'이라 부르고 재발급까지 권하게 된다 — 새로 받은 평문도 똑같이 거부되는데.
 * 두 곳이 같은 근거를 보게 하는 것이 이 함수의 전부다.
 *
 * 폐기는 시간을 이긴다(죽은 것은 죽은 것이고, 되살릴 수도 없다). 그 밖의 상태는
 * 만료가 이긴다 — 정지된 데다 만료까지 됐다면 '해제하면 된다'는 말이 거짓이다.
 */
export function effectiveLlmKeyStatus(
  status: LlmApiKeyStatus,
  expiresAt?: string | null,
  now: number = Date.now(),
): LlmApiKeyStatus {
  if (status === 'REVOKED') return 'REVOKED'
  if (expiresAt != null && Date.parse(expiresAt) <= now) return 'EXPIRED'
  return status
}

/* ─── HTTP 공개·도메인·인증서 ─── */

export type DomainKind = components['schemas']['DomainKind']
export type DomainStatus = components['schemas']['DomainStatus']
export type RouteStatus = components['schemas']['RouteStatus']
export type CertificateKind = components['schemas']['CertificateKind']
export type CertificateStatus = components['schemas']['CertificateStatus']

/** 사용자 관점 이분법(플랫폼/커스텀)을 따른다 — AUTO는 폐지된 자동 생성의 잔재 표기. */
export const DOMAIN_KIND_LABELS: Record<DomainKind, string> = {
  AUTO: '플랫폼 (자동)',
  PLATFORM: '플랫폼',
  CUSTOM: '커스텀',
}

export const DOMAIN_STATUS_LABELS: Record<DomainStatus, string> = {
  PENDING: '레코드 대기',
  VERIFYING: '검증 중',
  ACTIVE: '연결됨',
  FAILED: '검증 실패',
  REMOVED: '해제됨',
}

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  PENDING: '적용 대기',
  APPLIED: '적용됨',
  FAILED: '적용 실패',
  REMOVED: '제거됨',
}

export const CERTIFICATE_KIND_LABELS: Record<CertificateKind, string> = {
  ORIGIN_CA_WILDCARD: '플랫폼 와일드카드',
  LETS_ENCRYPT: "Let's Encrypt",
}

export const CERTIFICATE_STATUS_LABELS: Record<CertificateStatus, string> = {
  ACTIVE: '정상',
  RENEWING: '갱신 중',
  FAILED: '발급 실패',
  REVOKED: '폐기됨',
}

/* ─── 포트포워딩·캠퍼스 IP ─── */

export type PortForwardApplyState = components['schemas']['PortForwardApplyState']
export type PortMappingStatus = components['schemas']['PortMappingStatus']
export type PortMappingProto = components['schemas']['PortMappingProto']
export type CampusIpRequestStatus = components['schemas']['CampusIpRequestStatus']

/** 릴레이 반영 상태 — 서버가 적용 세대 비교로 파생하는 값 (용어 확정 2026-07-29). */
export const PORT_FORWARD_APPLY_STATE_LABELS: Record<PortForwardApplyState, string> = {
  PENDING: '대기',
  ACTIVE: '활성',
  FAILED: '실패',
}

/** 매핑 상태 — SUSPENDED는 관리자·자동 정지 ('적용' 접두 없이 '정지됨'). */
export const PORT_MAPPING_STATUS_LABELS: Record<PortMappingStatus, string> = {
  ACTIVE: '활성',
  SUSPENDED: '정지됨',
}

/**
 * 캠퍼스 IP 신청 상태. APPROVED는 관리자가 신청을 받아들인 시점이고, 실제
 * 교내 IP가 붙으면 GRANTED가 된다.
 */
export const CAMPUS_IP_STATUS_LABELS: Record<CampusIpRequestStatus, string> = {
  REQUESTED: '신청됨',
  APPROVED: '승인됨',
  GRANTED: '할당됨',
  REJECTED: '반려됨',
  REVOKED: '회수됨',
}

/** 삭제 예정 배너 제목 — 삭제 종류(kind)별 안내 문구. */
export const DELETION_BANNER_TITLES: Record<
  components['schemas']['VmDeletionResponse']['kind'],
  string
> = {
  SELF: '삭제가 접수된 VM입니다',
  ADMIN: '관리자 삭제가 접수된 VM입니다',
  // 사용자 콘솔에는 강제 여부를 노출하지 않는다 — ADMIN과 동일 문구가 의도된 동작.
  FORCE: '관리자 삭제가 접수된 VM입니다',
}

export type ProvisioningTaskStatus =
  components['schemas']['ProvisioningTaskResponse']['status']

export const PROVISIONING_KIND_LABELS: Record<
  components['schemas']['ProvisioningTaskResponse']['kind'],
  string
> = {
  PROVISION: 'VM 생성',
  DELETE: 'VM 삭제',
  REINSTALL: 'VM 재설치',
}

/* ─── 운영 콘솔 ─── */

export type DriftFindingKind = components['schemas']['DriftFindingKind']
export type DriftFindingStatus = components['schemas']['DriftFindingStatus']
export type NotificationDeliveryStatus =
  components['schemas']['NotificationStatus']
export type IpAllocationStatus = components['schemas']['AllocationStatus']
export type AnnouncementScope = components['schemas']['AnnouncementScope']

export const TASK_STATUS_LABELS: Record<ProvisioningTaskStatus, string> = {
  PENDING: '대기',
  RUNNING: '진행 중',
  DONE: '완료',
  FAILED: '실패',
  RETRYING: '재시도 대기',
  NEEDS_ADMIN: '관리자 확인 필요',
}

export const DRIFT_KIND_LABELS: Record<DriftFindingKind, string> = {
  MISSING_IN_PROXMOX: 'Proxmox에 없음',
  UNMANAGED_GUEST: '미등록 VM',
  SPEC_MISMATCH: '사양 불일치',
  OPENROUTER_ORPHAN: 'OpenRouter 미등록 키',
  OPENROUTER_STALE: 'OpenRouter 키 상태 불일치',
}

export const DRIFT_STATUS_LABELS: Record<DriftFindingStatus, string> = {
  OPEN: '미해결',
  RESOLVED: '해결됨',
}

export const DELIVERY_STATUS_LABELS: Record<NotificationDeliveryStatus, string> = {
  PENDING: '발송 대기',
  SENT: '발송됨',
  FAILED: '발송 실패',
  SKIPPED: '미발송',
}

export const IP_ALLOCATION_STATUS_LABELS: Record<IpAllocationStatus, string> = {
  ALLOCATED: '할당됨',
  RELEASED: '해제됨',
}

export const ANNOUNCEMENT_SCOPE_LABELS: Record<AnnouncementScope, string> = {
  ALL: '전체',
  ORG: '기관',
  WORKSPACE: '워크스페이스',
}

/**
 * 알려진 감사 로그 동작 코드의 한국어 라벨 (미등록 코드는 원문 노출).
 * 전체 카탈로그(36키)는 api AuditService의 상수 목록과 1:1 대응.
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.signup': '회원가입',
  'auth.verify': '이메일 인증',
  'auth.login': '로그인',
  'auth.login_failed': '로그인 실패',
  'auth.refresh_reuse_detected': '리프레시 토큰 재사용 감지',
  'auth.logout': '로그아웃',
  'workspace.create': '워크스페이스 생성',
  'workspace.member_add': '구성원 추가',
  'workspace.member_update': '구성원 역할 변경',
  'workspace.member_remove': '구성원 제거',
  'request.create': '신청 제출',
  'request.cancel': '신청 취소',
  'request.approve': '신청 승인',
  'request.reject': '신청 반려',
  'org.create': '기관 생성',
  'org.update': '기관 정보 수정',
  'user.role_update': '역할 변경',
  'vm.self_delete': '본인 삭제',
  'vm.schedule_delete': '일반 삭제 접수',
  'vm.cancel_scheduled_delete': '삭제 취소',
  'vm.force_delete': '강제 삭제',
  'vm.password_reveal': '초기 비밀번호 열람',
  'vm.ssh_key_issue': 'SSH 키 발급',
  'vm.ssh_key_reissue': 'SSH 키 재발급',
  'vm.ssh_key_download': 'SSH 개인키 다운로드',
  'vm.ssh_key_delete': 'SSH 키 삭제',
  'vm.publish': 'HTTP 공개',
  'vm.publication_update': '공개 설정 변경',
  'vm.unpublish': 'HTTP 공개 해제',
  'domain.delete': '도메인 해제',
  'domain.verify': '도메인 검증',
  'route.resync': '라우트 재동기화',
  'drift.resolve': '드리프트 해결',
  'task.retry': '작업 재시도',
  'notification.resend': '알림 재발송',
  'vm.period_update': '사용 기간 변경',
  'sshgw.route': 'SSH 접속 라우팅',
  'sshgw.route_denied': 'SSH 접속 거부',
  'setting.update': '설정 변경',
  'announcement.create': '공지 발송',
}

/** 감사 동작 코드 → 라벨 (카탈로그에 없으면 코드 원문). */
export function labelForAuditAction(code: string): string {
  return AUDIT_ACTION_LABELS[code] ?? code
}
