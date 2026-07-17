import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function Table({ className, ...rest }: ComponentPropsWithRef<'table'>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...rest} />
    </div>
  )
}

export function THead({ className, ...rest }: ComponentPropsWithRef<'thead'>) {
  return <thead className={cn('bg-neutral-50', className)} {...rest} />
}

export function TBody({ className, ...rest }: ComponentPropsWithRef<'tbody'>) {
  return <tbody className={cn('divide-y divide-neutral-100', className)} {...rest} />
}

export function TR({ className, ...rest }: ComponentPropsWithRef<'tr'>) {
  return <tr className={cn('hover:bg-neutral-50', className)} {...rest} />
}

export function TH({ className, ...rest }: ComponentPropsWithRef<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-neutral-200 px-4 py-2.5 text-left font-medium whitespace-nowrap text-neutral-500',
        className,
      )}
      {...rest}
    />
  )
}

export function TD({ className, ...rest }: ComponentPropsWithRef<'td'>) {
  return <td className={cn('px-4 py-3 text-neutral-700', className)} {...rest} />
}

/**
 * 서버 정렬 가능한 컬럼 헤더. 클릭할 때마다 오름차순 → 내림차순 → 해제 순으로
 * 순환하며, 현재 방향을 `aria-sort`로 노출한다.
 */
export function SortableTH({
  direction,
  onSort,
  className,
  children,
}: {
  /** 이 컬럼의 현재 정렬 방향 (정렬 중이 아니면 null). */
  direction: 'asc' | 'desc' | null
  /** 다음 방향 요청 콜백 (해제는 null). */
  onSort: (next: 'asc' | 'desc' | null) => void
  className?: string
  children: ReactNode
}) {
  const next = direction === null ? 'asc' : direction === 'asc' ? 'desc' : null
  return (
    <th
      scope="col"
      aria-sort={direction === null ? undefined : direction === 'asc' ? 'ascending' : 'descending'}
      className={cn(
        'border-b border-neutral-200 px-4 py-2.5 text-left font-medium whitespace-nowrap text-neutral-500',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(next)}
        className="inline-flex cursor-pointer items-center gap-1 hover:text-neutral-800 focus-visible:outline-2 focus-visible:outline-primary-600"
      >
        {children}
        <span aria-hidden="true" className="text-xs">
          {direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '↕'}
        </span>
      </button>
    </th>
  )
}
