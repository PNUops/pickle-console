import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface DescriptionItem {
  term: ReactNode
  description: ReactNode
}

export interface DescriptionListProps {
  items: DescriptionItem[]
  columns?: 1 | 2 | 3
  className?: string
}

const columnClasses = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
} as const

export function DescriptionList({ items, columns = 2, className }: DescriptionListProps) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-4', columnClasses[columns], className)}>
      {items.map((item, index) => (
        <div key={index} className="min-w-0 border-b border-stroke-subtle pb-3">
          <dt className="type-caption font-medium text-foreground-muted">{item.term}</dt>
          <dd className="type-body mt-1 min-w-0 break-words text-foreground-primary">
            {item.description}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * One term and its value inside a hand-laid `<dl>` grid, for cards that
 * mix plain values with composed rows (copy buttons, badges, sub-lines)
 * and so cannot hand an `items` array to {@link DescriptionList}.
 */
export function DescriptionField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-800">{children}</dd>
    </div>
  )
}
