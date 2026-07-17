import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * 다이얼로그·드로어 공용 포커스 트랩. 활성화되면 컨테이너의 첫 포커스 가능
 * 요소로 포커스를 옮기고, Tab 순환·ESC 콜백·body 스크롤 락을 걸며,
 * 비활성화 시 이전 포커스를 복원한다.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { active, onEscape }: { active: boolean; onEscape: () => void },
) {
  // Keep the latest onEscape without retriggering the trap effect below —
  // an inline callback prop must not re-yank focus on every parent re-render.
  const onEscapeRef = useRef(onEscape)
  useEffect(() => {
    onEscapeRef.current = onEscape
  })

  useEffect(() => {
    if (!active) return
    const previouslyFocused = document.activeElement
    const container = containerRef.current
    const firstFocusable = container?.querySelector<HTMLElement>(FOCUSABLE)
    ;(firstFocusable ?? container)?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onEscapeRef.current()
        return
      }
      if (event.key !== 'Tab' || !container) return
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusables.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const current = document.activeElement
      if (!(current instanceof Node) || !container.contains(current)) {
        // Focus escaped the dialog — pull it back in.
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }
      if (event.shiftKey && (current === first || current === container)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus()
      }
    }
  }, [active, containerRef])
}
