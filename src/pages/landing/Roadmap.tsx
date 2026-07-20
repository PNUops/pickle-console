import { icons, roadmapItems } from './landing-data'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'

/** 로드맵 — 아직 개발 중임을 숨기지 않고, 다음에 올 기능을 "예정" 뱃지로 보여 준다. */
export function Roadmap() {
  return (
    <section id="roadmap" aria-labelledby="roadmap-title" className="scroll-mt-16 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
        <SectionHeading
          eyebrow="로드맵"
          title="피클은 지금도 자라는 중입니다"
          titleId="roadmap-title"
          description="아직 개발 단계의 플랫폼입니다. 지금 쓸 수 있는 것 못지않게, 앞으로 준비 중인 것들도 미리 보여 드립니다."
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {roadmapItems.map((item, index) => (
            <Reveal key={item.title} delay={(index % 4) * 0.06}>
              <div className="h-full rounded-card border border-dashed border-neutral-300 bg-neutral-50/60 p-6">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                    {icons[item.icon]}
                  </span>
                  <span className="rounded-full border border-warning-300 bg-warning-50 px-2.5 py-0.5 text-xs font-semibold text-warning-700">
                    예정
                  </span>
                </div>
                <h3 className="mt-4 font-bold text-neutral-800">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{item.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
