import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** 비모달 팝오버 패널 — 상태는 {@link usePopover}(use-popover.ts)가 관리한다. */
export function PopoverPanel({
  open,
  align = 'end',
  role = 'dialog',
  'aria-label': ariaLabel,
  className,
  children,
}: {
  open: boolean
  align?: 'start' | 'end'
  role?: 'menu' | 'dialog'
  'aria-label': string
  className?: string
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={cn(
        // z-30: 페이지 콘텐츠 위, 모바일 드로어/모달(z-50)·토스트(z-60) 아래
        'absolute z-30 mt-1 rounded-lg border border-neutral-200 bg-white shadow-overlay',
        align === 'end' ? 'right-0' : 'left-0',
        className,
      )}
    >
      {children}
    </div>
  )
}
