import type { AdminDeadlineKind, AdminDeadlineQuery, AdminResourceDeadline } from '../api/resource-deadlines'
import type { ResourceType } from '../api/queries'
import { RESOURCE_TYPES } from '../components/resource/registry'
import { GPU_ALLOCATION_LABELS, GPU_CONNECTION_LABELS } from '../components/gpu/GpuStatus'
import { DOMAIN_STATUS_LABELS, LLM_KEY_STATUS_LABELS, VM_STATUS_LABELS } from './status'
import { formatDateTimeSeconds } from './format'
import { gpuPreviewEnabled } from './gpu-preview'
import { adminPaths } from './paths'
import { listPage } from './list-url'
import { isUuid } from './validation'

export const DEADLINE_KIND_LABELS: Record<AdminDeadlineKind, string> = {
  VM_USAGE_END: 'VM 사용 종료', LLM_KEY_EXPIRY: 'LLM API 키 만료',
  DOMAIN_RENEWAL: '도메인 갱신', DOMAIN_RESERVATION: '도메인 예약 종료',
  GPU_GRANT_END: 'GPU 승인 사용 종료', GPU_LEASE_END: 'GPU 임대 종료',
}
const KIND_FAMILIES: Record<AdminDeadlineKind, ResourceType> = {
  VM_USAGE_END: 'VM', LLM_KEY_EXPIRY: 'LLM_API_KEY', DOMAIN_RENEWAL: 'DOMAIN',
  DOMAIN_RESERVATION: 'DOMAIN', GPU_GRANT_END: 'GPU', GPU_LEASE_END: 'GPU',
}
const STATUS_LABELS: Record<ResourceType, Record<string, string>> = {
  VM: VM_STATUS_LABELS, LLM_API_KEY: LLM_KEY_STATUS_LABELS, DOMAIN: { ...DOMAIN_STATUS_LABELS, ACTIVE: '활성' }, GPU: GPU_ALLOCATION_LABELS,
}
export type DeadlineWindow = 'D7' | 'D30' | 'EXPIRED'

export function deadlineListState(params: URLSearchParams) {
  const rawType = params.get('type') ?? undefined
  const rawKind = params.get('deadlineKind') ?? undefined
  const rawWorkspace = params.get('workspaceId') ?? undefined
  const rawWindow = params.get('window') ?? 'D7'
  const rawSort = params.get('sort') ?? 'deadlineAt'
  const type = rawType && Object.hasOwn(RESOURCE_TYPES, rawType) ? rawType as ResourceType : undefined
  const deadlineKind = rawKind && Object.hasOwn(DEADLINE_KIND_LABELS, rawKind) ? rawKind as AdminDeadlineKind : undefined
  const workspaceId = rawWorkspace && isUuid(rawWorkspace) ? rawWorkspace.toLowerCase() : undefined
  const window = (['D7', 'D30', 'EXPIRED'] as const).find((item) => item === rawWindow) ?? 'D7'
  const sort: NonNullable<AdminDeadlineQuery['sort']> = rawSort === '-deadlineAt' ? '-deadlineAt' : 'deadlineAt'
  const invalid = !!rawType && !type || !!rawKind && !deadlineKind || !!rawWorkspace && !workspaceId
    || !['D7', 'D30', 'EXPIRED'].includes(rawWindow) || !['deadlineAt', '-deadlineAt'].includes(rawSort)
  return { type, deadlineKind, workspaceId, window, sort, page: listPage(params.get('page')), invalid }
}

export function deadlineQuery(state: ReturnType<typeof deadlineListState>, orgId?: string): AdminDeadlineQuery {
  return { orgId, workspaceId: state.workspaceId, type: state.type, deadlineKind: state.deadlineKind,
    ...(state.window === 'EXPIRED' ? { expired: true } : { expiringInDays: state.window === 'D7' ? 7 : 30 }),
    sort: state.sort, page: state.page, size: 20 }
}

export function deadlineKindLabel(kind: string) {
  return Object.hasOwn(DEADLINE_KIND_LABELS, kind) ? DEADLINE_KIND_LABELS[kind as AdminDeadlineKind] : `알 수 없음 (${kind})`
}
export function deadlineTypeLabel(type: string) {
  return Object.hasOwn(RESOURCE_TYPES, type) ? RESOURCE_TYPES[type as ResourceType].label : `알 수 없음 (${type})`
}
export function deadlineStatusLabel(type: string, status: string) {
  const labels = Object.hasOwn(STATUS_LABELS, type) ? STATUS_LABELS[type as ResourceType] : undefined
  return labels && Object.hasOwn(labels, status) ? labels[status] : `알 수 없음 (${status || '없음'})`
}
export function deadlineConnectionLabel(status: string) {
  return Object.hasOwn(GPU_CONNECTION_LABELS, status) ? GPU_CONNECTION_LABELS[status] : `알 수 없음 (${status})`
}
function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
}
export function validDeadlineInstant(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value)
  return !!match && validCalendarDate(match[1]) && Number(match[2]) < 24 && Number(match[3]) < 60
    && Number(match[4]) < 60 && Number.isFinite(Date.parse(value))
}
export function deadlineTime(value: string | null | undefined) {
  return value == null ? '—' : validDeadlineInstant(value) ? `${formatDateTimeSeconds(value)} KST` : '기한 정보 확인 필요'
}
export function deadlineDate(value: string | null | undefined) {
  if (value == null) return '—'
  return validCalendarDate(value) ? value : '기한 정보 확인 필요'
}
export function knownDeadline(row: AdminResourceDeadline) {
  const labels = Object.hasOwn(STATUS_LABELS, row.type) ? STATUS_LABELS[row.type] : undefined
  return !!labels && Object.hasOwn(labels, row.status) && Object.hasOwn(labels, row.sourceStatus)
    && Object.hasOwn(KIND_FAMILIES, row.deadlineKind) && KIND_FAMILIES[row.deadlineKind] === row.type
    && validDeadlineInstant(row.deadlineAt) && validDeadlineInstant(row.observedAt)
    && (row.inclusiveEndDate == null || deadlineDate(row.inclusiveEndDate) !== '기한 정보 확인 필요')
    && (row.type !== 'GPU' || row.connectionStatus == null || Object.hasOwn(GPU_CONNECTION_LABELS, row.connectionStatus))
}
export function deadlineDetailPath(row: AdminResourceDeadline) {
  if (!knownDeadline(row) || !isUuid(row.id) || row.orgId != null && !isUuid(row.orgId)) return undefined
  const orgId = row.orgId?.toLowerCase() ?? undefined
  switch (row.type) {
    case 'VM': return adminPaths.vmDetail(row.id, orgId)
    case 'LLM_API_KEY': return adminPaths.llmKeyDetail(row.id, orgId)
    case 'DOMAIN': return adminPaths.domainDetail(row.id, orgId)
    case 'GPU': return gpuPreviewEnabled() ? adminPaths.gpuDetail(row.id, orgId) : undefined
  }
}
