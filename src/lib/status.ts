import type { components } from '../api/schema'

export type VmRequestStatus = components['schemas']['VmRequestStatus']
export type VmStatus = components['schemas']['VmStatus']

export const REQUEST_STATUS_LABELS: Record<VmRequestStatus, string> = {
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

export type VmEventType = components['schemas']['VmEvent']['type']

export const VM_EVENT_LABELS: Record<VmEventType, string> = {
  CREATE: '생성',
  START: '시작',
  STOP: '정상 종료',
  REBOOT: '재부팅',
  FORCE_STOP: '강제 종료',
  DELETE: '삭제 접수',
  SCHEDULE_DELETE: '삭제 예약',
  CANCEL_SCHEDULED_DELETE: '삭제 예약 취소',
  EMERGENCY_DELETE: '긴급 삭제',
  REINSTALL: '재설치',
  PUBLISH: 'HTTP 공개',
  UNPUBLISH: 'HTTP 공개 해제',
  PERIOD_UPDATE: '사용 기간 변경',
  EXPIRE_STOP: '만료 자동 종료',
}

/* ─── HTTP 공개·도메인·인증서 (M4A) ─── */

export type DomainKind = components['schemas']['DomainKind']
export type DomainStatus = components['schemas']['DomainStatus']
export type RouteStatus = components['schemas']['RouteStatus']
export type CertificateKind = components['schemas']['CertificateKind']
export type CertificateStatus = components['schemas']['CertificateStatus']

export const DOMAIN_KIND_LABELS: Record<DomainKind, string> = {
  AUTO: '자동 서브도메인',
  REQUESTED: '희망 서브도메인',
  CUSTOM: '커스텀 도메인',
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

export type ProvisioningTaskStatus =
  components['schemas']['ProvisioningTaskView']['status']

export const PROVISIONING_KIND_LABELS: Record<
  components['schemas']['ProvisioningTaskView']['kind'],
  string
> = {
  PROVISION: 'VM 생성',
  DELETE: 'VM 삭제',
  REINSTALL: 'VM 재설치',
}
