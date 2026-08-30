import { TransitionLink } from '../../components/TransitionLink'
import { useSyncExternalStore } from 'react'

import { homePathFor, useAuth } from '../../auth/auth-context'
import { HeroFallback } from './HeroFallback'
import { HeroVisual } from './HeroVisual'
import { Reveal } from './Reveal'

// Tailwind lg(64rem) 기준. CSS 숨김이 아니라 조건부 렌더로 분기해야
// 모바일이 3D 청크(~160KB gzip)와 WebGL 컨텍스트를 아예 만들지 않는다.
const DESKTOP_QUERY = '(min-width: 64rem)'
const subscribeDesktop = (onChange: () => void) => {
  const mql = window.matchMedia(DESKTOP_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}
const isDesktopNow = () => window.matchMedia(DESKTOP_QUERY).matches

/** 다크 히어로 — 좌측 에디토리얼 타이포 + 우측 3D 비주얼(데스크톱 한정). */
export function Hero() {
  const { status, user } = useAuth()
  const isDesktop = useSyncExternalStore(subscribeDesktop, isDesktopNow)

  return (
    <section className="relative overflow-hidden bg-neutral-950">
      {/* 배경: 미세 그리드 + 틸 글로우(절제된 1~2개) */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgb(255 255 255 / 0.035) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.035) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 90% 80% at 50% 40%, black 35%, transparent 78%)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(640px circle at 72% 34%, rgb(46 139 158 / 0.26), transparent 65%), radial-gradient(520px circle at 12% 88%, rgb(30 77 91 / 0.35), transparent 70%)',
        }}
      />

      {/* 3D 레이어 — 히어로(다크 영역) 전체를 덮는다. 별 파티클이 화면 전역에 깔리고
          궤도 씬은 씬 내부에서 우측으로 배치된다. */}
      {isDesktop && <HeroVisual />}

      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-7xl flex-col justify-center px-4 pt-20 sm:px-6">
        <div className="grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:py-8">
          {/* 좌측: 카피 */}
          <div>
            <Reveal>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-neutral-300">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-400 opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary-400" />
                </span>
                부산대학교 클라우드 플랫폼
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="mt-6 text-[2.6rem]/[1.12] font-extrabold tracking-tight text-white sm:text-6xl/[1.08] xl:text-[4.25rem]/[1.06]">
                서비스가 시작되는 곳 <br className="hidden sm:block" />
                <span className="whitespace-nowrap text-[0.9837em]">
                  PNU Cloud,{' '}
                  <span className="text-[1.08em] font-black bg-gradient-to-r from-primary-300 to-primary-500 bg-clip-text text-transparent">
                    Pickle
                  </span>
                </span>
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-400">
                필요한 컴퓨팅 리소스를 하나의 플랫폼에서 관리합니다.{' '}
                <br className="hidden sm:block" />
                승인되면 자동으로 준비되고, 콘솔에서 바로 사용합니다.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                {status === 'loading' ? (
                  // 세션 복원 중 — 잘못된 CTA가 잠깐 보였다 바뀌는 깜빡임 방지
                  <div aria-hidden="true" className="h-12" />
                ) : status === 'authenticated' && user ? (
                  <TransitionLink
                    to={homePathFor(user.role)}
                    className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-primary-500 px-6 text-base font-semibold text-white shadow-[0_0_32px_rgb(46_139_158/0.45)] transition-colors hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
                  >
                    콘솔로 이동
                    <span aria-hidden="true">→</span>
                  </TransitionLink>
                ) : (
                  <>
                    {/* 소개 페이지(노션)는 외부 문서라 라우터를 타지 않는다 */}
                    <a
                      href="https://pnuops.notion.site/pickle-intro"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-primary-500 px-6 text-base font-semibold text-white shadow-[0_0_32px_rgb(46_139_158/0.45)] transition-colors hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
                    >
                      서비스 소개
                      <span aria-hidden="true">→</span>
                    </a>
                    <TransitionLink
                      to="/login"
                      className="inline-flex h-12 items-center rounded-xl border border-white/15 bg-white/5 px-6 text-base font-medium text-neutral-200 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
                    >
                      로그인
                    </TransitionLink>
                  </>
                )}
              </div>
            </Reveal>
          </div>

          {/* 모바일(<lg): 3D 청크를 아예 받지 않고 경량 정적 폴백만 렌더 */}
          {!isDesktop && (
            <Reveal delay={0.2} className="mx-auto w-full max-w-xs">
              <HeroFallback />
            </Reveal>
          )}
        </div>

        {/* 스크롤 힌트 */}
        <a
          href="#resources"
          aria-label="아래로 스크롤"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full p-2 text-neutral-500 transition-colors hover:text-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5 animate-bounce motion-reduce:animate-none"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </a>
      </div>
    </section>
  )
}
