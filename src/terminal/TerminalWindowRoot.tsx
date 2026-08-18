import { Suspense, lazy } from 'react'

// xterm.js(~250kB)는 터미널 창에서만 필요하다 — 콘솔 진입 번들에 들어가지 않게
// 여기서 코드 분할한다.
const TerminalWindow = lazy(() =>
  import('./TerminalWindow').then((m) => ({ default: m.TerminalWindow })),
)

/**
 * 터미널 팝업 문서의 뿌리.
 *
 * 콘솔 트리(AuthProvider·QueryClient·ReauthProvider)를 **하나도** 감싸지 않는
 * 것이 이 컴포넌트의 요점이다 — 팝업이 `/auth/refresh`를 칠 수 있게 되면 부모
 * 탭과의 회전 레이스로 리프레시 체인이 폐기되어 모든 탭이 로그아웃된다.
 */
export function TerminalWindowRoot({ vmId }: { vmId: string }) {
  return (
    <Suspense fallback={<div className="h-svh bg-[#0a0a0a]" />}>
      <TerminalWindow vmId={vmId} />
    </Suspense>
  )
}
