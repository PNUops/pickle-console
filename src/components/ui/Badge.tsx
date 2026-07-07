import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import {
  REQUEST_STATUS_LABELS,
  VM_STATUS_LABELS,
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
      {VM_STATUS_LABELS[status]}
    </Badge>
  )
}
