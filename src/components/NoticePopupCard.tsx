import { type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../lib/cn'

export interface NoticePopupCardProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** 아래에 붙는 동작 줄. */
  footer?: ReactNode
  /** 호스트가 계산한 좌표. 카드는 자기 자리를 정하지 않는다. */
  style?: CSSProperties
  className?: string
}

/**
 * 공지 팝업 한 장. `Modal` 의 3단 마크업에서 막는 것을 뺀 형태다 — 전체 화면
 * 덮개도, `useFocusTrap`(body 스크롤을 잠근다)도, `aria-modal` 도 쓰지 않는다.
 * 셋 중 하나라도 되살아나면 뒤 화면이 다시 막힌다.
 */
export function NoticePopupCard({
  title,
  onClose,
  children,
  footer,
  style,
  className,
}: NoticePopupCardProps) {
  // 전역이 아니라 카드 안의 Escape 만 듣는다. 전역이면 위에 열린 모달의
  // Escape 를 가로챈다.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-label={title}
      onKeyDown={handleKeyDown}
      style={style}
      className={cn(
        // 높이 상한은 호스트의 ROW_STEP 과 짝이다 — 늘리면 아래 줄이 위 줄의
        // 버튼을 가린다. 본문이 길면 카드가 아니라 본문이 스크롤된다.
        'flex w-80 max-w-[calc(100vw-2rem)] flex-col',
        'max-h-72 rounded-card border border-neutral-200 bg-white shadow-overlay',
        className,
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="cursor-pointer rounded p-0.5 text-neutral-400 hover:text-neutral-600 focus-visible:outline-2 focus-visible:outline-primary-600"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
      {footer && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-100 px-4 py-2.5">
          {footer}
        </div>
      )}
    </div>
  )
}
