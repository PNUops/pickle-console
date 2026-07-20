import { Hero } from './Hero'
import { LandingFooter } from './LandingFooter'
import { LandingHeader } from './LandingHeader'

/**
 * 랜딩 페이지(/). PublicLayout 밖에서 렌더되는 full-bleed 페이지 — 다크 히어로 위에
 * 자체 헤더가 떠 있고, 본문 섹션(절차/접속/기능/로드맵)이 이어진다.
 */
export function LandingPage() {
  return (
    <div className="bg-neutral-950">
      <LandingHeader />
      <main>
        <Hero />
      </main>
      <LandingFooter />
    </div>
  )
}
