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
  return (
    <div className="bg-neutral-950">
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
