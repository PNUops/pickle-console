import { useEffect } from 'react'
import { AccessSection } from './AccessSection'
import { FamilySites } from './FamilySites'
import { FinalCta } from './FinalCta'
import { Hero } from './Hero'
import { HowItWorks } from './HowItWorks'
import { LandingFooter } from './LandingFooter'
import { LandingHeader } from './LandingHeader'
import { NoticePopupHost } from '../../components/NoticePopupHost'
import { ResourceShowcase } from './ResourceShowcase'
import { SharedManagement } from './SharedManagement'

/**
 * Public landing with resource introductions, usage examples and shared access.
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
      {/* 장애 공지가 가장 필요한 사람은 아직 로그인하지 못한 사람이다. 호스트는
          인증에 기대지 않고, 서버가 대상을 호출자의 인증 상태로 거르므로 익명
          방문자에게는 공개 공지만 뜬다. */}
      <NoticePopupHost />
      <LandingHeader />
      <main>
        <Hero />
        <ResourceShowcase />
        <AccessSection />
        <SharedManagement />
        <HowItWorks />
        <FinalCta />
        <FamilySites />
      </main>
      <LandingFooter />
    </div>
  )
}
