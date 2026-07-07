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
