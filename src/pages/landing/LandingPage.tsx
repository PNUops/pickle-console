import { useEffect } from 'react'
import { AccessSection } from './AccessSection'
import { FeatureGrid } from './FeatureGrid'
import { FinalCta } from './FinalCta'
import { Hero } from './Hero'
import { HowItWorks } from './HowItWorks'
import { LandingFooter } from './LandingFooter'
import { LandingHeader } from './LandingHeader'
import { Roadmap } from './Roadmap'
import { TrustStrip } from './TrustStrip'

/**
 * 랜딩 페이지(/). PublicLayout 밖에서 렌더되는 full-bleed 페이지 — 다크 히어로 위에
 * 자체 헤더가 떠 있고, 라이트 본문(절차/접속/기능/로드맵)과 다크 CTA·푸터로 이어진다.
 */
export function LandingPage() {
  // 앵커 이동을 부드럽게(reduced-motion이면 브라우저 기본 즉시 이동 유지).
  // 랜딩에서만 적용하고 벗어나면 원복한다.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    document.documentElement.classList.add('scroll-smooth')
    return () => document.documentElement.classList.remove('scroll-smooth')
  }, [])

  return (
    // break-keep: 한국어 헤드라인/문장이 단어 중간에서 끊기지 않게 전체 상속
    <div className="break-keep bg-neutral-950">
      <LandingHeader />
      <main>
        <Hero />
        <TrustStrip />
        <HowItWorks />
        <AccessSection />
        <FeatureGrid />
        <Roadmap />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  )
}
