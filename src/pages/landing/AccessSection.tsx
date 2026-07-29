import { SSH_GATEWAY_HOST } from '../../lib/hosts'
import { icons } from './landing-data'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'
import { TerminalMock } from './TerminalMock'

const accessMethods = [
  {
    icon: 'key',
    title: 'SSH 게이트웨이',
    description:
      '콘솔에 등록한 SSH 키로 접속합니다. 교내망 밖에서도 VPN 없이 연결됩니다.',
    meta: `ssh <vm-slug>@${SSH_GATEWAY_HOST}`,
  },
  {
    icon: 'terminal',
    title: '웹 터미널',
    description:
      '브라우저에서 바로 셸을 엽니다. SSH 클라이언트나 키가 없는 실습실 PC에서도 쓸 수 있습니다.',
    meta: '콘솔 → 내 VM → 터미널 열기',
  },
] as const

/** 접속 방식 — 좌측 터미널 목업 + 우측 두 가지 접속 경로. */
export function AccessSection() {
  return (
    <section id="access" aria-labelledby="access-title" className="scroll-mt-16 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
        <SectionHeading
          eyebrow="접속 방식"
          title="터미널이 있어도, 없어도"
          titleId="access-title"
          description="익숙한 SSH와 브라우저 웹 터미널, 두 가지 길을 모두 제공합니다."
        />
        <div className="mt-14 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <TerminalMock />
          </Reveal>
          <div className="flex flex-col gap-6">
            {accessMethods.map((method, index) => (
              <Reveal key={method.title} delay={0.1 + index * 0.08}>
                <div className="rounded-card border border-neutral-200 bg-neutral-50 p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary-600 text-white">
                      {icons[method.icon]}
                    </span>
                    <h3 className="text-lg font-bold text-neutral-900">{method.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                    {method.description}
                  </p>
                  <p className="mt-3 inline-block rounded-lg bg-neutral-900 px-3 py-1.5 font-mono text-xs text-primary-300">
                    {method.meta}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
