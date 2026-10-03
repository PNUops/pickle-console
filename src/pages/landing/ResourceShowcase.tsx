import { icons, resourceTypes } from './landing-data'
import { TransitionLink } from '../../components/TransitionLink'

const live = resourceTypes.filter((resource) => resource.status === 'live')

export function ResourceShowcase() {
  return (
    <section
      id="resources"
      aria-labelledby="resources-title"
      className="scroll-mt-20 bg-neutral-950"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-primary-300">리소스</p>
          <h2
            id="resources-title"
            className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl"
          >
            지금 신청할 수 있는 리소스
          </h2>
          <p className="mt-4 text-base leading-relaxed text-neutral-300 sm:text-lg">
            가상머신, LLM API 키, 도메인을 한 콘솔에서 신청하고 관리합니다.
          </p>
        </div>

        <div className="mt-9 grid gap-4 lg:grid-cols-3">
          {live.map((resource) => (
            <article
              key={resource.title}
              className="flex min-w-0 flex-col rounded-2xl border border-white/15 bg-white/[0.04] p-6 sm:p-7"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-300/10 text-primary-300">
                  {icons[resource.icon]}
                </span>
                <h3 className="text-xl font-semibold tracking-tight text-white">
                  {resource.title}
                </h3>
              </div>
              <p className="mt-5 text-sm leading-7 text-neutral-300">
                {resource.description}
              </p>
              <ul className="mt-5 space-y-3 border-t border-white/10 pt-5 text-sm leading-6 text-neutral-200">
                {resource.details.map((detail) => (
                  <li key={detail} className="flex items-start gap-3">
                    <span aria-hidden="true" className="mt-2.5 size-1 shrink-0 rounded-full bg-primary-300" />
                    {detail}
                  </li>
                ))}
              </ul>
              <TransitionLink
                to={resource.guide}
                className="mt-auto flex w-fit items-center gap-2 rounded-sm pt-7 text-sm font-semibold text-primary-300 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-300"
              >
                {resource.guideLabel}
                <span aria-hidden="true">→</span>
              </TransitionLink>
            </article>
          ))}
        </div>

      </div>
    </section>
  )
}
