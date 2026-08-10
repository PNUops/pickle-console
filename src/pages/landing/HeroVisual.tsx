import { Suspense, lazy } from 'react'
import { ErrorBoundary } from '../../components/ui'
import { HeroFallback } from './HeroFallback'

// three + R3F(~160KB gzip)는 랜딩 히어로에서만 쓰므로 지연 로드한다.
const HeroScene = lazy(() => import('./HeroScene'))

/** 3D 로딩 중/실패 시 정적 폴백 — 캔버스와 같은 레이어에서 우측에 배치. */
function FallbackLayer() {
  return (
    <div className="flex h-full w-full items-center justify-end lg:pr-[4%]">
      <div className="w-full max-w-[540px]">
        <HeroFallback />
      </div>
    </div>
  )
}

/**
 * 히어로 전체를 덮는 3D 레이어. pointer-events를 끊어 위의 텍스트/CTA(z-10)와
 * 상호작용이 충돌하지 않는다(패럴랙스는 HeroScene이 window 좌표로 추적).
 */
export function HeroVisual() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {/* 3D 청크 로드/렌더 실패 시(구형 브라우저, 네트워크 오류) 정적 폴백으로 강등. */}
      <ErrorBoundary label="히어로 3D" fallback={<FallbackLayer />}>
        <Suspense fallback={<FallbackLayer />}>
          <HeroScene />
        </Suspense>
      </ErrorBoundary>
    </div>
  )
}
