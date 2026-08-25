
import { TransitionLink } from '../../components/TransitionLink'
import { Logo } from '../../components/Logo'
import { SERVICE_TAGLINE } from '../../lib/brand'

// 교내 유관 사이트(기관 요청으로 랜딩 푸터에만 노출). 라벨은 각 사이트의 공식 명칭.
const familySites = [
  { href: 'https://code.pusan.ac.kr', label: '코드플레이스' },
  { href: 'https://swcss.pusan.ac.kr', label: 'AI역량지원시스템' },
  { href: 'https://aipms.pusan.ac.kr', label: 'PNU AIPMS' },
  { href: 'https://opus.pusan.ac.kr', label: 'SW프로젝트관리시스템' },
]

export function LandingFooter() {
  return (
    <footer className="border-t border-white/10 bg-neutral-950">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Logo tone="inverse" />
            <p className="mt-3 text-sm leading-relaxed text-neutral-400">
              부산대학교 구성원을 위한 클라우드 플랫폼입니다.
            </p>
          </div>
          <nav aria-label="바로가기" className="flex flex-wrap gap-x-12 gap-y-8 text-sm">
            <div className="flex flex-col gap-2">
              <span className="font-semibold text-neutral-200">시작하기</span>
              <TransitionLink to="/signup" className="text-neutral-400 transition-colors hover:text-white">
                회원가입
              </TransitionLink>
              <TransitionLink to="/login" className="text-neutral-400 transition-colors hover:text-white">
                로그인
              </TransitionLink>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-semibold text-neutral-200">둘러보기</span>
              <a href="#resources" className="text-neutral-400 transition-colors hover:text-white">
                리소스
              </a>
              <a href="#features" className="text-neutral-400 transition-colors hover:text-white">
                주요 기능
              </a>
              <a href="#access" className="text-neutral-400 transition-colors hover:text-white">
                사용 방식
              </a>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-semibold text-neutral-200">패밀리 사이트</span>
              {familySites.map((site) => (
                <a
                  key={site.href}
                  href={site.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-400 transition-colors hover:text-white"
                >
                  {site.label}
                </a>
              ))}
            </div>
          </nav>
        </div>
        <p className="mt-10 border-t border-white/10 pt-6 text-xs text-neutral-400">
          {SERVICE_TAGLINE}
        </p>
      </div>
    </footer>
  )
}
