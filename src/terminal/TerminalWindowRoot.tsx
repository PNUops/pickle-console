import { Component, Suspense, lazy, type ReactNode } from 'react'

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
    <TerminalErrorBoundary>
      <Suspense fallback={<div className="h-svh bg-[#0a0a0a]" />}>
        <TerminalWindow vmId={vmId} />
      </Suspense>
    </TerminalErrorBoundary>
  )
}

/**
 * 청크 로드 실패를 검은 화면 대신 안내로 바꾼다.
 *
 * 창이 열려 있는 동안 콘솔이 재배포되면 해시가 붙은 xterm 청크가 404가 되고,
 * lazy import의 거부는 Suspense를 뚫고 나가 루트를 통째로 언마운트한다. 콘솔
 * 안 페이지이던 시절에는 라우트의 ErrorBoundary가 이것을 받아 줬다.
 *
 * 콘솔의 공용 ErrorBoundary를 쓰지 않는 것은 그쪽이 라이트 테마 카드로 그려져
 * 이 창에서 이물감이 크고, 팝업이 콘솔 컴포넌트를 끌어오지 않는다는 선도 함께
 * 지키기 때문이다.
 */
class TerminalErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex h-svh w-full flex-col items-center justify-center gap-4 bg-[#0a0a0a] px-8 text-center">
        <h1 className="text-base font-semibold text-neutral-100">터미널을 불러오지 못했습니다</h1>
        <p className="max-w-md text-sm leading-relaxed text-neutral-400">
          창을 닫고 콘솔에서 다시 열어 주세요. 콘솔이 새로 배포된 뒤라면 이 창이 예전 버전을
          가리키고 있어 생기는 현상입니다.
        </p>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
        >
          창 닫기
        </button>
      </div>
    )
  }
}
