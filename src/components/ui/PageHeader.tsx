import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface PageHeaderProps {
  title: string
  description?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  className?: string
}

/** 페이지의 한 개뿐인 h1과 문맥·주요 action을 묶는다. */
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex min-w-0 flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-[min(100%,24rem)] flex-1">
        {eyebrow && (
          <div className="type-caption mb-1 font-semibold text-brand-foreground">{eyebrow}</div>
        )}
        <h1 className="type-page-title text-foreground-primary">{title}</h1>
        {description && (
          <div className="type-body mt-1 max-w-3xl text-foreground-muted">{description}</div>
        )}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
