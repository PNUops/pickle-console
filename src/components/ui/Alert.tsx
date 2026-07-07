import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

const variants = {
  info: 'border-info-200 bg-info-50 text-info-800',
  success: 'border-success-200 bg-success-50 text-success-800',
  warning: 'border-warning-200 bg-warning-50 text-warning-800',
  danger: 'border-danger-200 bg-danger-50 text-danger-800',
} as const

export interface AlertProps {
  variant?: keyof typeof variants
  title?: string
  className?: string
  children?: ReactNode
}

export function Alert({ variant = 'info', title, className, children }: AlertProps) {
  const role = variant === 'danger' || variant === 'warning' ? 'alert' : 'status'
  return (
    <div
      role={role}
      className={cn('rounded-lg border px-4 py-3 text-sm', variants[variant], className)}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && 'mt-1')}>{children}</div>}
    </div>
  )
}
