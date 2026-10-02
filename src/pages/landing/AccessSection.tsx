import { LLM_DEFAULT_MODEL } from '../../lib/llm-api'
import { LLM_GATEWAY_HOST, SSH_GATEWAY_HOST } from '../../lib/hosts'
import { icons } from './landing-data'
import { TransitionLink } from '../../components/TransitionLink'

const sshExample = `ssh -i ~/.ssh/pickle-my-vm.pem \\
  -o IdentitiesOnly=yes \\
  my-vm@${SSH_GATEWAY_HOST}`

const llmExample = `curl https://${LLM_GATEWAY_HOST}/v1/chat/completions \\
  -H "Authorization: Bearer $PICKLE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${LLM_DEFAULT_MODEL}","messages":[{"role":"user","content":"안녕하세요"}]}'`

const usageOptions = [
  {
    icon: 'terminal',
    title: '가상머신 접속',
    description: 'VM별로 발급받은 SSH 개인키로 접속합니다. 브라우저 웹 터미널에서도 셸을 열 수 있습니다.',
    code: sshExample,
    codeLabel: 'SSH',
    guide: '/docs/vm/connect',
    guideLabel: '접속과 파일 전송 가이드',
  },
  {
    icon: 'chip',
    title: 'LLM API 호출',
    description: '발급한 키와 base URL, 모델 이름을 설정해 호출합니다. OpenAI 호환 SDK에서도 같은 정보를 사용합니다.',
    code: llmExample,
    codeLabel: 'curl',
    guide: '/docs/llm/connect',
    guideLabel: 'LLM API 연결 가이드',
  },
] as const

export function AccessSection() {
  return (
    <section
      id="access"
      aria-labelledby="access-title"
      className="scroll-mt-20 bg-white"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-primary-700">사용 방식</p>
          <h2
            id="access-title"
            className="mt-3 text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl"
          >
            익숙한 도구 그대로
          </h2>
          <p className="mt-4 text-base leading-relaxed text-neutral-600 sm:text-lg">
            SSH와 웹 터미널로 서버에 접속하고, OpenAI 호환 API로 모델을 호출합니다.
          </p>
        </div>

        <div className="mt-9 grid gap-10 lg:grid-cols-2 lg:gap-8">
          {usageOptions.map((option) => (
            <article key={option.title} className="flex min-w-0 flex-col">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                  {icons[option.icon]}
                </span>
                <h3 className="text-xl font-semibold tracking-tight text-neutral-950">
                  {option.title}
                </h3>
              </div>
              <p className="mt-4 text-sm leading-7 text-neutral-600">
                {option.description}
              </p>
              <div className="mt-5 flex flex-1 flex-col overflow-hidden rounded-2xl bg-neutral-950">
                <div className="border-b border-white/10 px-5 py-3 text-xs font-semibold tracking-wide text-primary-200">
                  {option.codeLabel}
                </div>
                <pre
                  aria-label={`${option.title} 명령 예시`}
                  className="min-h-36 min-w-0 overflow-x-auto whitespace-pre-wrap break-words p-5 font-mono text-xs leading-7 text-neutral-100 sm:text-[13px]"
                >
                  <code>{option.code}</code>
                </pre>
              </div>
              <TransitionLink
                to={option.guide}
                className="mt-5 flex w-fit items-center gap-2 rounded-sm text-sm font-semibold text-primary-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600"
              >
                {option.guideLabel}
                <span aria-hidden="true">→</span>
              </TransitionLink>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
