import { icons, resourceTypes } from './landing-data'
import { Reveal } from './Reveal'

const live = resourceTypes.filter((r) => r.status === 'live')
const planned = resourceTypes.filter((r) => r.status === 'planned')

/**
 * 리소스 종류 — 서비스 중인 카드 2장과 준비 중 카드 묶음. 히어로의 다크 블록을
 * 이어받아 "이 플랫폼이 무엇을 주는 곳인지"를 스크롤 첫 화면에서 답한다.
 * 준비 중 카드는 감쇠된 톤 + '준비 중' 배지 — 콘솔 사이드바의 회색 비활성 항목과
 * 같은 관행이고, 라인업도 사이드바와 같게 유지한다(landing-data.tsx 주석 참조).
 */
export function ResourceShowcase() {
  return (
    <section
      id="resources"
      aria-labelledby="resources-title"
      className="scroll-mt-16 bg-neutral-950"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
        {/* 다크 배경 전용 헤딩 — SectionHeading은 라이트 본문 색이라 쓰지 않는다 */}
        <Reveal className="max-w-2xl">
          <p className="font-mono text-sm font-semibold text-primary-400">리소스</p>
          <h2
            id="resources-title"
            className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
          >
            지금 쓸 수 있는 것, 준비 중인 것
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-neutral-400">
            가상머신과 LLM API 키는 지금 신청할 수 있습니다.{' '}
            <br className="hidden sm:block" />
            나머지도 같은 콘솔, 같은 절차로 준비하고 있습니다.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-2">
          {live.map((resource, index) => (
            <Reveal key={resource.title} delay={index * 0.08}>
              <div className="relative h-full overflow-hidden rounded-card border border-white/10 bg-white/5 p-8">
                {/* 히어로와 같은 배경 문법: 카드 상단의 옅은 틸 글로우 */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(320px circle at 20% 0%, rgb(46 139 158 / 0.18), transparent 70%)',
                  }}
                />
                <div className="relative">
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary-500 text-white">
                      {icons[resource.icon]}
                    </span>
                    <h3 className="text-xl font-bold text-white">{resource.title}</h3>
                    {resource.badge ? (
                      <span className="rounded-full border border-primary-400/40 bg-primary-400/10 px-2 py-0.5 text-[11px] font-semibold text-primary-300">
                        {resource.badge}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-4 text-[15px] leading-relaxed text-neutral-400">
                    {resource.description}
                  </p>
                  {resource.meta ? (
                    <p className="mt-4 inline-block rounded-lg bg-neutral-900 px-3 py-1.5 font-mono text-xs text-primary-300">
                      {resource.meta}
                    </p>
                  ) : null}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {planned.map((resource, index) => (
            <Reveal key={resource.title} delay={0.12 + index * 0.05}>
              <div className="flex h-full flex-col rounded-card border border-white/[0.07] bg-white/[0.03] p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-neutral-500">{icons[resource.icon]}</span>
                  <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] whitespace-nowrap text-neutral-400">
                    준비 중
                  </span>
                </div>
                <h3 className="mt-4 text-sm font-semibold text-neutral-400">{resource.title}</h3>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
