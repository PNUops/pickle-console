import { Link } from 'react-router'
import { homePathFor, useAuth } from '../../auth/auth-context'
import { Reveal } from './Reveal'

/** 최종 CTA — 히어로의 다크 톤을 되받는 카드로 마무리. */
export function FinalCta() {
  const { status, user } = useAuth()

  return (
    <section aria-labelledby="final-cta-title" className="bg-neutral-50">
      <div className="mx-auto w-full max-w-7xl px-4 pt-4 pb-24 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-neutral-950 px-8 py-16 text-center sm:px-16">
            {/* 히어로와 같은 배경 문법: 그리드 + 틸 글로우 */}
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgb(255 255 255 / 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.04) 1px, transparent 1px)',
                backgroundSize: '48px 48px',
                maskImage: 'radial-gradient(ellipse 70% 90% at 50% 50%, black 30%, transparent 75%)',
              }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(480px circle at 50% 0%, rgb(46 139 158 / 0.3), transparent 70%)',
              }}
            />
            <div className="relative">
              <h2
                id="final-cta-title"
                className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
              >
                첫 서버를 신청해 보세요
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-neutral-400">
                부산대학교 구성원이라면 지금 바로. 가입부터 접속까지, 오래 걸리지 않습니다.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                {status === 'authenticated' && user ? (
                  <Link
                    to={homePathFor(user.role)}
                    className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-primary-500 px-7 text-base font-semibold text-white shadow-[0_0_32px_rgb(46_139_158/0.45)] transition-colors hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
                  >
                    콘솔로 이동
                    <span aria-hidden="true">→</span>
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/signup"
                      className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-primary-500 px-7 text-base font-semibold text-white shadow-[0_0_32px_rgb(46_139_158/0.45)] transition-colors hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
                    >
                      회원가입
                      <span aria-hidden="true">→</span>
                    </Link>
                    <Link
                      to="/login"
                      className="inline-flex h-12 items-center rounded-xl border border-white/15 bg-white/5 px-7 text-base font-medium text-neutral-200 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
                    >
                      로그인
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
