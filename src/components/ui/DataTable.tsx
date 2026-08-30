import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Table } from './Table'

export interface DataTableProps extends ComponentPropsWithRef<'table'> {
  /** 표의 목적을 보조 기술에 전달한다. 시각 노출 여부만 선택할 수 있다. */
  caption: ReactNode
  captionVisible?: boolean
  containerClassName?: string
}

/**
 * 운영 목록을 위한 Table wrapper. horizontal overflow와 caption을 강제하고
 * `data-density`를 상위 shell에서 받아 comfortable/compact row 간격을 공유한다.
 */
export function DataTable({
  caption,
  captionVisible = false,
  containerClassName,
  className,
  children,
  ...rest
}: DataTableProps) {
  return (
    <div className={cn('max-w-full overflow-x-auto rounded-panel border border-stroke-subtle', containerClassName)}>
      <Table className={className} {...rest}>
        <caption
          className={cn(
            captionVisible
              ? 'border-b border-stroke-subtle bg-surface-card px-4 py-3 text-left text-sm font-semibold text-foreground-primary'
              : 'sr-only',
          )}
        >
          {caption}
        </caption>
        {children}
      </Table>
    </div>
  )
}
