import { Link } from 'react-router'
import { homePathFor, useAuth } from '../../auth/auth-context'
import { HeroFallback } from './HeroFallback'
import { Reveal } from './Reveal'

/** 다크 히어로 — 좌측 에디토리얼 타이포 + 우측 비주얼(3D 씬은 C3에서 연결). */
export function Hero() {
  const { status, user } = useAuth()

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

      <div className="relative mx-auto flex min-h-svh w-full max-w-7xl flex-col justify-center px-4 pt-16 sm:px-6">
        <div className="grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:py-8">
          {/* 좌측: 카피 */}
          <div>
            <Reveal>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-neutral-300">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-400 opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary-400" />
                </span>
                부산대학교 클라우드 플랫폼 · 개발 진행 중
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="mt-6 text-[2.6rem]/[1.12] font-extrabold tracking-tight text-white sm:text-6xl/[1.08] xl:text-[4.25rem]/[1.06]">
                수업과 프로젝트를 위한
                <br />
                나만의 서버,{' '}
                <span className="bg-gradient-to-r from-primary-300 to-primary-500 bg-clip-text text-transparent">
                  피클
                </span>
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-400">
                학교 이메일로 가입하고 신청서를 제출하세요. 관리자 승인이 끝나면 서버가
                자동으로 만들어지고, SSH와 웹 터미널로 어디서든 접속할 수 있습니다.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                {status === 'authenticated' && user ? (
                  <Link
                    to={homePathFor(user.role)}
                    className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-primary-500 px-6 text-base font-semibold text-white shadow-[0_0_32px_rgb(46_139_158/0.45)] transition-colors hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
                  >
                    콘솔로 이동
                    <span aria-hidden="true">→</span>
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/signup"
                      className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-primary-500 px-6 text-base font-semibold text-white shadow-[0_0_32px_rgb(46_139_158/0.45)] transition-colors hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
                    >
                      지금 시작하기
                      <span aria-hidden="true">→</span>
                    </Link>
                    <Link
                      to="/login"
                      className="inline-flex h-12 items-center rounded-xl border border-white/15 bg-white/5 px-6 text-base font-medium text-neutral-200 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
                    >
                      로그인
                    </Link>
                  </>
                )}
              </div>
            </Reveal>
            <Reveal delay={0.32}>
              <p className="mt-9 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-neutral-500">
                <span className="text-primary-400">@pusan.ac.kr</span> 전용
                <span aria-hidden="true">·</span>
                승인 기반 생성
                <span aria-hidden="true">·</span>
                무료
              </p>
            </Reveal>
          </div>

          {/* 우측: 비주얼 (C3에서 3D 씬으로 교체, 현재는 정적 폴백) */}
          <Reveal delay={0.2} className="hidden lg:block">
            <HeroFallback />
          </Reveal>
        </div>

        {/* 스크롤 힌트 */}
        <a
          href="#how-it-works"
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
