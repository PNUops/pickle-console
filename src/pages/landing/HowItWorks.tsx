import { steps } from './landing-data'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'

/** 이용 절차 — 신청 → 검토 → 승인 → 사용 4단계 타임라인. */
export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-title" className="scroll-mt-16 bg-neutral-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
        <SectionHeading
          eyebrow="이용 절차"
          title="네 단계면 리소스가 준비됩니다"
          titleId="how-it-works-title"
          description={
            <>
              신청서 하나로 시작합니다.{' '}
              <br className="hidden sm:block" />
              승인되는 순간 나머지는 플랫폼이 알아서 합니다.
            </>
          }
        />
        <ol className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <Reveal key={step.title} delay={index * 0.08}>
              <li className="relative">
                {/* 단계 연결선(마지막 제외, lg 이상) */}
                {index < steps.length - 1 ? (
                  <div
                    aria-hidden="true"
                    className="absolute top-5 left-12 hidden h-px w-[calc(100%-1.5rem)] bg-gradient-to-r from-neutral-300 to-transparent lg:block"
                  />
                ) : null}
                <span className="flex size-10 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 font-mono text-sm font-bold text-primary-700">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-5 text-lg font-bold text-neutral-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{step.description}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}
