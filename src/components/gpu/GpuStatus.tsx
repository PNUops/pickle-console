import { Badge } from '../ui'

const ALLOCATION_LABELS: Record<string, string> = {
  QUEUED: '대기', ALLOCATED: '할당됨', RELEASING: '반납 중', RELEASED: '반납 완료', CANCELED: '취소',
}
const CONNECTION_LABELS: Record<string, string> = {
  NONE: '미연결', ATTACHING: '연결 중', ATTACHED: '연결됨', DETACHING: '해제 중', ERROR: '관리자 확인 필요',
}

export function GpuStatusBadge({ status }: { status: string }) {
  return <Badge variant={status === 'ALLOCATED' ? 'success' : status === 'QUEUED' ? 'info' : 'neutral'}>{ALLOCATION_LABELS[status] ?? status}</Badge>
}

export function GpuConnectionBadge({ status }: { status: string }) {
  return <Badge variant={status === 'ERROR' ? 'danger' : status === 'ATTACHED' ? 'success' : 'neutral'}>{CONNECTION_LABELS[status] ?? status}</Badge>
}
