import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import {
  GROUP_KIND_LABELS,
  GROUP_ROLE_LABELS,
  type GroupKind,
  type GroupMemberRole,
} from '../../lib/labels'
import { formatDday } from '../../lib/format'
import {
  ANNOUNCEMENT_SCOPE_LABELS,
  CAMPUS_IP_STATUS_LABELS,
  CERTIFICATE_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  DOMAIN_KIND_LABELS,
  DOMAIN_STATUS_LABELS,
  DRIFT_KIND_LABELS,
  DRIFT_STATUS_LABELS,
  IP_ALLOCATION_STATUS_LABELS,
  PORT_FORWARD_APPLY_STATE_LABELS,
  PORT_MAPPING_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  ROUTE_STATUS_LABELS,
  TASK_STATUS_LABELS,
  VM_STATUS_LABELS,
  type AnnouncementScope,
  type CampusIpRequestStatus,
  type CertificateStatus,
  type DomainKind,
  type DomainStatus,
  type DriftFindingKind,
  type DriftFindingStatus,
  type IpAllocationStatus,
  type NotificationDeliveryStatus,
  type PortForwardApplyState,
  type PortMappingStatus,
  type ProvisioningTaskStatus,
  type RouteStatus,
  type VmRequestStatus,
  type VmStatus,
} from '../../lib/status'

const variants = {
  neutral: 'bg-neutral-100 text-neutral-700',
  primary: 'bg-primary-100 text-primary-800',
  success: 'bg-success-100 text-success-800',
  warning: 'bg-warning-100 text-warning-800',
  danger: 'bg-danger-100 text-danger-800',
  info: 'bg-info-100 text-info-800',
} as const

export type BadgeVariant = keyof typeof variants

export interface BadgeProps {
  variant?: BadgeVariant
  className?: string
  children: ReactNode
}

export function Badge({ variant = 'neutral', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}

const REQUEST_STATUS_VARIANTS: Record<VmRequestStatus, BadgeVariant> = {
  SUBMITTED: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELED: 'neutral',
}

export function RequestStatusBadge({ status, className }: { status: VmRequestStatus; className?: string }) {
  return (
    <Badge variant={REQUEST_STATUS_VARIANTS[status]} className={className}>
      {REQUEST_STATUS_LABELS[status]}
    </Badge>
  )
}

const VM_STATUS_VARIANTS: Record<VmStatus, BadgeVariant> = {
  CREATING: 'info',
  RUNNING: 'success',
  STOPPED: 'neutral',
  REBOOTING: 'info',
  DELETING: 'neutral',
  DELETED: 'neutral',
  ERROR: 'danger',
  NEEDS_ADMIN: 'warning',
}

export function VmStatusBadge({ status, className }: { status: VmStatus; className?: string }) {
  return (
    <Badge variant={VM_STATUS_VARIANTS[status]} className={className}>
      {status === 'CREATING' && (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="size-3 animate-spin text-current"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
          />
        </svg>
      )}
      {VM_STATUS_LABELS[status]}
    </Badge>
  )
}

const DOMAIN_STATUS_VARIANTS: Record<DomainStatus, BadgeVariant> = {
  PENDING: 'neutral',
  VERIFYING: 'info',
  ACTIVE: 'success',
  FAILED: 'danger',
  REMOVED: 'neutral',
}

export function DomainStatusBadge({ status, className }: { status: DomainStatus; className?: string }) {
  return (
    <Badge variant={DOMAIN_STATUS_VARIANTS[status]} className={className}>
      {DOMAIN_STATUS_LABELS[status]}
    </Badge>
  )
}

const ROUTE_STATUS_VARIANTS: Record<RouteStatus, BadgeVariant> = {
  PENDING: 'info',
  APPLIED: 'success',
  FAILED: 'danger',
  REMOVED: 'neutral',
}

export function RouteStatusBadge({ status, className }: { status: RouteStatus; className?: string }) {
  return (
    <Badge variant={ROUTE_STATUS_VARIANTS[status]} className={className}>
      {ROUTE_STATUS_LABELS[status]}
    </Badge>
  )
}

const CERTIFICATE_STATUS_VARIANTS: Record<CertificateStatus, BadgeVariant> = {
  ACTIVE: 'success',
  RENEWING: 'info',
  FAILED: 'danger',
  REVOKED: 'neutral',
}

export function CertificateStatusBadge({
  status,
  className,
}: {
  status: CertificateStatus
  className?: string
}) {
  return (
    <Badge variant={CERTIFICATE_STATUS_VARIANTS[status]} className={className}>
      {CERTIFICATE_STATUS_LABELS[status]}
    </Badge>
  )
}

export function DomainKindBadge({ kind, className }: { kind: DomainKind; className?: string }) {
  return (
    <Badge variant="neutral" className={className}>
      {DOMAIN_KIND_LABELS[kind]}
    </Badge>
  )
}

/**
 * 도메인 접힌 연결 상태 배지 — 라벨·톤은 `foldDomainStatus()` 파생 결과를
 * 구조 그대로 받는다 (파생 규칙은 vm-domains/domain-status.ts가 단일 출처).
 */
export function DomainConnectionBadge({
  status,
  className,
}: {
  status: { label: string; tone: BadgeVariant }
  className?: string
}) {
  return (
    <Badge variant={status.tone} className={className}>
      {status.label}
    </Badge>
  )
}

const GROUP_KIND_VARIANTS: Record<GroupKind, BadgeVariant> = {
  PERSONAL: 'neutral',
  TEAM: 'info',
  PROJECT: 'primary',
}

export function GroupKindBadge({ kind, className }: { kind: GroupKind; className?: string }) {
  return (
    <Badge variant={GROUP_KIND_VARIANTS[kind]} className={className}>
      {GROUP_KIND_LABELS[kind]}
    </Badge>
  )
}

/* ─── 운영 콘솔 ─── */

/** 사용 종료일 D-day 배지 — 임박(D-3 이내)·경과는 danger, D-7 이내는 warning. */
export function DdayBadge({ endDate, className }: { endDate: string; className?: string }) {
  const dday = formatDday(endDate)
  const variant: BadgeVariant =
    dday.tone === 'danger' ? 'danger' : dday.tone === 'warning' ? 'warning' : 'neutral'
  return (
    <Badge variant={variant} className={className}>
      {dday.label}
    </Badge>
  )
}

const TASK_STATUS_VARIANTS: Record<ProvisioningTaskStatus, BadgeVariant> = {
  PENDING: 'neutral',
  RUNNING: 'info',
  DONE: 'success',
  FAILED: 'danger',
  RETRYING: 'warning',
  NEEDS_ADMIN: 'warning',
}

export function TaskStatusBadge({
  status,
  className,
}: {
  status: ProvisioningTaskStatus
  className?: string
}) {
  return (
    <Badge variant={TASK_STATUS_VARIANTS[status]} className={className}>
      {TASK_STATUS_LABELS[status]}
    </Badge>
  )
}

const DRIFT_KIND_VARIANTS: Record<DriftFindingKind, BadgeVariant> = {
  MISSING_IN_PROXMOX: 'danger',
  UNMANAGED_GUEST: 'warning',
  SPEC_MISMATCH: 'info',
}

export function DriftKindBadge({
  kind,
  className,
}: {
  kind: DriftFindingKind
  className?: string
}) {
  return (
    <Badge variant={DRIFT_KIND_VARIANTS[kind]} className={className}>
      {DRIFT_KIND_LABELS[kind]}
    </Badge>
  )
}

const DRIFT_STATUS_VARIANTS: Record<DriftFindingStatus, BadgeVariant> = {
  OPEN: 'warning',
  RESOLVED: 'success',
}

export function DriftStatusBadge({
  status,
  className,
}: {
  status: DriftFindingStatus
  className?: string
}) {
  return (
    <Badge variant={DRIFT_STATUS_VARIANTS[status]} className={className}>
      {DRIFT_STATUS_LABELS[status]}
    </Badge>
  )
}

const DELIVERY_STATUS_VARIANTS: Record<NotificationDeliveryStatus, BadgeVariant> = {
  PENDING: 'info',
  SENT: 'success',
  FAILED: 'danger',
  SKIPPED: 'neutral',
}

export function DeliveryStatusBadge({
  status,
  className,
}: {
  status: NotificationDeliveryStatus
  className?: string
}) {
  return (
    <Badge variant={DELIVERY_STATUS_VARIANTS[status]} className={className}>
      {DELIVERY_STATUS_LABELS[status]}
    </Badge>
  )
}

const IP_ALLOCATION_STATUS_VARIANTS: Record<IpAllocationStatus, BadgeVariant> = {
  ALLOCATED: 'success',
  RELEASED: 'neutral',
}

export function IpAllocationStatusBadge({
  status,
  className,
}: {
  status: IpAllocationStatus
  className?: string
}) {
  return (
    <Badge variant={IP_ALLOCATION_STATUS_VARIANTS[status]} className={className}>
      {IP_ALLOCATION_STATUS_LABELS[status]}
    </Badge>
  )
}

const ANNOUNCEMENT_SCOPE_VARIANTS: Record<AnnouncementScope, BadgeVariant> = {
  ALL: 'primary',
  ORG: 'info',
  GROUP: 'neutral',
}

export function AnnouncementScopeBadge({
  scope,
  className,
}: {
  scope: AnnouncementScope
  className?: string
}) {
  return (
    <Badge variant={ANNOUNCEMENT_SCOPE_VARIANTS[scope]} className={className}>
      {ANNOUNCEMENT_SCOPE_LABELS[scope]}
    </Badge>
  )
}

/* ─── 포트포워딩·캠퍼스 IP ─── */

const PORT_FORWARD_APPLY_STATE_VARIANTS: Record<PortForwardApplyState, BadgeVariant> = {
  PENDING: 'neutral',
  ACTIVE: 'success',
  FAILED: 'danger',
}

/** 릴레이 반영 상태 배지 — 대기(수렴 전)/활성/실패. */
export function PortForwardApplyStateBadge({
  state,
  className,
}: {
  state: PortForwardApplyState
  className?: string
}) {
  return (
    <Badge variant={PORT_FORWARD_APPLY_STATE_VARIANTS[state]} className={className}>
      {PORT_FORWARD_APPLY_STATE_LABELS[state]}
    </Badge>
  )
}

const PORT_MAPPING_STATUS_VARIANTS: Record<PortMappingStatus, BadgeVariant> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
}

/** 매핑 상태 배지 — 관리자·자동 정지(SUSPENDED)를 경고 톤으로 표시한다. */
export function PortMappingStatusBadge({
  status,
  className,
}: {
  status: PortMappingStatus
  className?: string
}) {
  return (
    <Badge variant={PORT_MAPPING_STATUS_VARIANTS[status]} className={className}>
      {PORT_MAPPING_STATUS_LABELS[status]}
    </Badge>
  )
}

const CAMPUS_IP_STATUS_VARIANTS: Record<CampusIpRequestStatus, BadgeVariant> = {
  REQUESTED: 'info',
  APPROVED: 'primary',
  GRANTED: 'success',
  REJECTED: 'danger',
  REVOKED: 'neutral',
}

export function CampusIpStatusBadge({
  status,
  className,
}: {
  status: CampusIpRequestStatus
  className?: string
}) {
  return (
    <Badge variant={CAMPUS_IP_STATUS_VARIANTS[status]} className={className}>
      {CAMPUS_IP_STATUS_LABELS[status]}
    </Badge>
  )
}

const GROUP_ROLE_VARIANTS: Record<GroupMemberRole, BadgeVariant> = {
  OWNER: 'primary',
  EDITOR: 'info',
  MEMBER: 'neutral',
  VIEWER: 'neutral',
}

export function GroupRoleBadge({ role, className }: { role: GroupMemberRole; className?: string }) {
  return (
    <Badge variant={GROUP_ROLE_VARIANTS[role]} className={className}>
      {GROUP_ROLE_LABELS[role]}
    </Badge>
  )
}
