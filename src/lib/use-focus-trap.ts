import { useEffect, useRef, type RefObject } from 'react'

// tabindex="-1" 요소(로빙 탭인덱스의 비활성 탭 버튼 등)는 Tab 순환의
// 경계 후보가 되면 안 된다 — 경계로 잡히면 Tab 한 번이 다이얼로그 밖으로 샌다.
const FOCUSABLE =
  'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'

// 활성 트랩 스택. 트랩이 겹치면(드로어 위 모달 등) 최상단 트랩만 Tab·ESC를
// 처리해야 한다 — 둘 다 document 레벨 리스너라, 가드가 없으면 바깥 트랩이
// 포커스를 도로 끌어가고 ESC 한 번에 두 겹이 동시에 닫힌다.
// 스택 순서 = 이펙트 실행 순서. 같은 커밋에서 부모·자식 다이얼로그가 동시에
// 마운트되면 자식 이펙트가 먼저 돌아 순서가 뒤집히므로, 겹치는 다이얼로그는
// 반드시 상호작용(클릭) 뒤 별도 커밋으로 열 것 — 현재 전 사용처가 그렇다.
const trapStack: symbol[] = []

// body 스크롤 락은 트랩별 저장/복원이 아니라 스택 전체로 관리한다(0→1에서
// 잠그고 0으로 돌아올 때만 복원). 트랩별 저장은 라우트 이동 등 서브트리
// 통째 언마운트에서 부모→자식 순으로 cleanup이 돌 때(안쪽 모달이 바깥이
// 잠근 'hidden'을 마지막에 복원) body가 영구히 잠기는 결함이 있었다.
let savedBodyOverflow = ''

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
    const token = Symbol('focus-trap')
    trapStack.push(token)
    if (trapStack.length === 1) {
      savedBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    const previouslyFocused = document.activeElement
    const container = containerRef.current
    const firstFocusable = container?.querySelector<HTMLElement>(FOCUSABLE)
    ;(firstFocusable ?? container)?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (trapStack[trapStack.length - 1] !== token) return
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
      const index = trapStack.indexOf(token)
      const wasTopmost = index === trapStack.length - 1
      if (index !== -1) trapStack.splice(index, 1)
      document.removeEventListener('keydown', onKeyDown)
      if (trapStack.length === 0) {
        document.body.style.overflow = savedBodyOverflow
      }
      // 최상단 트랩의 해제만 복원한다 — 아래층이 먼저 사라질 때 복원하면
      // 아직 열려 있는 위층 다이얼로그에서 포커스를 빼앗는다. 복원 대상이
      // 이미 DOM에서 떨어진 경우(서브트리 통째 언마운트)도 건너뛴다.
      if (wasTopmost && previouslyFocused instanceof HTMLElement
          && previouslyFocused.isConnected) {
        previouslyFocused.focus()
      }
    }
  }, [active, containerRef])
}
