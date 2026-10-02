import { homePathFor, useAuth } from '../../auth/auth-context'
import { TransitionLink } from '../../components/TransitionLink'

export function FinalCta() {
  const { status, user } = useAuth()
  return (
    <section aria-labelledby="final-cta-title" className="bg-neutral-50 px-4 pt-4 pb-16 sm:px-6 lg:pb-20">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-neutral-950 px-6 py-12 sm:px-12 sm:py-14">
        <div aria-hidden="true" className="absolute inset-0" style={{ background: 'radial-gradient(480px circle at 80% 10%, rgb(46 139 158 / 0.25), transparent 70%)' }} />
        <div className="relative flex flex-col justify-between gap-7 md:flex-row md:items-center">
          <div><h2 id="final-cta-title" className="text-3xl font-bold tracking-tight text-white">첫 리소스를 신청해 보세요</h2><p className="mt-4 text-base leading-relaxed text-neutral-300">부산대학교 구성원이라면 지금 바로 시작할 수 있습니다.</p></div>
          <div className="flex shrink-0 flex-wrap gap-3">
            {status === 'loading' ? <div aria-hidden="true" className="h-12" /> : status === 'authenticated' && user ? (
              <TransitionLink to={homePathFor(user.role)} className="inline-flex h-12 items-center rounded-xl bg-primary-600 px-6 font-semibold text-white hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300">콘솔로 이동 <span aria-hidden="true" className="ml-2">→</span></TransitionLink>
            ) : (
              <>
                <TransitionLink to="/signup" className="inline-flex h-12 items-center rounded-xl bg-primary-600 px-6 font-semibold text-white hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300">회원가입 <span aria-hidden="true" className="ml-2">→</span></TransitionLink>
                <TransitionLink to="/login" className="inline-flex h-12 items-center rounded-xl border border-white/20 px-6 font-medium text-neutral-200 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300">로그인</TransitionLink>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
