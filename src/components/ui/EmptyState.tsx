import { Search24Regular } from '@fluentui/react-icons'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface EmptyStateProps {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <section
      aria-label={title}
      className={cn(
        'flex min-h-48 flex-col items-center justify-center rounded-panel border border-dashed border-stroke-default bg-surface-card px-4 py-8 text-center',
        className,
      )}
    >
      <span aria-hidden="true" className="mb-3 text-foreground-muted">
        {icon ?? <Search24Regular className="size-6" />}
      </span>
      <h2 className="type-section-title text-foreground-primary">{title}</h2>
      {description && <div className="type-body mt-1 max-w-lg text-foreground-muted">{description}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </section>
  )
}
