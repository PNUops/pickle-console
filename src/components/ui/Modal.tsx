import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { useFocusTrap } from '../../lib/use-focus-trap'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  className?: string
  children: ReactNode
  /** Action row rendered below the body. */
  footer?: ReactNode
  /**
   * 배경 클릭과 Escape 로 닫히는지. 기본은 닫힌다.
   *
   * 끄는 자리는 하나뿐이다 — 한 번만 보여 주는 값을 담고 있을 때. 복구 코드는
   * 이 화면을 벗어나면 다시 볼 수 없으므로 실수로 닫히면 사용자가 잃는다.
   */
  dismissible?: boolean
}

export function Modal({
  open,
  onClose,
  title,
  className,
  children,
  footer,
  dismissible = true,
}: ModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  // Escape 는 닫기와 같은 길이라 dismissible 이 꺼지면 아무것도 하지 않는다.
  useFocusTrap(panelRef, {
    active: open,
    onEscape: () => {
      if (dismissible) onClose()
    },
  })

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-neutral-950/50"
        onClick={dismissible ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          // 내용이 뷰포트를 넘으면 패널이 위아래로 넘쳐 푸터 버튼에 닿을 수 없고
          // 스크롤바도 생기지 않았다. 형제인 Drawer 는 처음부터 이 모양이다.
          // vh 가 아니라 dvh 여야 모바일 브라우저 크롬이 계산에 들어간다.
          'relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col',
          'rounded-card bg-white shadow-overlay outline-none',
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold text-neutral-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            hidden={!dismissible}
            className="cursor-pointer rounded p-1 text-neutral-400 hover:text-neutral-600 focus-visible:outline-2 focus-visible:outline-primary-600"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-100 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
