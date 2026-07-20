
import { TransitionLink } from '../../components/TransitionLink'
import { Logo } from '../../components/Logo'

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
          <nav aria-label="바로가기" className="flex gap-12 text-sm">
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
              <a href="#features" className="text-neutral-400 transition-colors hover:text-white">
                주요 기능
              </a>
              <a href="#access" className="text-neutral-400 transition-colors hover:text-white">
                접속 방식
              </a>
            </div>
          </nav>
        </div>
        <p className="mt-10 border-t border-white/10 pt-6 text-xs text-neutral-400">
          피클 — 부산대학교 클라우드 플랫폼
        </p>
      </div>
    </footer>
  )
}
