import { useSyncExternalStore } from 'react'
import { homePathFor, useAuth } from '../../auth/auth-context'
import { TransitionLink } from '../../components/TransitionLink'
import { HeroVisual } from './HeroVisual'
import { HeroFallback } from './HeroFallback'
import { Reveal } from './Reveal'

const desktopQuery = '(min-width: 64rem)'
const subscribeDesktop = (onChange: () => void) => {
  const media = window.matchMedia(desktopQuery)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
const isDesktop = () => window.matchMedia(desktopQuery).matches

export function Hero() {
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop)
  const { status, user } = useAuth()
  return (
    <section className="relative isolate overflow-hidden bg-neutral-950">
      <div aria-hidden="true" className="absolute inset-0" style={{
        backgroundImage: 'linear-gradient(to right, rgb(255 255 255 / 0.035) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.035) 1px, transparent 1px)',
        backgroundSize: '56px 56px', maskImage: 'radial-gradient(ellipse 90% 80% at 50% 40%, black 35%, transparent 78%)',
      }} />
      <div aria-hidden="true" className="absolute inset-0" style={{
        background: 'radial-gradient(640px circle at 72% 34%, rgb(46 139 158 / 0.26), transparent 65%), radial-gradient(520px circle at 12% 88%, rgb(30 77 91 / 0.35), transparent 70%)',
      }} />
      {desktop && <HeroVisual />}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col justify-center px-4 pt-28 pb-16 sm:px-6 lg:min-h-svh lg:pt-20 lg:pb-24">
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
          <div className="min-w-0">
            <Reveal>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-neutral-300">
                <span aria-hidden="true" className="size-2 rounded-full bg-primary-300" />부산대학교 클라우드 플랫폼
              </p>
              <h1 className="mt-6 text-[clamp(2rem,10.8vw,2.6rem)]/[1.12] font-extrabold tracking-tight text-white sm:text-6xl/[1.08] xl:text-[4.25rem]/[1.06]">
                서비스가 시작되는 곳<br />
                <span className="whitespace-nowrap text-[0.962em]">PNU Cloud,{' '}
                  <span className="bg-gradient-to-r from-primary-300 to-primary-500 bg-clip-text text-[1.08em] font-black text-transparent">Pickle</span>
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
                필요한 컴퓨팅 리소스를 하나의 플랫폼에서 관리합니다.{' '}<br className="hidden sm:block" />
                승인되면 자동으로 준비되고, 콘솔에서 바로 사용합니다.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {status === 'loading' ? <div aria-hidden="true" className="h-12" /> : status === 'authenticated' && user ? (
                  <>
                    <TransitionLink to={homePathFor(user.role)} className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary-600 px-6 text-base font-semibold text-white shadow-[0_0_32px_rgb(46_139_158/0.25)] transition-colors hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300">콘솔로 이동 <span aria-hidden="true">→</span></TransitionLink>
                    <TransitionLink to="/docs/introduction" className="inline-flex h-12 items-center rounded-xl border border-white/20 bg-white/5 px-6 text-base font-medium text-neutral-200 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300">서비스 소개</TransitionLink>
                  </>
                ) : (
                  <>
                    <TransitionLink to="/docs/introduction" className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary-600 px-6 text-base font-semibold text-white shadow-[0_0_32px_rgb(46_139_158/0.25)] transition-colors hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300">서비스 소개 <span aria-hidden="true">→</span></TransitionLink>
                    <TransitionLink to="/login" className="inline-flex h-12 items-center rounded-xl border border-white/20 bg-white/5 px-6 text-base font-medium text-neutral-200 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300">로그인</TransitionLink>
                  </>
                )}
              </div>
            </Reveal>
          </div>
          {!desktop && <div aria-hidden="true" className="mx-auto w-44 sm:w-48"><HeroFallback /></div>}
        </div>
        <a href="#resources" aria-label="리소스 살펴보기" className="mt-6 inline-flex items-center gap-2 self-start text-sm text-neutral-400 hover:text-neutral-200 lg:absolute lg:bottom-8 lg:left-1/2 lg:mt-0 lg:-translate-x-1/2">
          리소스 살펴보기 <span aria-hidden="true">↓</span>
        </a>
      </div>
    </section>
  )
}
