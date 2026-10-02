import { Logo } from '../../components/Logo'
import { TransitionLink } from '../../components/TransitionLink'
import { CONTACT_URL, DOCS_PATH, SERVICE_TAGLINE } from '../../lib/brand'

export function LandingFooter() {
  return (
    <footer className="border-t border-white/10 bg-neutral-950 text-neutral-400">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-col justify-between gap-8 sm:flex-row">
          <div><Logo tone="inverse" variant="endorsement" /><p className="mt-3 text-sm">부산대학교 구성원을 위한 클라우드 플랫폼입니다.</p></div>
          <nav aria-label="푸터 바로가기" className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <TransitionLink to={DOCS_PATH} className="hover:text-white">사용 가이드</TransitionLink>
            <a href={CONTACT_URL} target="_blank" rel="noreferrer" className="hover:text-white">1:1 문의하기 <span className="sr-only">(새 탭)</span></a>
            <TransitionLink to="/terms/TERMS_OF_SERVICE" className="hover:text-white">이용약관</TransitionLink>
            <TransitionLink to="/terms/PRIVACY_POLICY" className="hover:text-white">개인정보처리방침</TransitionLink>
          </nav>
        </div>
        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-5 text-xs"><p>{SERVICE_TAGLINE}</p><p>© {new Date().getFullYear()} PNUops. All rights reserved.</p></div>
      </div>
    </footer>
  )
}
