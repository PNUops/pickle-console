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
 * 공지 팝업 한 장.
 *
 * `Modal` 의 3단 마크업(제목 줄, 넘치면 스크롤되는 본문, 동작 줄)을 그대로
 * 가져오되 **막는 부분을 전부 뺀 것**이다. 뺀 것이 셋이고 셋 다 의도된 것이다:
 *
 * - **전체 화면 덮개가 없다.** `Modal` 은 `fixed inset-0` 두 겹으로 뷰포트를
 *   덮어 뒤를 클릭할 수 없게 한다. 공지는 읽는 동안에도 하던 일을 계속할 수
 *   있어야 하므로 카드 자신의 사각형 밖에서는 아무 이벤트도 받지 않는다.
 * - **포커스 트랩이 없다.** `useFocusTrap` 은 `document.body` 의 overflow 를
 *   hidden 으로 바꾼다. 그것을 쓰는 순간 페이지 스크롤이 잠겨 다시 차단이 된다.
 * - **`aria-modal` 을 붙이지 않는다.** 뒤가 살아 있으므로 붙이면 거짓말이고,
 *   보조기술이 나머지 화면을 없는 것으로 취급하게 만든다.
 *
 * Escape 는 전역이 아니라 **이 카드 안에 포커스가 있을 때만** 듣는다. 전역
 * 리스너를 걸면 공지가 떠 있는 동안 열린 모달의 Escape 를 가로챈다.
 */
export function NoticePopupCard({
  title,
  onClose,
  children,
  footer,
  style,
  className,
}: NoticePopupCardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    // 카드 안에서 눌린 Escape 만 여기서 끝낸다. 밖으로 흘려보내면 뒤에 있는
    // 다른 것이 함께 닫힌다.
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
        // 높이 상한은 dvh 로 잰다 — 모바일 브라우저 크롬이 계산에 들어간다.
        'flex w-80 max-w-[calc(100vw-2rem)] flex-col',
        'max-h-[calc(100dvh-7rem)] rounded-card bg-white shadow-overlay',
        // 계단식으로 포개지므로 테두리가 있어야 어디까지가 한 장인지 보인다.
        'border border-neutral-200',
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
