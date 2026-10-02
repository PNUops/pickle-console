import { steps } from './landing-data'

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-title" className="scroll-mt-16 bg-neutral-50">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
        <p className="text-sm font-semibold text-primary-700">이용 절차</p>
        <h2 id="how-it-works-title" className="mt-3 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
          네 단계면 리소스가 준비됩니다
        </h2>
        <p className="mt-4 text-base text-neutral-600">
          신청서 하나로 시작합니다. 승인되는 순간 나머지는 플랫폼이 알아서 합니다.
        </p>
        <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="font-mono text-sm font-semibold text-primary-700">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-3 text-lg font-bold text-neutral-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
