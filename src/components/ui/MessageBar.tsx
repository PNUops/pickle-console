import {
  CheckmarkCircle24Regular,
  Dismiss20Regular,
  ErrorCircle24Regular,
  Info24Regular,
  Warning24Regular,
} from '@fluentui/react-icons'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

const variants = {
  info: {
    className: 'border-info-200 bg-info-50 text-info-900',
    icon: Info24Regular,
  },
  success: {
    className: 'border-success-200 bg-success-50 text-success-900',
    icon: CheckmarkCircle24Regular,
  },
  warning: {
    className: 'border-warning-200 bg-warning-50 text-warning-900',
    icon: Warning24Regular,
  },
  danger: {
    className: 'border-danger-200 bg-danger-50 text-danger-900',
    icon: ErrorCircle24Regular,
  },
} as const

export interface MessageBarProps {
  variant?: keyof typeof variants
  title?: string
  children?: ReactNode
  actions?: ReactNode
  onDismiss?: () => void
  className?: string
}

export function MessageBar({
  variant = 'info',
  title,
  children,
  actions,
  onDismiss,
  className,
}: MessageBarProps) {
  const config = variants[variant]
  const Icon = config.icon

  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-panel border px-3 py-2.5 text-sm', config.className, className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
        {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="메시지 닫기"
          className="shrink-0 rounded-control p-1 focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          <Dismiss20Regular aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
