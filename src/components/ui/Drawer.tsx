import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router'
import { cn } from '../../lib/cn'
import { useFocusTrap } from '../../lib/use-focus-trap'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  className?: string
  children: ReactNode
  /** Action row rendered below the body. */
  footer?: ReactNode
}

/**
 * 우측 슬라이드 인 패널. 목록 화면의 개체 상세+다중 액션 용도로, 소형 확인·폼은
 * `Modal`, 결재급·다탭 상세는 별도 라우트를 쓴다.
 * 열릴 때 마운트되며 진입 애니메이션은 @starting-style로 처리한다 — 미지원
 * 브라우저는 즉시 표시되고, 닫힘은 즉시 언마운트라 퇴장 애니메이션이 없다.
 */
export function Drawer({ open, onClose, title, className, children, footer }: DrawerProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, { active: open, onEscape: onClose })

  // 라우트가 바뀌면 닫는다(드로어 안 링크 이동 대응). onClose는 ref로 최신을
  // 유지해 인라인 콜백이 effect를 재발화시키지 않게 한다.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  const { pathname } = useLocation()
  const previousPathname = useRef(pathname)
  useEffect(() => {
    if (pathname === previousPathname.current) return
    previousPathname.current = pathname
    onCloseRef.current()
  }, [pathname])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-surface-inverse/50 transition-opacity duration-[var(--duration-normal)] starting:opacity-0 motion-reduce:transition-none"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 right-0 flex w-full translate-x-0 flex-col bg-surface-card text-foreground-primary shadow-elevation-3 outline-none transition-transform duration-[var(--duration-normal)] ease-decelerate starting:translate-x-full motion-reduce:transition-none sm:max-w-xl',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-stroke-subtle px-5 py-4">
          <h2 id={titleId} className="type-section-title text-foreground-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="cursor-pointer rounded-control p-1 text-foreground-muted hover:text-foreground-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-stroke-subtle px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
