import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { PopoverPanel } from './Popover'
import { usePopover } from './use-popover'

/**
 * 짧은 도움말 팝오버 트리거 — `?` 아이콘 버튼을 누르면 설명 패널이 열린다.
 * 라벨 옆에 인라인으로 붙여 쓰며, 상태·닫힘 규칙은 usePopover가 관리한다.
 */
export function InfoTip({
  label,
  className,
  children,
}: {
  /** 버튼·패널의 접근성 이름 (예: "포트포워딩 도움말"). */
  label: string
  className?: string
  children: ReactNode
}) {
  const { open, toggle, rootRef, triggerRef } = usePopover()

  return (
    <div ref={rootRef} className={cn('relative inline-block align-middle', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={toggle}
        className="inline-flex size-4.5 cursor-pointer items-center justify-center rounded-full border border-neutral-300 text-[11px] font-semibold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-2 focus-visible:outline-primary-600"
      >
        ?
      </button>
      <PopoverPanel
        open={open}
        align="start"
        aria-label={label}
        className="w-64 p-3 text-xs leading-relaxed text-neutral-600"
      >
        {children}
      </PopoverPanel>
    </div>
  )
}
