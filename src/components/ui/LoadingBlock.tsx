import { cn } from '../../lib/cn'
import { Spinner } from './Spinner'

export interface LoadingBlockProps {
  label?: string
  className?: string
  compact?: boolean
}

/** 페이지 또는 section을 기다리는 동안 크기가 흔들리지 않는 loading placeholder. */
export function LoadingBlock({ label = '불러오는 중', className, compact = false }: LoadingBlockProps) {
  return (
    <div
      className={cn(
        'flex w-full items-center justify-center rounded-panel border border-stroke-subtle bg-surface-card text-foreground-muted',
        compact ? 'min-h-20' : 'min-h-40',
        className,
      )}
    >
      <span className="flex items-center gap-2 text-sm">
        <Spinner size={compact ? 'sm' : 'md'} label={label} />
        <span aria-hidden="true">{label}</span>
      </span>
    </div>
  )
}
