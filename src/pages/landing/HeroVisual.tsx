import { Component, Suspense, lazy, type ReactNode } from 'react'
import { HeroFallback } from './HeroFallback'

// three + R3F(~160KB gzip)는 랜딩 히어로에서만 쓰므로 지연 로드한다.
const HeroScene = lazy(() => import('./HeroScene'))

/** 3D 청크 로드/렌더 실패 시(구형 브라우저, 네트워크 오류) 정적 폴백으로 강등. */
class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <HeroFallback /> : this.props.children
  }
}

export function HeroVisual() {
  return (
    <SceneErrorBoundary>
      <Suspense fallback={<HeroFallback />}>
        <HeroScene />
      </Suspense>
    </SceneErrorBoundary>
  )
}
