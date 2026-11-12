import { icons } from './landing-data'
import { TransitionLink } from '../../components/TransitionLink'

export function SharedManagement() {
  return (
    <section
      id="sharing"
      aria-labelledby="sharing-title"
      className="scroll-mt-20 border-t border-neutral-200 bg-neutral-50"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid gap-9 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <div className="max-w-xl">
            <p className="text-sm font-semibold text-primary-700">함께 사용하기</p>
            <h2
              id="sharing-title"
              className="mt-3 text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl"
            >
              워크스페이스에서<br className="hidden sm:block" /> 함께 관리해요
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-600">
              개인 작업과 수업, 연구실, 프로젝트의 리소스를 한곳에 모아요.
            </p>
            <TransitionLink
              to="/docs/workspaces/access"
              className="mt-6 flex w-fit items-center gap-2 rounded-sm text-sm font-semibold text-primary-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600"
            >
              접근 권한 설정 가이드
              <span aria-hidden="true">→</span>
            </TransitionLink>
          </div>

          <div className="space-y-7">
            <article className="flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary-700 ring-1 ring-neutral-200">
                {icons.users}
              </span>
              <div>
                <h3 className="text-lg font-semibold text-neutral-950">구성원과 리소스를 한 공간에</h3>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  구성원을 초대하고 가상머신, LLM API 키, 도메인을 함께 관리해요.
                </p>
              </div>
            </article>
            <article className="flex items-start gap-4 border-t border-neutral-200 pt-7">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary-700 ring-1 ring-neutral-200">
                {icons.key}
              </span>
              <div>
                <h3 className="text-lg font-semibold text-neutral-950">리소스마다 필요한 접근 권한</h3>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  구성원 초대와 별도로 리소스별 조회와 접속, 설정 변경 권한을 정해요.
                </p>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  )
}
