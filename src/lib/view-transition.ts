import { flushSync } from 'react-dom'

/**
 * View Transition으로 감싼 상태 업데이트(라우트 이동 등) — 크로스페이드 전환.
 * 선언형 라우터에서는 Link의 viewTransition prop이 동작하지 않으므로 수동 호출한다.
 * 미지원 브라우저·reduced-motion에서는 즉시 실행된다.
 *
 * 주의: 내부에서 flushSync를 쓰므로 반드시 이벤트 핸들러에서만 호출할 것.
 */
export function withViewTransition(update: () => void) {
  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => unknown
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!doc.startViewTransition || reduced) {
    update()
    return
  }
  doc.startViewTransition(() => flushSync(update))
}
