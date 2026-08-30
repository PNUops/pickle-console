import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface CommandBarProps {
  'aria-label': string
  primary?: ReactNode
  secondary?: ReactNode
  className?: string
}

/** 목록·상세의 contextual actions. 좁은 폭과 400% zoom에서는 자연스럽게 줄바꿈한다. */
export function CommandBar({
  'aria-label': ariaLabel,
  primary,
  secondary,
  className,
}: CommandBarProps) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className={cn(
        'flex min-w-0 flex-wrap items-center justify-between gap-2 border-y border-stroke-subtle bg-surface-card px-3 py-2',
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">{primary}</div>
      {secondary && <div className="flex min-w-0 flex-wrap items-center gap-2">{secondary}</div>}
    </div>
  )
}
