import { featuredCards, features, icons } from './landing-data'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'

const pipelineChips = ['클론', 'cloud-init', 'IP 할당', '부팅', '검증'] as const

/** 주요 기능 — 대형 카드 2장 + 소형 카드의 벤토 그리드. */
export function FeatureGrid() {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-16 bg-neutral-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
        <SectionHeading
          eyebrow="주요 기능"
          title="필요한 건 콘솔에 다 있습니다"
          titleId="features-title"
          description="신청과 승인부터 접속·공개·수명 관리까지 — 서버를 쓰는 동안 겪게 되는 일들을 콘솔 하나로 해결하도록 만들었습니다."
        />

        <div className="mt-14 grid gap-5 lg:grid-cols-6">
          {/* 대형 카드 2장 */}
          {featuredCards.map((card, index) => (
            <Reveal key={card.title} delay={index * 0.08} className="lg:col-span-3">
              <div className="flex h-full flex-col rounded-card border border-neutral-200 bg-white p-8">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary-600 text-white">
                  {icons[card.icon]}
                </span>
                <h3 className="mt-5 text-xl font-bold text-neutral-900">{card.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
                  {card.description}
                </p>
                <div className="mt-auto pt-6">
                  {card.icon === 'zap' ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {pipelineChips.map((chip, chipIndex) => (
                        <span key={chip} className="flex items-center gap-1.5">
                          <span className="rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1 font-mono text-xs text-primary-700">
                            {chip}
                          </span>
                          {chipIndex < pipelineChips.length - 1 ? (
                            <span aria-hidden="true" className="text-xs text-neutral-400">
                              →
                            </span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="inline-block rounded-lg bg-neutral-900 px-3 py-1.5 font-mono text-xs text-primary-300">
                      $ ssh my-vm@ssh.pickle.pnuops.com
                    </p>
                  )}
                </div>
              </div>
            </Reveal>
          ))}

          {/* 소형 카드 */}
          {features.map((feature, index) => (
            <Reveal key={feature.title} delay={(index % 3) * 0.06} className="lg:col-span-2">
              <div className="h-full rounded-card border border-neutral-200 bg-white p-6 transition-shadow hover:shadow-card">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                  {icons[feature.icon]}
                </span>
                <h3 className="mt-4 font-bold text-neutral-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  {feature.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
