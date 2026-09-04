import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CodeBlock } from '../components/CodeBlock'
import { CopyButton } from '../components/CopyButton'
import { Alert, Card, CardContent, CardHeader, CardTitle, TBody, TD, TH, THead, Table, TR } from '../components/ui'
import { CONTACT_URL, FEEDBACK_URL } from '../lib/brand'
import {
  LLM_API_BASE_URL,
  LLM_DEFAULT_LIMITS,
  LLM_DEFAULT_MODEL,
  LLM_ERROR_CODES,
  LLM_SUPPORTED_PARAMS,
} from '../lib/llm-api'

const LAST_UPDATED = '2026-09-03'

const CURL_EXAMPLE = `curl ${LLM_API_BASE_URL}/chat/completions \\
  -H "Authorization: Bearer $PICKLE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${LLM_DEFAULT_MODEL}",
    "messages": [{"role": "user", "content": "안녕하세요"}]
  }'`

const PYTHON_EXAMPLE = `import os
from openai import OpenAI

client = OpenAI(
    base_url="${LLM_API_BASE_URL}",
    api_key=os.environ["PICKLE_API_KEY"],
)

response = client.chat.completions.create(
    model="${LLM_DEFAULT_MODEL}",
    messages=[{"role": "user", "content": "안녕하세요"}],
)
print(response.choices[0].message.content)`

const MODELS_EXAMPLE = `curl ${LLM_API_BASE_URL}/models \\
  -H "Authorization: Bearer $PICKLE_API_KEY"`

const OPENCODE_EXAMPLE = `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "pickle": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Pickle",
      "options": {
        "baseURL": "${LLM_API_BASE_URL}",
        "apiKey": "{env:PICKLE_API_KEY}"
      },
      "models": {
        "${LLM_DEFAULT_MODEL}": {
          "name": "Pickle General",
          "limit": { "context": 65536, "output": 8192 }
        }
      }
    }
  },
  "model": "pickle/${LLM_DEFAULT_MODEL}"
}`

export function DocsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold text-neutral-900">사용 가이드</h1>
      <p className="mt-3 text-sm leading-6 text-neutral-600">
        교내 LLM API를 코드에서 호출하는 방법입니다. OpenAI 호환 API이므로 쓰던 SDK의
        base URL과 LLM API 키만 바꾸면 됩니다. 보낼 수 있는 요청 필드는 아래 지원 파라미터
        절의 목록으로 한정됩니다.
      </p>

      <div className="mt-8 space-y-6">
        <Section title="시작하기">
          <Labeled label="base URL">
            <div className="flex items-center gap-2">
              <code className="rounded-md bg-neutral-100 px-2 py-1 font-mono text-sm text-neutral-800">
                {LLM_API_BASE_URL}
              </code>
              <CopyButton value={LLM_API_BASE_URL} label="복사" />
            </div>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              <Code>/v1</Code>까지가 base URL입니다.
            </p>
          </Labeled>
          <Labeled label="인증">
            <p className="text-sm leading-6 text-neutral-600">
              콘솔에서 발급한 LLM API 키를 <Code>Authorization: Bearer</Code> 헤더에
              넣습니다. 평문은 발급할 때 한 번만 보이므로 소스 코드에 적지 말고 환경
              변수에 둡니다.
            </p>
          </Labeled>
          <CodeBlock label="curl" code={CURL_EXAMPLE} />
        </Section>

        <Section title="모델">
          <p className="text-sm leading-6 text-neutral-600">
            교내에서 직접 서빙하는 모델은 <Code>{LLM_DEFAULT_MODEL}</Code> 하나입니다. 공개
            이름과 실제 모델이 분리되어 있어, 서빙하는 모델이 바뀌어도 코드는 그대로 둡니다.
          </p>
          <p className="text-sm leading-6 text-neutral-600">
            유료 모델은 금액 한도가 부여된 키만 쓸 수 있고, 모델 이름을 그대로 보내면
            됩니다. 금액 한도가 없으면 <Code>credit_unavailable</Code>로 거절됩니다.
          </p>
          <p className="text-sm leading-6 text-neutral-600">
            키에 따라 쓸 수 있는 유료 모델이 정해져 있을 수 있습니다. 목록 밖 모델은{' '}
            <Code>model_not_allowed</Code>로 거절되며, 이때는 금액 한도가 아니라 허용
            목록이 원인이므로 키 상세에서 무엇이 열려 있는지 확인해 주세요. 목록이 비어
            있으면 금액 한도 안에서 모든 유료 모델을 쓸 수 있습니다.
          </p>
          <p className="text-sm leading-6 text-neutral-600">
            아래 요청은 교내 서빙 모델 목록을 돌려줍니다. 유료 모델은 목록에 나오지
            않습니다.
          </p>
          <CodeBlock label="curl" code={MODELS_EXAMPLE} />
        </Section>

        <Section title="Python SDK 연결">
          <p className="text-sm leading-6 text-neutral-600">
            공식 <Code>openai</Code> 패키지를 그대로 씁니다.
          </p>
          <CodeBlock label="Python" code={PYTHON_EXAMPLE} />
        </Section>

        <Section title="코딩 에이전트 연결">
          <p className="text-sm leading-6 text-neutral-600">
            opencode에 붙여서 씁니다. 프로젝트 폴더에 <Code>opencode.json</Code>으로
            저장하고 LLM API 키는 <Code>PICKLE_API_KEY</Code> 환경 변수로 넘깁니다.
          </p>
          <CodeBlock label="opencode.json" code={OPENCODE_EXAMPLE} />
          <p className="text-sm leading-6 text-neutral-600">
            <Code>npm</Code> 항목이 <Code>@ai-sdk/openai-compatible</Code>이어야 합니다. 다른
            프로바이더 패키지는 동작이 확인되지 않았습니다.
          </p>
          <p className="text-sm leading-6 text-neutral-600">
            <Code>limit</Code>을 넣지 않으면 모델 정보에 컨텍스트가 <Code>0</Code>으로
            표시됩니다. <strong>대화가 유지되지 않는다는 뜻은 아닙니다.</strong> 이전 대화는
            매 요청에 함께 실려 가고, 도구가 창 크기를 몰라서 남은 양을 보여 주지 못하고 대화를
            줄일 시점도 잡지 못하는 것입니다. 그대로 두면 대화가 길어졌을 때 경고 없이 한도를
            넘어 <Code>upstream_rejected</Code>로 실패합니다. 교내 서빙 모델의 입출력 합계
            한도는 65,536토큰이고, <Code>output</Code>은 답변 몫으로 남겨 둘 양이라 필요에 맞춰
            정합니다.
          </p>
          <p className="text-sm leading-6 text-neutral-600">
            Claude Code와 Codex는 붙지 않습니다. 각각 Anthropic Messages API와 OpenAI
            Responses API를 요구하는데, 이 API가 제공하는 것은 OpenAI Chat Completions
            하나입니다. 2026-09-03 기준입니다.
          </p>
        </Section>

        <Section title="지원 파라미터">
          <p className="text-sm leading-6 text-neutral-600">
            요청 본문에 넣을 수 있는 최상위 필드입니다.
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {LLM_SUPPORTED_PARAMS.map((param) => (
              <li
                key={param}
                className="rounded-md bg-neutral-100 px-2 py-1 font-mono text-xs text-neutral-700"
              >
                {param}
              </li>
            ))}
          </ul>
          <Alert variant="info" title="목록에 없는 필드는 거부됩니다">
            모르는 필드는 무시하고 전달하는 것이 아니라 요청 전체를 400으로 되돌립니다.
            응답의 <Code>error.code</Code>가 <Code>unsupported_parameter</Code>이고 메시지에
            해당 필드 이름이 담깁니다.
          </Alert>
        </Section>

        <Section title="한도">
          <p className="text-sm leading-6 text-neutral-600">
            아래 한도는 <strong>교내 서빙 모델에만 적용됩니다.</strong> 유료 모델 호출은 이
            한도를 쓰지 않고 금액 한도가 통제합니다. 표의 값은 키에 별도 한도가 부여되지
            않았을 때 적용됩니다.
          </p>
          <Table>
            <THead>
              <TR>
                <TH>항목</TH>
                <TH>기본값</TH>
              </TR>
            </THead>
            <TBody>
              <TR>
                <TD>분당 요청 수</TD>
                <TD>{LLM_DEFAULT_LIMITS.requestsPerMinute}회</TD>
              </TR>
              <TR>
                <TD>분당 토큰 수</TD>
                <TD>{LLM_DEFAULT_LIMITS.tokensPerMinute.toLocaleString('ko-KR')}토큰</TD>
              </TR>
              <TR>
                <TD>동시 요청 수</TD>
                <TD>{LLM_DEFAULT_LIMITS.concurrency}건</TD>
              </TR>
            </TBody>
          </Table>
          <p className="text-sm leading-6 text-neutral-600">
            한도는 키마다 다르게 부여될 수 있습니다. 내 키에 적용된 값은 콘솔의 키 상세
            화면에서 확인합니다. 위 세 가지를 넘으면 429로 거부되고 응답의{' '}
            <Code>Retry-After</Code> 헤더가 다시 시도할 시점을 알려 줍니다.
          </p>
          <p className="text-sm leading-6 text-neutral-600">
            <Code>Retry-After</Code>가 붙는 응답은 넷입니다. 위 세 한도의 429와, 승인된 금액
            한도를 키에 적용하는 중인 <Code>credit_pending</Code>(503)입니다. 일일 토큰 한도(
            <Code>quota_exhausted</Code>), 금액 소진(<Code>credit_exhausted</Code>), 서버가
            몰렸을 때(<Code>server_busy</Code>)에는 붙지 않으므로 재시도 간격을 직접 정합니다.
          </p>
          <p className="text-sm leading-6 text-neutral-600">
            <Code>X-RateLimit-Limit-Requests</Code>와{' '}
            <Code>X-RateLimit-Remaining-Requests</Code> 헤더는 <strong>한도를 통과한 교내 서빙
            모델 응답에만</strong> 실립니다. 유료 모델 응답에는 분당 요청 한도 자체가 없어
            오지 않고, 한도에 걸린 429 응답에도 오지 않습니다.
          </p>
          <p className="text-sm leading-6 text-neutral-600">
            분당 한도와 별개로 <strong>일일 토큰 한도</strong>가 부여될 수 있습니다. 이것도
            교내 서빙 모델에만 적용되고 자정(KST)에 초기화되며, 소진하면{' '}
            <Code>quota_exhausted</Code>로 거절됩니다. 이 한도에는{' '}
            <Code>Retry-After</Code>가 붙지 않습니다. 부여 여부와 남은 양은 키 상세 화면의
            사용량 탭에서 확인합니다.
          </p>
        </Section>

        <Section title="스트리밍과 도구 호출">
          <p className="text-sm leading-6 text-neutral-600">
            <Code>{'"stream": true'}</Code>를 넣으면 응답을 조각으로 받습니다. 토큰 사용량까지
            받으려면 <Code>{'"stream_options": {"include_usage": true}'}</Code>를 함께
            보냅니다.
          </p>
          <p className="text-sm leading-6 text-neutral-600">
            <Code>tools</Code>와 <Code>tool_choice</Code>를 쓰는 도구 호출도 동작합니다.
            스트리밍 응답에서도 도구 호출 인자가 조각으로 나뉘어 도착합니다.
          </p>
        </Section>

        <Section title="에러">
          <p className="text-sm leading-6 text-neutral-600">
            응답 본문은 OpenAI와 같은 모양입니다. 코드에서 분기할 때는 메시지 문구가 아니라{' '}
            <Code>error.code</Code>를 확인합니다. 문구는 다듬어질 수 있지만 코드는 그대로
            유지됩니다.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>code</TH>
                  <TH>HTTP</TH>
                  <TH>뜻</TH>
                </TR>
              </THead>
              <TBody>
                {LLM_ERROR_CODES.map((entry) => (
                  <TR key={entry.code}>
                    <TD>
                      <span className="font-mono text-xs">{entry.code}</span>
                    </TD>
                    <TD>{entry.status}</TD>
                    <TD>{entry.meaning}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Section>

        <Section title="문의">
          <p className="text-sm leading-6 text-neutral-600">
            안내에 없는 내용은{' '}
            <ExternalLink href={CONTACT_URL}>문의 창구</ExternalLink>로, 개선 의견은{' '}
            <ExternalLink href={FEEDBACK_URL}>의견 창구</ExternalLink>로 보내 주세요.
          </p>
          <p className="text-sm leading-6 text-neutral-600">
            특정 요청이 실패한 경우를 문의할 때는 응답의 <Code>X-Request-Id</Code> 헤더
            값을 함께 적어 주시면 그 요청을 바로 찾을 수 있습니다.
          </p>
        </Section>
      </div>

      <p className="mt-10 text-xs text-neutral-500">최종 갱신: {LAST_UPDATED}</p>

      <Link
        to="/"
        className="mt-6 inline-flex h-10 items-center rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      >
        홈으로 이동
      </Link>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      {children}
    </div>
  )
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] text-neutral-800">
      {children}
    </code>
  )
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800"
    >
      {children}
    </a>
  )
}
