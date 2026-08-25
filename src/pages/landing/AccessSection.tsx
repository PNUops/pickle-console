import { SSH_GATEWAY_HOST } from '../../lib/hosts'
import { ApiSnippetMock } from './ApiSnippetMock'
import { icons } from './landing-data'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'
import { TerminalMock } from './TerminalMock'

const usageColumns = [
  {
    icon: 'key',
    title: '가상머신 접속',
    description:
      '콘솔에 등록한 SSH 키로 접속합니다. 교내망 밖에서도 VPN 없이 연결되고, SSH 클라이언트가 없는 실습실 PC에서는 브라우저 웹 터미널로 바로 셸을 엽니다.',
    meta: `ssh <vm-slug>@${SSH_GATEWAY_HOST}`,
    mock: <TerminalMock />,
  },
  {
    icon: 'chip',
    title: 'LLM API 호출',
    description:
      '발급한 키를 Authorization 헤더에 넣으면 됩니다. OpenAI 호환이라 쓰던 SDK의 base URL만 바꾸면 그대로 동작합니다.',
    meta: '콘솔 → LLM API 키 → 키 발급',
    mock: <ApiSnippetMock />,
  },
] as const

/** 사용 방식 — 가상머신은 터미널 목업, LLM API 키는 요청 목업으로 나란히 보여 준다. */
export function AccessSection() {
  return (
    <section id="access" aria-labelledby="access-title" className="scroll-mt-16 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
        <SectionHeading
          eyebrow="사용 방식"
          title="익숙한 도구 그대로"
          titleId="access-title"
          description="가상머신은 SSH와 웹 터미널로 접속하고, LLM API 키는 OpenAI 호환 API로 호출합니다."
        />
        <div className="mt-14 grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
          {usageColumns.map((column, index) => (
            <Reveal key={column.title} delay={index * 0.08}>
              <div className="flex flex-col gap-6">
                {column.mock}
                <div className="rounded-card border border-neutral-200 bg-neutral-50 p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary-600 text-white">
                      {icons[column.icon]}
                    </span>
                    <h3 className="text-lg font-bold text-neutral-900">{column.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                    {column.description}
                  </p>
                  <p className="mt-3 inline-block rounded-lg bg-neutral-900 px-3 py-1.5 font-mono text-xs text-primary-300">
                    {column.meta}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
