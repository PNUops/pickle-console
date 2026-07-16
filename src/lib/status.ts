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
  STOP: '종료',
  REBOOT: '재부팅',
  FORCE_STOP: '강제 종료',
  DELETE: '삭제 접수',
  SCHEDULE_DELETE: '일반 삭제 접수',
  CANCEL_SCHEDULED_DELETE: '삭제 취소',
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

/** 삭제 예정 배너 제목 — 삭제 종류(kind)별 안내 문구. */
export const DELETION_BANNER_TITLES: Record<
  components['schemas']['VmDeletion']['kind'],
  string
> = {
  SELF: '삭제가 접수된 VM입니다',
  ADMIN: '관리자 삭제가 접수된 VM입니다',
  EMERGENCY: '긴급 삭제가 접수된 VM입니다',
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

/* ─── 운영 콘솔 (M5) ─── */

export type DriftFindingKind = components['schemas']['DriftFindingKind']
export type DriftFindingStatus = components['schemas']['DriftFindingStatus']
export type NotificationDeliveryStatus =
  components['schemas']['NotificationDeliveryStatus']
export type IpAllocationStatus = components['schemas']['IpAllocationStatus']
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
  GROUP: '그룹',
}

/** 알려진 감사 로그 동작 코드의 한국어 라벨 (미등록 코드는 원문 노출). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.login': '로그인',
  'auth.login_failed': '로그인 실패',
  'auth.logout': '로그아웃',
  'vm.delete': 'VM 삭제',
  'setting.update': '설정 변경',
  'announcement.create': '공지 발송',
  'task.retry': '작업 재시도',
  'drift.resolve': '드리프트 해결',
  'vm.period_update': '기간 변경',
  'notification.resend': '알림 재발송',
}

/** 감사 동작 코드 → 라벨 (카탈로그에 없으면 코드 원문). */
export function labelForAuditAction(code: string): string {
  return AUDIT_ACTION_LABELS[code] ?? code
}
