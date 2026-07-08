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
