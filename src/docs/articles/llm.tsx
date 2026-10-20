import { GuideFigure } from '../GuideFigure'
import llmRequestImage from '../../assets/docs/llm-request.jpg'
import llmConnectionImage from '../../assets/docs/llm-connection.png'
import llmPermissionsImage from '../../assets/docs/llm-permissions.png'
import llmUsageImage from '../../assets/docs/llm-usage.png'
import { CodeBlock } from '../../components/CodeBlock'
import { CopyButton } from '../../components/CopyButton'
import { Alert, Table, TBody, TD, TH, THead, TR } from '../../components/ui'
import { CONTACT_URL, FEEDBACK_URL } from '../../lib/brand'
import {
  LLM_ANTHROPIC_BASE_URL,
  LLM_API_BASE_URL,
  LLM_DEFAULT_MODEL,
  LLM_ERROR_CODES,
  LLM_FORWARDED_HEADER_MAX_BYTES,
  LLM_FORWARDED_REQUEST_HEADERS,
  LLM_MESSAGES_EXAMPLE_MODEL,
  LLM_PAID_ONLY_PARAMS,
  LLM_PASSTHROUGH_ROUTES,
  LLM_RELAYED_RESPONSE_HEADERS,
  LLM_REQUEST_BODY_MIB,
  LLM_RESPONSES_EXAMPLE_MODEL,
  LLM_SELF_SERVED_PARAMS,
} from '../../lib/llm-api'
import {
  PASSTHROUGH_ENDPOINTS,
  passthroughDescription,
  passthroughLabel,
} from '../../lib/passthrough-endpoints'
import { GuideAction, GuideLink } from '../links'
import type { GuideArticle } from '../types'

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

const PAID_CURL_EXAMPLE = `curl ${LLM_API_BASE_URL}/chat/completions \\
  -H "Authorization: Bearer $PICKLE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "콘솔에서 복사한 유료 모델 ID",
    "messages": [{"role": "user", "content": "안녕하세요"}]
  }'`

const IMAGE_PYTHON_EXAMPLE = `import base64
import os
from pathlib import Path
from openai import OpenAI

client = OpenAI(
    base_url="${LLM_API_BASE_URL}",
    api_key=os.environ["PICKLE_API_KEY"],
)
response = client.images.generate(
    model="이미지 모델 ID",
    prompt="흰 배경 위에 초록색 나무 한 그루를 그려 주세요.",
    n=1,
    response_format="b64_json",
)
Path("generated-image").write_bytes(base64.b64decode(response.data[0].b64_json))`

const EMBEDDING_PYTHON_EXAMPLE = `import os
from openai import OpenAI

client = OpenAI(
    base_url="${LLM_API_BASE_URL}",
    api_key=os.environ["PICKLE_API_KEY"],
)
response = client.embeddings.create(
    model="임베딩 모델 ID",
    input=["첫 번째 문서입니다.", "두 번째 문서입니다."],
)
for item in response.data:
    print(item.index, len(item.embedding))`

const WEB_SEARCH_EXAMPLE = `{
  "model": "콘솔에서 복사한 유료 모델 ID",
  "messages": [{"role": "user", "content": "부산대학교의 최근 공지를 검색하고 출처를 알려 주세요."}],
  "plugins": [{"id": "web"}]
}`

const PDF_OCR_EXAMPLE = `{
  "model": "콘솔에서 복사한 유료 모델 ID",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "이 문서의 핵심 내용을 요약해 주세요."},
      {"type": "file", "file": {
        "filename": "document.pdf",
        "file_data": "https://example.com/document.pdf"
      }}
    ]
  }],
  "plugins": [{"id": "file-parser", "pdf": {"engine": "mistral-ocr"}}]
}`

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

const CLAUDE_CODE_EXAMPLE = `export ANTHROPIC_BASE_URL="${LLM_ANTHROPIC_BASE_URL}"
export ANTHROPIC_AUTH_TOKEN="$PICKLE_API_KEY"
export ANTHROPIC_MODEL="${LLM_MESSAGES_EXAMPLE_MODEL}"
claude`

const ANTHROPIC_PYTHON_EXAMPLE = `import os
from anthropic import Anthropic

client = Anthropic(
    base_url="${LLM_ANTHROPIC_BASE_URL}",
    api_key=os.environ["PICKLE_API_KEY"],
)

message = client.messages.create(
    model="${LLM_MESSAGES_EXAMPLE_MODEL}",
    max_tokens=1024,
    messages=[{"role": "user", "content": "안녕하세요"}],
)
print(message.content[0].text)`

const CODEX_CONFIG_EXAMPLE = `model = "${LLM_RESPONSES_EXAMPLE_MODEL}"
model_provider = "pickle"
web_search = "disabled"

[model_providers.pickle]
name = "Pickle"
base_url = "${LLM_API_BASE_URL}"
env_key = "PICKLE_API_KEY"
wire_api = "responses"`

const RESPONSES_PYTHON_EXAMPLE = `import os
from openai import OpenAI

client = OpenAI(
    base_url="${LLM_API_BASE_URL}",
    api_key=os.environ["PICKLE_API_KEY"],
)

response = client.responses.create(
    model="${LLM_RESPONSES_EXAMPLE_MODEL}",
    input="안녕하세요",
)
print(response.output_text)`

export const llmArticles: GuideArticle[] = [
  {
    slug: 'llm/start',
    title: 'LLM API 신청과 키 발급',
    group: 'LLM API',
    summary: '쓸 모델과 필요한 한도를 정해 신청하고, 승인된 키를 처음 발급합니다.',
    keywords: ['Pickle LLM', '자체 서빙', '유료 모델', '신청', '승인', '키 발급', '토큰', '금액'],
    sections: [
      {
        id: 'prepare',
        title: '준비사항',
        body: <>
          <p>로그인한 뒤 키를 소유할 워크스페이스를 정합니다. 개인 작업에는 개인 워크스페이스를, 함께 관리할 작업에는 그 활동의 워크스페이스를 사용합니다. 키는 승인 후에도 직접 발급해야 호출할 수 있습니다.</p>
          <p>처음 이용한다면 <GuideLink slug="start">시작하기</GuideLink>와 <GuideLink slug="requests/submit">신청서 작성</GuideLink>에서 가입, 워크스페이스, 기관 선택부터 확인하세요.</p>
        </>,
      },
      {
        id: 'choose-models',
        title: '쓸 모델과 한도 선택',
        body: <>
          <p><GuideAction action="newRequest">리소스 신청</GuideAction>에서 <strong>LLM API 키</strong>를 선택합니다. 리소스 구성의 <strong>무엇을 쓸까요</strong>에서 아래 항목 중 하나 이상을 고릅니다. 둘 다 선택할 수 있습니다.</p>
          <ul>
            <li><strong>Pickle LLM</strong>: 학교가 직접 서빙하는 모델입니다. 모델 이름은 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">{LLM_DEFAULT_MODEL}</code>이며 사용 금액이 들지 않습니다. <strong>희망 일일 토큰 수</strong>에 하루 동안 필요한 입력과 출력 토큰을 적습니다.</li>
            <li><strong>유료 모델</strong>: 외부 유료 모델입니다. <strong>희망 금액 한도 (USD)</strong>에 이 키에 필요한 금액을 적습니다. 승인된 금액을 다 쓰면 호출이 거절됩니다.</li>
          </ul>
          <p>필요량은 예상 요청 횟수와 한 요청의 입력 및 출력 길이로 계산합니다. 예를 들어 하루 100회, 요청마다 입력 1,000토큰과 출력 1,000토큰을 예상하면 하루 약 200,000토큰입니다. 대화를 이어가며 이전 메시지를 다시 보내는 양도 포함하세요.</p>
          <p>토큰 수를 비우면 서비스 기본값을 요청하고, 금액을 비우면 관리자가 정합니다. 실제 부여값은 승인 결과로 확인합니다. 분당 요청 수, 분당 토큰 수와 동시 요청 수는 신청서의 입력 항목이 아닙니다.</p>
          <p><strong>필요한 기능</strong>에서 이 키로 쓸 기능을 고릅니다. Chat은 미리 선택되어 있습니다. Chat 밖의 기능은 유료 모델에서만 동작하므로 <strong>유료 모델</strong>을 선택해야 고를 수 있고, 웹 검색과 PDF OCR은 Chat 요청 안에서 쓰는 기능이라 Chat을 선택해야 고를 수 있습니다. 실제로 부여할 기능은 관리자가 승인할 때 정합니다.</p>
          <ul>
            {PASSTHROUGH_ENDPOINTS.map((feature) => <li key={feature}><strong>{passthroughLabel(feature)}</strong>: {passthroughDescription(feature)}.</li>)}
          </ul>
          <GuideFigure
            src={llmRequestImage}
            alt="LLM API 키 신청의 Chat, 웹 검색, PDF OCR, 이미지 생성과 임베딩 기능 선택"
            caption="유료 모델을 선택하면 리소스 구성의 필요한 기능에서 Chat 외의 기능도 고를 수 있습니다. 화면은 합성 데이터 예시입니다."
            width={726}
            height={372}
          />
        </>,
      },
      {
        id: 'submit',
        title: '신청서 제출',
        body: <>
          <ol>
            <li><strong>리소스 구성</strong>에서 이름, 쓸 모델, 필요한 한도와 기능을 입력합니다.</li>
            <li><strong>신청 정보</strong>에서 기관과 워크스페이스, 사용 목적, 사용 기간을 선택하고 필요한 추가 설명을 적습니다.</li>
            <li><strong>검토</strong>에서 신청 내용을 읽고 제출합니다.</li>
          </ol>
          <p>사용 목적에는 어떤 작업에 누가 얼마나 쓰는지 적습니다. 예: “수업 팀 프로젝트의 문서 검색 기능을 개발합니다. 팀원 4명이 하루 약 100회 테스트하며 입력과 출력 합계 200,000토큰을 예상합니다.”</p>
          <p>특정 유료 모델이 필요하면 모델 이름과 필요한 이유를 추가 설명에 적습니다. 모델을 쓸 권한과 기능 권한은 별도로 부여됩니다.</p>
        </>,
      },
      {
        id: 'issue',
        title: '승인 후 키 발급',
        body: <>
          <ol>
            <li><GuideAction action="requests">신청 내역 확인</GuideAction>에서 승인 상태와 부여 내용을 확인합니다. 대기, 반려, 취소에 대한 설명은 <GuideLink slug="requests/status">신청 상태</GuideLink>를 참고하세요.</li>
            <li><GuideAction action="llmKeys">LLM API 키 목록</GuideAction>에서 승인된 키를 엽니다. <strong>발급 전</strong>이면 아직 API를 호출할 키 값이 없습니다.</li>
            <li><strong>개요 → 키 발급</strong>을 누르고 확인 창에서 발급합니다.</li>
            <li>발급 완료 창에서 평문 키를 복사해 안전한 곳에 보관합니다. 창을 닫으면 같은 값을 다시 조회할 수 없습니다.</li>
          </ol>
          <Alert variant="info" title="키 발급 권한">
            이 키의 접근 목록에서 소유자 등급을 받은 사람만 발급할 수 있습니다. 워크스페이스 소유자라는 이유만으로 키 발급 권한이 생기지는 않습니다.
          </Alert>
          <p>키 값은 소스 코드나 공유 문서에 적지 말고 실행 환경의 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">PICKLE_API_KEY</code> 환경 변수에 넣습니다. 브라우저에 배포하는 JavaScript에도 넣지 마세요.</p>
        </>,
      },
      {
        id: 'check',
        title: '성공 확인과 다음 행동',
        body: <>
          <p>키가 <strong>활성</strong>으로 표시되고 개요에 <strong>연결 정보</strong>가 나타나면 <GuideLink slug="llm/connect" anchor="first-call">첫 호출</GuideLink>을 진행합니다. 유료 모델 금액이 <strong>적용 중</strong>이면 반영이 끝날 때까지 기다립니다.</p>
          <p>키가 보이지 않으면 신청한 워크스페이스와 승인 상태를 확인합니다. 발급 버튼이 비활성화되어 있으면 <GuideLink slug="workspaces/access">리소스 접근 권한</GuideLink>을 확인합니다. 만료, 정지, 폐기된 상태는 <GuideLink slug="llm/manage" anchor="status">키 상태별 대응</GuideLink>에서 확인하세요.</p>
        </>,
      },
    ],
  },
  {
    slug: 'llm/connect',
    title: '첫 호출과 도구 연결',
    group: 'LLM API',
    summary: '발급한 키로 첫 응답을 확인하고 Python, opencode, Claude Code, Codex에 연결합니다.',
    keywords: ['curl', 'Python', 'SDK', 'opencode', 'base URL', '인증', 'OpenAI', 'Codex', 'Claude Code', 'Anthropic', 'Messages', 'x-api-key', 'Responses', 'config.toml'],
    sections: [
      {
        id: 'prepare',
        title: '연결 준비',
        body: <>
          <p><GuideLink slug="llm/start" anchor="issue">키 발급</GuideLink>을 마친 뒤 실행할 터미널이나 애플리케이션 환경에 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">PICKLE_API_KEY</code>를 설정합니다. 아래 예제의 키는 환경 변수에서 읽습니다.</p>
          <p>아래의 <code>발급받은 키</code>를 복사한 실제 값으로 바꿉니다. 설정은 현재 터미널에 적용되며 새 터미널에서는 다시 설정해야 합니다. 키를 코드나 공유 설정 파일에 저장하지 마세요.</p>
          <CodeBlock label="macOS / Linux" code={'export PICKLE_API_KEY="발급받은 키"'} />
          <CodeBlock label="Windows PowerShell" code={'$env:PICKLE_API_KEY = "발급받은 키"'} />
          <p>아래 curl 예제는 macOS와 Linux 셸 기준입니다. Windows PowerShell에서는 환경 변수를 설정한 뒤 같은 문서의 Python 예제로 호출할 수 있습니다.</p>
          <p>Pickle은 OpenAI 호환 Chat Completions API를 제공합니다. SDK에는 아래 base URL과 Pickle에서 발급한 키를 넣습니다. OpenAI 계정의 API 키를 넣는 자리가 아닙니다.</p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">{LLM_API_BASE_URL}</code>
            <CopyButton value={LLM_API_BASE_URL} label="base URL 복사" />
          </div>
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">/v1</code>까지가 base URL입니다. 인증에는 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">Authorization: Bearer</code> 헤더를 사용합니다.</p>
          <GuideFigure
            src={llmConnectionImage}
            alt="LLM API 키 상세 개요의 base URL과 모델 이름, 첫 호출 예제"
            caption="키 상세의 개요에서 연결 정보를 확인합니다. base URL과 모델 이름을 코드의 연결 설정에 사용합니다."
            width={1104}
            height={364}
          />
        </>,
      },
      {
        id: 'first-call',
        title: '첫 호출',
        body: <>
          <p>먼저 키 상세의 <strong>개요 → 키 정보</strong>에서 일일 토큰 한도와 유료 모델 금액, Chat 권한을 확인합니다. 사용할 수 있는 쪽의 예제를 고릅니다.</p>
          <h3 className="font-medium">자체 서빙 모델을 쓰는 키</h3>
          <p>일일 토큰 한도가 0이 아닌 키로 실행합니다.</p>
          <CodeBlock label="curl" code={CURL_EXAMPLE} />
          <h3 className="font-medium">유료 모델을 쓰는 키</h3>
          <p><strong>연결 정보 → 호출할 수 있는 모델 보기</strong>에서 유료 모델을 찾아 ID를 복사합니다. 아래의 <code>콘솔에서 복사한 유료 모델 ID</code>를 그 값으로 바꿉니다. 금액이 <strong>적용 중</strong>이면 반영이 끝난 뒤 실행합니다. 자체 서빙 한도가 0인 키도 부여된 금액과 권한으로 유료 모델을 호출할 수 있습니다.</p>
          <CodeBlock label="유료 모델 curl" code={PAID_CURL_EXAMPLE} />
          <p>성공하면 JSON의 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">choices[0].message.content</code>에 답변이 들어 있습니다. 오류가 나오면 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">error.code</code>를 읽고 <GuideLink slug="llm/errors">오류 해결</GuideLink>에서 확인합니다.</p>
          <p>다른 예제에서도 유료 모델을 쓰려면 <code>model</code>을 같은 ID로 바꿉니다. 모델별 가격과 목록 상태는 <GuideLink slug="llm/features" anchor="models">모델 목록과 권한</GuideLink>에서 확인하세요.</p>
        </>,
      },
      {
        id: 'python',
        title: 'Python SDK 연결',
        body: <>
          <p>Python 실행 환경에 공식 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">openai</code> 패키지를 설치하고, 같은 환경에서 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">PICKLE_API_KEY</code>를 읽을 수 있게 합니다.</p>
          <CodeBlock label="패키지 설치" code="python -m pip install openai" />
          <CodeBlock label="Python" code={PYTHON_EXAMPLE} />
          <p>위 예제는 자체 서빙 모델용입니다. 유료 모델만 부여된 키는 <code>model</code>을 콘솔에서 복사한 유료 모델 ID로 바꿉니다.</p>
          <p>실행 결과로 답변 문장이 출력되면 연결된 것입니다. <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">KeyError: PICKLE_API_KEY</code>가 나면 Python을 실행한 환경에 키 변수가 설정되어 있는지 확인합니다.</p>
          <p>SDK 사용법은 <a target="_blank" rel="noreferrer" className="font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800" href="https://developers.openai.com/api/reference/python">OpenAI 공식 Python 문서</a>를 참고하되, Pickle에 보낼 필드는 <GuideLink slug="llm/features" anchor="parameters">지원 파라미터</GuideLink>를 따릅니다.</p>
        </>,
      },
      {
        id: 'opencode',
        title: '코딩 에이전트 연결',
        body: <>
          <p>opencode에 연결하려면 프로젝트 폴더에 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">opencode.json</code>으로 아래 설정을 저장하고, opencode를 실행하는 환경에 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">PICKLE_API_KEY</code>를 설정합니다. 기존 설정 파일이 있다면 필요한 항목을 합쳐 넣습니다.</p>
          <CodeBlock label="opencode.json" code={OPENCODE_EXAMPLE} />
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">npm</code> 항목은 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">@ai-sdk/openai-compatible</code>을 사용합니다. 이 예제는 해당 프로바이더로 검증된 설정이며 다른 패키지의 호환성은 확인되지 않았습니다.</p>
          <p>위 설정은 자체 서빙 모델용입니다. 유료 모델을 연결할 때는 <code>models</code> 안의 모델 ID와 마지막 <code>model</code> 값의 <code>pickle-general</code>을 사용할 유료 모델 ID로 바꾸고, <code>limit</code>도 해당 모델의 컨텍스트와 출력 범위에 맞춥니다.</p>
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">limit</code>을 생략하면 모델 정보에 컨텍스트가 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">0</code>으로 표시됩니다. 대화가 유지되지 않는다는 뜻은 아닙니다. 이전 대화는 매 요청에 함께 전송되지만, 도구가 창 크기를 몰라 남은 양과 대화를 줄일 시점을 판단하지 못합니다. 대화가 길어지면 경고 없이 한도를 넘어 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">upstream_rejected</code>로 실패할 수 있습니다.</p>
          <p>자체 서빙 모델의 입출력 합계 한도는 65,536토큰입니다. <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">output</code>의 8,192는 도구가 답변을 위해 남겨 두는 예제 값이며 필요에 맞게 정합니다. 플랫폼이 모든 응답을 8,192토큰으로 제한한다는 뜻은 아닙니다.</p>
          <p>opencode에서 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">pickle/{LLM_DEFAULT_MODEL}</code>을 선택하고 짧은 질문에 답변이 돌아오는지 확인합니다. 자체 서빙 모델에 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">reasoning_effort</code>나 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">verbosity</code>를 붙이는 설정은 꺼야 합니다.</p>
        </>,
      },
      {
        id: 'claude-code',
        title: 'Claude Code와 Anthropic SDK 연결',
        body: <>
          <p>Claude Code와 Anthropic SDK는 Anthropic Messages API(<code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">POST /v1/messages</code>)로 연결합니다. 이 경로는 <strong>유료 모델만</strong> 지원하므로 금액 한도가 부여된 키가 필요합니다. 자체 서빙 모델 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">{LLM_DEFAULT_MODEL}</code>을 지정하면 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">model_not_available_on_route</code>로 거절됩니다. 호출은 Chat 권한에 속합니다.</p>
          <p>Anthropic 클라이언트는 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">/v1/messages</code>를 스스로 붙이므로 base URL에 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">/v1</code>을 적지 않습니다. OpenAI 호환 base URL을 그대로 넣으면 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">/v1/v1/messages</code>로 요청이 가서 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">unknown_endpoint</code>가 납니다.</p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">{LLM_ANTHROPIC_BASE_URL}</code>
            <CopyButton value={LLM_ANTHROPIC_BASE_URL} label="Anthropic base URL 복사" />
          </div>
          <p>Claude Code는 실행 전에 아래 환경 변수를 설정합니다. <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">ANTHROPIC_MODEL</code>은 반드시 지정합니다. 지정하지 않으면 Claude Code가 고른 모델 이름으로 모든 요청을 보내고, 그 이름이 키에서 쓸 수 있는 유료 모델이 아니면 거절됩니다.</p>
          <CodeBlock label="macOS / Linux" code={CLAUDE_CODE_EXAMPLE} />
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">ANTHROPIC_MODEL</code>에는 키 정보의 <strong>쓸 수 있는 유료 모델</strong>에 맞는 모델 이름을 넣습니다. 키는 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">Authorization: Bearer</code> 헤더와 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">x-api-key</code> 헤더 중 어느 쪽으로 보내도 됩니다. Claude Code를 실행해 짧은 질문에 답변이 돌아오면 연결된 것입니다.</p>
          <p>Anthropic Python SDK는 공식 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">anthropic</code> 패키지를 설치한 뒤 같은 base URL과 Pickle 키를 넣습니다.</p>
          <CodeBlock label="패키지 설치" code="python -m pip install anthropic" />
          <CodeBlock label="Python" code={ANTHROPIC_PYTHON_EXAMPLE} />
          <p>토큰 수 계산(<code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">/v1/messages/count_tokens</code>)은 지원하지 않습니다. 오류는 Anthropic 형식(<code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">{'{"type": "error", "error": {...}}'}</code>)으로 돌아오며, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">error.code</code>에 <GuideLink slug="llm/errors">오류 해결</GuideLink>의 표와 같은 코드가 들어 있습니다.</p>
        </>,
      },
      {
        id: 'codex',
        title: 'Codex와 OpenAI SDK Responses 연결',
        body: <>
          <p>Codex와 OpenAI SDK의 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">responses.create</code>는 OpenAI Responses API(<code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">POST /v1/responses</code>)로 연결합니다. 이 경로는 <strong>유료 모델만</strong> 지원하므로 금액 한도가 부여된 키가 필요합니다. 자체 서빙 모델 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">{LLM_DEFAULT_MODEL}</code>을 지정하면 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">model_not_available_on_route</code>로 거절됩니다. 호출은 Chat 권한에 속합니다.</p>
          <p>base URL은 OpenAI 호환 클라이언트와 같은 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">{LLM_API_BASE_URL}</code>입니다. Anthropic 클라이언트와 달리 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">/v1</code>까지 적습니다.</p>
          <p>Codex는 설정 파일 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">~/.codex/config.toml</code>에 아래 항목을 넣고, Codex를 실행하는 환경에 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">PICKLE_API_KEY</code>를 설정합니다. 기존 설정 파일이 있다면 필요한 항목을 합쳐 넣습니다.</p>
          <CodeBlock label="~/.codex/config.toml" code={CODEX_CONFIG_EXAMPLE} />
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">model</code>에는 키 정보의 <strong>쓸 수 있는 유료 모델</strong>에 맞는 모델 이름을 넣습니다. Codex를 실행해 짧은 질문에 답변이 돌아오면 연결된 것입니다.</p>
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">web_search = "disabled"</code>는 빼지 않습니다. Codex는 요청마다 웹 검색 도구를 기본으로 넣으므로, 웹 검색 권한이 없는 키는 이 줄이 없으면 모든 요청이 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">endpoint_not_allowed</code>로 거절됩니다. 웹 검색 권한을 받은 키만 이 줄을 빼고 쓸 수 있으며, 검색은 금액을 소비합니다.</p>
          <p>OpenAI Python SDK는 <GuideLink slug="llm/connect" anchor="python">Python SDK 연결</GuideLink>과 같은 base URL과 키로 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">responses.create</code>를 호출합니다.</p>
          <CodeBlock label="Python" code={RESPONSES_PYTHON_EXAMPLE} />
          <p>Pickle은 응답을 서버에 저장하지 않습니다. <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">store: true</code>와 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">previous_response_id</code>는 쓸 수 없고 보내면 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">unsupported_parameter</code>(400)로 거절됩니다. 이전 대화는 매 요청의 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">input</code>에 함께 보냅니다. Codex는 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">store</code>를 false로 보내고 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">previous_response_id</code>를 쓰지 않으므로 그대로 연결됩니다. 응답 조회와 취소 같은 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">{'/v1/responses/{id}'}</code> 하위 경로도 지원하지 않습니다.</p>
          <p>모델 서버에서 코드를 실행하는 도구 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">code_interpreter</code>, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">local_shell</code>, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">shell</code>은 현재 신청할 수 없어 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">endpoint_not_allowed</code>로 거절됩니다. Codex가 내 컴퓨터에서 명령을 실행하는 도구 호출은 별개이므로 영향이 없습니다. 오류는 OpenAI 형식으로 돌아오며 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">error.code</code>는 <GuideLink slug="llm/errors">오류 해결</GuideLink>의 표와 같습니다.</p>
        </>,
      },
      {
        id: 'compatibility',
        title: '연결 범위와 다음 행동',
        body: <>
          <p>OpenAI 호환 클라이언트는 Chat Completions나 Responses API로, Anthropic 클라이언트는 Messages API로 연결합니다. Messages API와 Responses API는 유료 모델만 지원하며, 자체 서빙 모델은 Chat Completions로 호출합니다.</p>
          <p>첫 호출 이후에는 <GuideLink slug="llm/features" anchor="streaming">스트리밍과 도구 호출</GuideLink>을 적용하고, <GuideLink slug="llm/limits" anchor="usage">사용량 확인</GuideLink>으로 요청이 기록되는지 확인하세요.</p>
        </>,
      },
    ],
  },
  {
    slug: 'llm/features',
    title: '모델과 지원 기능',
    group: 'LLM API',
    summary: '모델과 가격을 찾고 이미지와 임베딩, 웹 검색과 PDF OCR의 호출 방법을 확인합니다.',
    keywords: ['모델', '허용', '차단', '가격', '이미지', '임베딩', '웹 검색', 'PDF OCR', '스트리밍', '도구 호출', '파라미터', 'images.generate', '요청 크기', '헤더', 'x-session-id', '프롬프트 캐시', 'X-Generation-Id'],
    sections: [
      {
        id: 'models',
        title: '모델 목록과 권한',
        body: <>
          <p><GuideAction action="llmKeys">LLM API 키 목록</GuideAction>에서 키를 열고 <strong>개요 → 키 정보</strong>를 확인합니다. 자체 서빙 모델 이름은 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">{LLM_DEFAULT_MODEL}</code>입니다.</p>
          <ol>
            <li><strong>개요 → 연결 정보 → 호출할 수 있는 모델 보기</strong>를 엽니다.</li>
            <li>모델 이름을 검색하고 사용할 모델의 ID 옆 <strong>복사</strong>를 누릅니다. 표시 이름 대신 복사한 ID를 요청의 <code>model</code>에 넣습니다.</li>
            <li>유료 모델의 입력과 출력 단가와 <strong>가격</strong> 상세를 확인합니다. 캐시 읽기와 쓰기, 추론, 이미지, 웹 검색, 요청당 요금이나 입력 길이 등에 따른 구간 가격이 있으면 함께 확인합니다. 상세에 표시된 단위와 UTC 시간 조건을 따릅니다.</li>
          </ol>
          <p>목록의 단가는 예상 비용을 비교하기 위한 정보이고 현재 키의 잔액이 아닙니다. <strong>다른 가격 축 확인 전</strong>이면 추가 요금 정보를 아직 확인하지 못한 것입니다. 목록이 오래됐다는 경고나 가져온 시각도 확인합니다. 목록을 가져오지 못한 상태와 허용된 모델이 없는 상태는 다르며, 이름을 알고 있는 모델은 키 권한 안에서 직접 지정할 수 있습니다.</p>
          <p>아래 요청은 자체 서빙 모델 목록을 반환합니다. 유료 모델은 이 목록에 나오지 않습니다.</p>
          <CodeBlock label="curl" code={MODELS_EXAMPLE} />
          <p>유료 모델은 금액 한도가 부여된 키로 모델 이름을 그대로 보내 사용합니다. <strong>쓸 수 있는 유료 모델</strong>이 제한되어 있으면 목록에 맞는 모델만 선택합니다. 허용 목록이 비어 있으면 모델 허용 제한은 없지만 금액 한도와 <strong>쓸 수 없는 유료 모델</strong>은 적용됩니다. 차단 목록이 허용 목록보다 우선합니다.</p>
          <p>키 정보의 <strong>기능 권한</strong>은 이 키에 부여된 기능입니다. <code>/v1/chat/completions</code>, <code>/v1/messages</code>, <code>/v1/responses</code> 호출은 Chat 권한에 속합니다. 기능 권한이 <strong>부여 안 됨</strong>이면 호출할 기능이 없다는 뜻입니다. 유료 모델 허용 목록이 비었을 때와 의미가 다릅니다.</p>
          <p>웹 검색은 웹 검색 권한, 유료 OCR 엔진 <code>mistral-ocr</code>을 지정한 PDF 변환은 PDF OCR 권한, 채팅 응답의 이미지 출력(<code>modalities</code>의 <code>image</code>)은 이미지 생성 권한이 필요합니다. 이 권한은 모델 이름의 허용 여부와 별도로 확인합니다.</p>
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">model_not_allowed</code>는 모델 권한 문제이고, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">credit_unavailable</code>는 금액 한도가 없다는 뜻입니다. 자체 서빙 모델에는 유료 모델의 허용 목록과 차단 목록을 적용하지 않습니다.</p>
          <GuideFigure
            src={llmPermissionsImage}
            alt="LLM API 키 정보에 표시된 유료 모델 허용 목록과 차단 목록 및 기능 권한"
            caption="키 정보에서 사용할 수 있는 유료 모델과 차단된 모델, 기능 권한을 확인합니다."
            width={1104}
            height={347}
          />
        </>,
      },
      {
        id: 'images-embeddings',
        title: '이미지와 임베딩',
        body: <>
          <p>먼저 키 정보의 <strong>기능 권한</strong>에 필요한 기능이 있는지 확인합니다. 이미지 생성과 임베딩은 기능별로 부여되며, 부여되지 않은 경로는 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">endpoint_not_allowed</code>로 거절됩니다. <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">/v1/images</code> 본문의 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">input_references</code>에 입력 이미지를 넣어 편집하는 요청과 이미지 모델 목록 조회도 이미지 기능에 포함됩니다.</p>
          <p>필요한 기능이 없다면 <GuideLink slug="llm/start" anchor="choose-models">신청서의 필요한 기능</GuideLink>에서 골라 승인을 받습니다. 이미 쓰는 키의 권한 변경이 필요하면 관리자에게 키 이름과 필요한 기능을 알려 주세요.</p>
          <Table>
            <THead><TR><TH>경로</TH><TH>기능</TH></TR></THead>
            <TBody>{LLM_PASSTHROUGH_ROUTES.filter((route) => route.capability !== 'chat').map((route) => <TR key={`${route.method} ${route.path}`}><TD><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">{route.method} {route.path}</code></TD><TD>{route.summary}</TD></TR>)}</TBody>
          </Table>
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">/v1/images/generations</code>는 OpenAI SDK의 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">images.generate</code>가 부르는 경로이고 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">/v1/images</code>와 같은 요청을 처리합니다. 이미지 모델 목록을 조회한 뒤 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">model</code>을 반드시 지정해 호출합니다.</p>
          <p>이미지는 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">b64_json</code>으로만 돌아옵니다. 응답에서 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">url</code>이 아니라 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">b64_json</code>을 읽습니다. <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">/v1/images/generations</code>로 보낼 때 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">response_format</code>은 빼거나 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">b64_json</code>으로 두고, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">style</code>과 최상위 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">moderation</code>은 보내지 않습니다. 보내면 이유를 담은 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">unsupported_parameter</code>로 거절됩니다. OpenAI SDK의 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">images.edit</code>와 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">images.create_variation</code>은 지원하지 않습니다.</p>
          <p>이미지와 임베딩 경로는 스트리밍을 지원하지 않습니다. <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">stream</code> 필드를 보내면 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">streaming_not_supported</code>로 거절되므로 필드를 빼고 요청합니다.</p>
          <p>이미지 응답은 base64라 원본보다 커집니다. <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">upstream_response_too_large</code>가 나오면 한 번에 만드는 개수(<code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">n</code>)나 요청한 크기를 줄입니다. 정상 응답의 이미지 데이터 또는 임베딩 결과를 받았는지 확인한 후 애플리케이션에 연결하세요.</p>
          <h3 className="font-medium">이미지 한 장 생성하기</h3>
          <ol>
            <li>이미지 생성 권한과 유료 모델 금액을 확인합니다.</li>
            <li>아래 요청으로 이미지 모델 목록을 조회합니다. 키의 유료 모델 허용 목록과 차단 목록에 맞는 모델 ID를 고릅니다.</li>
          </ol>
          <CodeBlock label="이미지 모델 목록" code={`curl ${LLM_API_BASE_URL}/images/models \\\n  -H "Authorization: Bearer $PICKLE_API_KEY"`} />
          <p>공식 <code>openai</code> 패키지를 설치한 Python 환경에서 아래 <code>이미지 모델 ID</code>를 실제 값으로 바꿔 실행합니다. <code>generated-image</code>에 저장된 결과를 열어 확인하고, 파일 확장자는 반환된 이미지 형식에 맞춥니다.</p>
          <CodeBlock label="이미지 생성 Python" code={IMAGE_PYTHON_EXAMPLE} />
          <h3 className="font-medium">텍스트를 임베딩으로 바꾸기</h3>
          <p>임베딩 권한과 금액을 확인하고, 아래 <code>임베딩 모델 ID</code>에 키에서 허용한 임베딩 모델 이름을 넣습니다. <code>openai</code> 패키지를 설치한 같은 환경에서 실행합니다.</p>
          <CodeBlock label="임베딩 Python" code={EMBEDDING_PYTHON_EXAMPLE} />
          <p>입력 순서에 대응하는 <code>index</code>와 비어 있지 않은 벡터의 길이가 출력되는지 확인합니다. 문서 검색에 사용할 때는 문서와 검색어를 같은 임베딩 모델로 변환합니다.</p>
          <p>이미지와 임베딩 요청 본문도 {LLM_REQUEST_BODY_MIB.max} MiB까지 받습니다. 스트리밍을 켜서 큰 이미지 응답을 해결할 수는 없습니다. 같은 크기의 요청이 간헐적으로 거절되면 <GuideLink slug="llm/errors" anchor="requests">큰 응답과 혼잡 대응</GuideLink>을 확인합니다.</p>
        </>,
      },
      {
        id: 'web-pdf',
        title: '웹 검색과 PDF OCR 사용',
        body: <>
          <p>아래는 <strong>Chat Completions</strong> 요청 본문 예제입니다. <code>model</code>을 허용된 유료 모델 ID로 바꾸고 <GuideLink slug="llm/connect" anchor="first-call">첫 호출</GuideLink>의 <code>POST /v1/chat/completions</code>에 같은 인증 헤더로 보냅니다. Chat 권한과 사용할 기능 권한, 금액이 필요하며 검색과 OCR도 금액을 소비할 수 있습니다.</p>
          <h3 className="font-medium">웹 검색</h3>
          <p><code>plugins</code>에 <code>web</code>을 넣으면 응답을 만들 때 검색 결과를 참고합니다. 답변에 제시된 출처를 열어 내용과 날짜를 확인합니다. 모델 이름 끝의 <code>:online</code>, <code>openrouter:web_search</code> 서버 도구, Chat의 <code>web_search_options</code>, Responses의 <code>web_search</code> 도구를 쓰는 경우에도 웹 검색 권한이 필요합니다.</p>
          <CodeBlock label="웹 검색 요청 JSON" code={WEB_SEARCH_EXAMPLE} />
          <h3 className="font-medium">PDF OCR</h3>
          <p>예제의 <code>https://example.com/document.pdf</code>는 자리표시자입니다. 모델 서버가 읽을 수 있는 실제 PDF 주소로 바꿉니다. 유료 OCR을 지정하는 예제이므로 PDF OCR 권한이 필요합니다. 개인 문서나 민감한 내용을 공개 주소에 올리지 마세요.</p>
          <CodeBlock label="PDF OCR 요청 JSON" code={PDF_OCR_EXAMPLE} />
          <p>문서 내용에 관한 답변이 돌아오는지 확인합니다. URL 접근이나 파일 형식 문제로 거절되면 <code>upstream_rejected</code>의 모델 서버 메시지를 읽습니다. Messages SDK에 위 본문을 그대로 넣지 말고 그 프로토콜이 받는 콘텐츠와 도구 형식을 사용합니다.</p>
        </>,
      },
      {
        id: 'parameters',
        title: '지원 파라미터',
        body: <>
          <p>아래 목록은 <strong>Chat Completions</strong> 요청의 최상위 필드입니다. 같은 경로에서도 자체 서빙 모델과 유료 모델의 처리 범위가 다릅니다. Messages SDK에는 해당 프로토콜의 <code>messages</code>, <code>max_tokens</code>와 도구 형식을, Responses에는 <code>input</code>, <code>max_output_tokens</code>와 도구 형식을 사용합니다.</p>
          <div className="space-y-2"><h3 className="font-medium">두 종류에 공통</h3><ul className="flex list-none flex-wrap gap-1.5 p-0">{LLM_SELF_SERVED_PARAMS.map((param) => <li key={param} className="rounded-md bg-neutral-100 px-2 py-1 font-mono text-xs text-neutral-700">{param}</li>)}</ul></div>
          <div className="space-y-2"><h3 className="font-medium">유료 모델에만</h3><ul className="flex list-none flex-wrap gap-1.5 p-0">{LLM_PAID_ONLY_PARAMS.map((param) => <li key={param} className="rounded-md bg-neutral-100 px-2 py-1 font-mono text-xs text-neutral-700">{param}</li>)}</ul></div>
          <p>채팅 요청 본문은 {LLM_REQUEST_BODY_MIB.max} MiB까지 받습니다. {LLM_REQUEST_BODY_MIB.largeAbove} MiB를 넘는 요청은 동시에 처리하는 수가 정해져 있어, 몰리면 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">large_request_busy</code>(429)로 거절됩니다. base64로 넣는 파일과 이미지는 가능하면 URL로 보냅니다.</p>
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">reasoning_effort</code>와 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">verbosity</code>를 자체 서빙 모델에 보내면 거절됩니다. 사용하는 도구가 필드를 자동으로 붙인다면 자체 서빙 모델을 호출할 때 해당 설정을 끕니다.</p>
          <Alert variant="info" title="자체 서빙 모델은 목록에 없는 필드를 거부합니다">
            모르는 필드를 무시하고 전달하지 않고 요청 전체를 HTTP 400으로 되돌립니다. <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">error.code</code>는 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">unsupported_parameter</code>이며 메시지에 해당 필드가 나옵니다. 유료 모델은 공급자가 받는 요청을 그대로 보내므로 위 목록이 거부의 기준이 아닙니다.
          </Alert>
          <p>유료 모델에도 키의 모델 권한과 기능 권한은 적용됩니다. 모델을 추가로 지정하는 도구나 폴백 목록도 허용된 모델로 구성합니다. 모델 서버가 실행하는 <code>shell</code>, <code>bash</code>, <code>local_shell</code>, <code>code_interpreter</code> 서버 도구는 현재 신청할 수 없습니다. 이 도구 때문에 거절되면 요청에서 제거합니다. 애플리케이션이 직접 실행하는 함수 도구와 Claude Code, Codex의 로컬 도구 호출은 별개입니다. 일반적인 LLM API에 없는 공급자 전용 서버 도구는 일부만 지원합니다. 지원하지 않는 도구는 <code>unsupported_parameter</code>로 거절되고 메시지에 도구 이름이 나옵니다.</p>
        </>,
      },
      {
        id: 'streaming',
        title: '스트리밍과 도구 호출',
        body: <>
          <p><GuideLink slug="llm/connect" anchor="first-call">첫 채팅 호출</GuideLink>이 성공한 뒤 <strong>Chat Completions</strong>에 <code>{'"stream": true'}</code>를 넣으면 응답을 조각으로 받습니다. 토큰 사용량도 받으려면 <code>{'"stream_options": {"include_usage": true}'}</code>를 함께 보냅니다.</p>
          <p><strong>Messages</strong>는 Anthropic SDK의 스트리밍 기능을 사용합니다. <code>message_start</code>, <code>content_block_delta</code>, <code>message_delta</code> 같은 이름 있는 이벤트로 받으며, Chat Completions의 <code>choices</code>나 <code>stream_options</code> 형식을 적용하지 않습니다. 토큰 수는 Messages의 <code>usage</code>에서 확인합니다.</p>
          <p><strong>Responses</strong>는 OpenAI SDK의 <code>responses.stream()</code>이나 <code>{'stream=True'}</code>로 받습니다. 이벤트는 <code>type</code> 필드로 구분하며 답변 조각은 <code>response.output_text.delta</code>로 옵니다. 토큰 수는 마지막 <code>response.completed</code> 이벤트의 <code>usage</code>에서 확인합니다.</p>
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">tools</code>와 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">tool_choice</code>를 사용하는 도구 호출도 지원합니다. 스트리밍에서는 도구 호출 인자도 조각으로 도착하므로 클라이언트에서 합친 뒤 처리합니다.</p>
          <p>응답이 시작됐다는 사실만으로 성공을 판단하지 마세요. HTTP 200으로 시작한 스트림도 중간에 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">request_deadline_exceeded</code>, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">upstream_stream_interrupted</code>, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">upstream_response_too_large</code> 오류로 끝날 수 있습니다. 스트림의 종료와 오류 이벤트까지 확인합니다.</p>
          <p>거절이나 중단이 반복되면 <GuideLink slug="llm/errors">오류 해결</GuideLink>을, 긴 대화에서만 실패하면 <GuideLink slug="llm/connect" anchor="opencode">컨텍스트 길이 설정</GuideLink>을 확인하세요.</p>
        </>,
      },
      {
        id: 'headers',
        title: '요청 헤더와 응답 헤더',
        body: <>
          <p>유료 모델에 보내는 채팅, Messages, Responses 요청에서는 아래 요청 헤더를 공급자에게 그대로 넘깁니다. Messages 요청은 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">anthropic-version</code>과 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">anthropic-beta</code>도 넘깁니다. 자체 서빙 모델과 이미지, 임베딩 요청에서는 넘기지 않습니다.</p>
          <Table>
            <THead><TR><TH>요청 헤더</TH><TH>쓰임</TH></TR></THead>
            <TBody>{LLM_FORWARDED_REQUEST_HEADERS.map((header) => <TR key={header.name}><TD><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">{header.name}</code></TD><TD>{header.use}</TD></TR>)}</TBody>
          </Table>
          <p>같은 헤더를 여러 줄 보내면 첫 줄의 값만 넘기고, {LLM_FORWARDED_HEADER_MAX_BYTES}바이트를 넘는 값은 넘기지 않습니다. 앱 표시 헤더(<code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">HTTP-Referer</code>, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">X-Title</code> 등)와 응답 캐시 헤더는 넘기지 않으므로 보내도 효과가 없습니다.</p>
          <p>유료 모델 공급자가 보낸 응답 헤더 가운데 아래 둘은 그대로 돌려줍니다.</p>
          <Table>
            <THead><TR><TH>응답 헤더</TH><TH>쓰임</TH></TR></THead>
            <TBody>{LLM_RELAYED_RESPONSE_HEADERS.map((header) => <TR key={header.name}><TD><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">{header.name}</code></TD><TD>{header.use}</TD></TR>)}</TBody>
          </Table>
        </>,
      },
    ],
  },
  {
    slug: 'llm/limits',
    title: '한도와 사용량',
    group: 'LLM API',
    summary: '자체 서빙의 토큰 한도와 유료 모델의 금액 한도를 구분해 사용량을 확인합니다.',
    keywords: ['한도', '사용량', '429', '일일 토큰', '금액', '캐시', '사고 토큰', '추정', '금액 미기록', 'RPM', 'TPM', '동시 요청', '재시도'],
    sections: [
      {
        id: 'daily-budget',
        title: '일일 토큰과 금액 한도',
        body: <>
          <p><GuideAction action="llmKeys">LLM API 키 목록</GuideAction>에서 키를 열고 <strong>개요 → 키 정보</strong>의 일일 토큰 한도, 유료 모델 금액과 만료를 확인합니다.</p>
          <ul>
            <li><strong>일일 토큰 한도</strong>는 자체 서빙 모델에만 적용됩니다. 자정(KST)에 초기화되고 소진하면 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">quota_exhausted</code>로 거절됩니다. 한도가 <strong>없음</strong>이면 일일 상한이 없고, <strong>0토큰</strong>이면 자체 서빙 모델을 사용할 수 없습니다.</li>
            <li><strong>금액 한도</strong>는 유료 모델에 적용됩니다. 기본은 리셋 없는 총액 상한이며 승인 내용에 따라 일일, 주간, 월간으로 초기화될 수 있습니다. 금액의 초기화 기준은 UTC이며 일일 토큰의 KST 기준과 다릅니다.</li>
          </ul>
          <p>금액 한도가 없으면 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">credit_unavailable</code>, 승인된 금액을 반영하는 중이면 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">credit_pending</code>, 모두 사용했으면 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">credit_exhausted</code>가 반환됩니다. 재발급해도 사용량을 초기화하거나 한도를 늘리는 것은 아닙니다.</p>
        </>,
      },
      {
        id: 'retry',
        title: '한도에 걸렸을 때',
        body: <>
          <p>분당 요청 수, 분당 토큰 수와 동시 요청 수 한도는 자체 서빙 모델에만 적용됩니다. 이 한도를 넘긴 HTTP 429 응답에는 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">Retry-After</code> 헤더가 붙습니다. 이 시간이 지난 뒤 재시도하고, 동시에 보내는 작업 수나 한 요청의 길이를 줄입니다. 반복적으로 거절되면 키 이름과 오류 코드를 관리자에게 알려 주세요.</p>
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">Retry-After</code>가 붙는 응답은 위 세 한도와 큰 요청 혼잡(<code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">large_request_busy</code>, 429), <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">credit_pending</code>(503)입니다. 유료 모델 공급자가 대기 시간을 주며 429나 503으로 답한 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">server_busy</code>와 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">upstream_error</code>에도 붙습니다. 일일 토큰 소진(<code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">quota_exhausted</code>), 금액 소진(<code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">credit_exhausted</code>), 자체 서빙 모델의 서버 혼잡(<code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">server_busy</code>)에는 붙지 않습니다.</p>
          <p>일일 토큰을 소진했다면 KST 자정까지 기다리거나 필요한 사용량을 설명해 관리자에게 한도 조정을 문의합니다. 금액은 부여된 초기화 주기를 확인하고, 총액을 소진했다면 관리자에게 문의합니다. 서버 혼잡은 잠시 기다린 뒤 재시도하며 반복 간격을 늘립니다.</p>
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">X-RateLimit-Limit-Requests</code>와 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">X-RateLimit-Remaining-Requests</code> 헤더는 <strong>한도를 통과한 자체 서빙 모델 응답에만</strong> 포함됩니다. 유료 모델에는 이 세 한도가 적용되지 않아 이 헤더가 오지 않고, 한도에 걸린 429 응답에도 오지 않습니다.</p>
        </>,
      },
      {
        id: 'usage',
        title: '사용량 확인',
        body: <>
          <ol>
            <li>키 상세의 <strong>사용량</strong> 탭을 엽니다.</li>
            <li>조회 기간을 선택하고 총 요청, 정상 응답, 한도 거부, 실패, 입력 토큰과 출력 토큰을 확인합니다.</li>
            <li><strong>오늘 토큰 사용</strong>과 <strong>금액 사용</strong>에서 현재 한도에 얼마나 가까워졌는지 확인합니다.</li>
            <li>일별 추이와 모델별 사용량으로 어느 작업에서 소비가 늘었는지 확인합니다.</li>
          </ol>
          <p>최근 요청은 사용량에 늦게 반영될 수 있습니다. 화면의 보고 시각과 금액 관측 시각을 확인하고 잠시 후 다시 조회하세요. 금액의 <strong>—</strong>와 <strong>정보 없음</strong>은 0달러를 썼다는 뜻이 아닙니다.</p>
          <ul>
            <li><strong>오늘 토큰 사용</strong>은 KST 기준 자체 서빙 사용량입니다. 위의 입력과 출력 토큰 합계는 선택한 조회 기간의 모델 사용량이므로 같은 숫자일 필요가 없습니다.</li>
            <li><strong>금액 사용</strong>은 승인된 금액의 초기화 주기에 해당하는 사용액입니다. 모델별 표의 금액은 선택한 조회 기간에 금액이 기록된 요청의 합계입니다. 기간과 포함된 요청이 달라 두 값을 그대로 비교하지 않습니다.</li>
            <li><strong>캐시된 입력</strong>과 <strong>사고</strong> 토큰은 각각 입력과 출력에 포함된 양입니다. 합계에 다시 더하지 않습니다. 해당 값이 보고된 사용량이 있으면 <strong>캐시·사고 토큰</strong> 차트가 나타납니다.</li>
            <li><strong>추정</strong> 표시는 모델 서버가 토큰 수를 주지 않아 추산한 요청이 있다는 뜻입니다. 모델별 표에 <strong>금액 미기록</strong> 행이 있으면 그 행의 요청 비용은 확인되지 않은 것이며 무료 사용을 뜻하지 않습니다.</li>
          </ul>
          <p>Messages의 입력 토큰은 일반 입력, 캐시 읽기, 캐시 쓰기를 합산합니다. SDK 응답의 <code>input_tokens</code> 하나만 콘솔 합계와 비교하지 않습니다. 응답은 받았는데 <strong>실패한 요청</strong>에 <code>upstream_usage_missing</code>이 보이면 모델 서버가 집계에 필요한 토큰 수를 주지 않은 경우입니다. 응답 내용의 성공 여부와 계량 상태를 구분하고, 반복되면 요청 시각과 식별자로 문의하세요.</p>
          <p>첫 호출 후 정상 응답과 사용량이 반영되면 확인이 끝납니다. 계속 0이면 발급 전 키를 보고 있는지, 코드가 같은 키와 base URL을 쓰는지 확인하세요. 요청별 프롬프트와 응답이 필요하면 <GuideLink slug="llm/manage" anchor="recording">본문 기록</GuideLink>의 보관 범위와 공유 범위를 먼저 읽으세요.</p>
          <GuideFigure
            src={llmUsageImage}
            alt="LLM API 키 사용량 탭의 기간 선택과 요청, 토큰, 금액 사용 현황"
            caption="사용량 탭에서 조회 기간과 갱신 시각, 요청 결과, 토큰과 금액 사용 현황을 확인합니다."
            width={1104}
            height={420}
          />
        </>,
      },
    ],
  },
  {
    slug: 'llm/manage',
    title: '키 관리와 기록',
    group: 'LLM API',
    summary: '키의 접근 권한, 본문 기록, 재발급과 폐기, 만료 후 절차를 확인합니다.',
    keywords: ['본문 기록', '프롬프트', '응답', '30일', '공유', '재발급', '폐기', '만료', '정지'],
    sections: [
      {
        id: 'access',
        title: '이름과 접근 권한',
        body: <>
          <p><GuideAction action="llmKeys">LLM API 키 목록</GuideAction>에서 키를 엽니다. 키의 소유자와 편집자는 <strong>설정</strong> 탭에서 이름을 바꾸고 본문 기록을 설정할 수 있습니다. 접근을 관리할 수 있는 사람에게는 <strong>접근</strong> 탭이 표시됩니다.</p>
          <p>워크스페이스 구성원이라고 해서 모든 키의 내용을 볼 수 있는 것은 아닙니다. <GuideLink slug="workspaces/access">리소스별 접근 등급</GuideLink>을 확인해 필요한 사람에게 권한을 부여합니다.</p>
          <p>키 발급과 재발급은 키의 접근 목록에서 <strong>소유자</strong> 등급을 받은 사람만 할 수 있습니다. 키 폐기는 키 소유자 또는 워크스페이스 소유자가 할 수 있습니다. 워크스페이스 소유자는 키 내용에 접근할 수 없어도 접근 권한 관리 화면에서 폐기할 수 있습니다.</p>
        </>,
      },
      {
        id: 'recording',
        title: '본문 기록 켜기와 끄기',
        body: <>
          <p>기본은 꺼짐입니다. 사용량 집계와 별도로, <strong>Chat Completions</strong>(<code>/v1/chat/completions</code>)로 보낸 프롬프트와 응답 텍스트를 확인해야 할 때만 켭니다. <strong>Messages, Responses, 이미지, 임베딩 경로의 본문은 기록하지 않습니다.</strong> Claude Code를 Messages로, Codex를 Responses로 연결했다면 이 설정을 켜도 해당 대화는 이 탭에 나타나지 않습니다.</p>
          <p>Chat Completions의 프롬프트에 포함된 이미지와 파일의 참조, 일부 인라인 데이터도 저장될 수 있습니다. 텍스트 전문 화면에서 표시되지 않는 항목도 저장에서 제외된다는 뜻은 아닙니다.</p>
          <Alert variant="warning" title="키에 접근하는 사람 모두가 읽습니다">
            기록된 프롬프트와 응답은 이 키의 접근 권한자 전원이 읽을 수 있고 30일 동안 보관됩니다. 본인만 읽는 개인 기록이 아닙니다. 개인정보가 담기는 요청에는 켜지 마세요.
          </Alert>
          <ol>
            <li>키 상세의 <strong>설정 → 본문 기록 → 켜기</strong>를 누릅니다. 편집자 이상 등급이 필요합니다.</li>
            <li>기록할 내용, 열람 범위와 보관 기간을 읽고 확인 창에서 켭니다.</li>
            <li>민감한 내용이 없는 Chat Completions 요청을 보내고, 잠시 후 <strong>기록된 본문</strong> 탭에서 나타나는지 확인합니다.</li>
          </ol>
          <p><strong>설정 → 본문 기록 → 끄기</strong>는 앞으로 보낼 요청의 기록을 멈춥니다. 이미 기록된 본문은 보관 기간까지 남으며, 지난 것부터 삭제됩니다. 끄기나 키 폐기는 기존 기록을 즉시 삭제하는 기능이 아닙니다.</p>
        </>,
      },
      {
        id: 'bodies',
        title: '기록된 본문 읽기',
        body: <>
          <p><strong>기록된 본문</strong> 탭에서 시각과 프롬프트 및 응답의 앞부분을 확인하고 <strong>전문 보기</strong>를 누릅니다.</p>
          <p><strong>프롬프트 잘림</strong> 또는 <strong>응답 잘림</strong>이 표시되면 전체 내용이 보관되지 않은 기록입니다. 프롬프트는 64 KiB, 응답 텍스트는 256 KiB를 넘으면 앞부분만 보관합니다. 이미지와 파일 등 비텍스트 내용이나 도구 호출의 전체 과정을 복원하는 기능은 아닙니다.</p>
          <p><strong>읽을 수 없음</strong>은 정상적인 빈 응답과 다릅니다. 기록이 비어 있다면 먼저 Chat Completions 경로로 보냈는지 확인하고, 요청 당시 본문 기록이 켜져 있었는지, 보고가 반영되었는지, 보관 기간 30일이 지났는지 확인합니다. 본문 기록은 모든 요청의 보관을 보장하지 않으므로 과제나 애플리케이션에 필요한 원본은 직접 보관합니다.</p>
          <p>기록을 끄거나 키를 폐기한 후에도 보관 기간 내의 기존 본문은 이 탭에서 볼 수 있습니다. 현재 키 접근 권한은 <GuideLink slug="workspaces/access">리소스 접근 목록</GuideLink>으로 관리합니다.</p>
        </>,
      },
      {
        id: 'rotate',
        title: '키를 잃어버렸을 때 재발급',
        body: <>
          <p>평문은 발급 직후 한 번만 보이고 다시 조회할 수 없습니다. 값을 잃어버렸거나 유출되어 기존 값을 바꿔야 하면 재발급합니다.</p>
          <ol>
            <li>이 키를 쓰는 프로그램과 배포 설정을 확인하고 새 값으로 교체할 준비를 합니다.</li>
            <li><strong>개요 → 키 재발급</strong>에서 이전 값이 무효화된다는 안내를 읽고 재발급합니다.</li>
            <li>새 키를 복사해 실행 환경에 넣고, 이전 값을 사용하는 모든 프로그램의 설정을 바꿉니다.</li>
            <li><GuideLink slug="llm/connect" anchor="first-call">첫 호출 예제</GuideLink>로 새 키가 정상 응답하는지 확인합니다.</li>
          </ol>
          <Alert variant="warning" title="이전 키 값은 즉시 무효화됩니다">
            재발급 직후부터 이전 값을 쓰는 프로그램의 요청은 실패합니다. 새 값을 복사하기 전에 완료 창을 닫지 마세요.
          </Alert>
        </>,
      },
      {
        id: 'revoke',
        title: '이용을 끝낼 때 키 폐기',
        body: <>
          <ol>
            <li>키를 사용하는 작업을 종료하고, 계속 필요한 키인지 확인합니다.</li>
            <li><strong>설정 → 키 폐기</strong>를 누르고 확인 창에 키 이름을 입력합니다.</li>
            <li><strong>폐기</strong>를 누르고 목록이나 개요의 상태가 <strong>폐기됨</strong>으로 바뀌었는지 확인합니다.</li>
          </ol>
          <Alert variant="danger" title="폐기는 되돌릴 수 없습니다">
            폐기한 키는 다시 발급할 수 없으며 이후 요청은 거부됩니다. 계속 쓰려면 새로 신청해야 합니다. 지금까지의 사용 기록은 남습니다.
          </Alert>
        </>,
      },
      {
        id: 'status',
        title: '상태별 다음 행동',
        body: <>
          <ul>
            <li><strong>발급 전</strong>: 승인된 키를 개요에서 처음 발급합니다.</li>
            <li><strong>활성</strong>: 만료와 한도를 확인하고 호출합니다.</li>
            <li><strong>정지됨</strong>: 관리자가 해제하기 전까지 요청이 거부됩니다. 관리자에게 정지 사유와 해제를 문의합니다.</li>
            <li><strong>만료됨</strong>: 더 이상 인증되지 않습니다. 계속 필요하면 <GuideAction action="newRequest">새로 신청</GuideAction>합니다. 재발급으로 만료를 연장할 수 없습니다.</li>
            <li><strong>폐기됨</strong>: 복구하거나 재발급할 수 없습니다. 다시 이용하려면 새로 신청합니다.</li>
          </ul>
          <p>화면에서 활성인데 요청이 실패한다면 <GuideLink slug="llm/errors">오류 코드</GuideLink>와 <GuideLink slug="llm/limits">한도</GuideLink>를 함께 확인하세요.</p>
        </>,
      },
    ],
  },
  {
    slug: 'llm/errors',
    title: 'LLM API 오류 해결',
    group: 'LLM API',
    summary: '인증, 모델 권한, 한도와 요청 형식을 구분해 실패 원인을 찾습니다.',
    keywords: ['오류', '에러', '401', '403', '404', '422', '429', '503', 'error.code', '문의', 'X-Request-Id', 'X-Generation-Id'],
    sections: [
      {
        id: 'diagnose',
        title: '먼저 확인할 내용',
        body: <>
          <p>응답은 OpenAI와 같은 오류 형식을 사용합니다. <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">/v1/messages</code>는 Anthropic 형식으로 답하지만 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">error.code</code>는 같습니다. 메시지 문구보다 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">error.code</code>로 원인을 구분합니다. 코드에서 오류를 처리할 때도 이 값을 사용합니다.</p>
          <ol>
            <li>base URL이 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">{LLM_API_BASE_URL}</code>인지 확인합니다. <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">/v1</code>을 빠뜨리거나 두 번 붙이지 않습니다. Anthropic 클라이언트는 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">{LLM_ANTHROPIC_BASE_URL}</code>처럼 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">/v1</code> 없이 적습니다.</li>
            <li>콘솔에서 현재 키의 상태와 만료를 확인하고, 실행 환경이 발급한 최신 값을 사용하고 있는지 확인합니다.</li>
            <li>요청 모델과 경로가 키의 모델 권한과 기능 권한에 포함되는지 확인합니다.</li>
            <li>아래 표에서 오류 코드를 찾습니다. 여러 설정을 한꺼번에 바꾸기 전에 <GuideLink slug="llm/connect" anchor="first-call">최소 호출 예제</GuideLink>로 같은 문제가 나는지 확인합니다.</li>
          </ol>
        </>,
      },
      {
        id: 'authentication',
        title: '인증과 권한 오류',
        body: <>
          <ul>
            <li><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">missing_api_key</code>, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">invalid_api_key</code>: <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">Authorization: Bearer</code> 헤더와 환경 변수를 확인합니다. 콘솔 로그인 세션이나 키 앞부분 표시값으로는 호출할 수 없습니다.</li>
            <li><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">api_key_expired</code>, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">api_key_revoked</code>: <GuideLink slug="llm/manage" anchor="status">키 상태</GuideLink>를 확인합니다. 만료되거나 폐기된 키를 계속 사용하려면 새로 신청해야 합니다.</li>
            <li><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">account_suspended</code>: 키 상세에서 <strong>정지됨</strong> 상태를 확인하고 관리자에게 해제를 문의합니다.</li>
            <li><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">model_not_found</code>, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">model_not_allowed</code>: 모델 이름과 허용 목록 및 차단 목록을 확인합니다.</li>
            <li><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">endpoint_not_allowed</code>: 키 정보의 기능 권한과 오류 메시지를 확인합니다. 신청 가능한 기능이 부족하면 관리자에게 요청합니다. 아직 신청할 수 없는 서버 코드 실행 도구 <code>shell</code>, <code>bash</code>, <code>local_shell</code>, <code>code_interpreter</code>가 원인이면 요청에서 그 도구를 뺍니다. Codex에서 웹 검색 권한 때문에 거절되면 <GuideLink slug="llm/connect" anchor="codex">Codex 설정</GuideLink>의 <code>web_search</code> 항목을 확인합니다. <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">unknown_endpoint</code>처럼 경로가 없는 오류와 구분하세요.</li>
          </ul>
        </>,
      },
      {
        id: 'requests',
        title: '요청 형식과 재시도',
        body: <>
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">unsupported_parameter</code>는 <GuideLink slug="llm/features" anchor="parameters">지원 파라미터</GuideLink>를 확인하고 메시지에 나온 필드를 제거합니다. <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">invalid_json</code>, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">missing_parameter</code>, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">invalid_parameter_value</code>는 요청 JSON과 필수 필드 및 값을 확인합니다.</p>
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">request_too_large</code>, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">input_too_long</code>, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">output_limit_exceeded</code>, <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">upstream_rejected</code>는 입력 길이, 누적 대화, 출력 설정을 확인합니다. <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">upstream_rejected</code>는 HTTP 400이나 422로 오고, 모델 서버가 보낸 이유가 있으면 메시지의 「모델 서버 메시지:」 뒤에 붙습니다.</p>
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">upstream_response_too_large</code>는 응답 크기 초과나 큰 응답을 처리할 자리 부족입니다. 긴 텍스트는 <code>stream</code>으로 받거나 <code>max_tokens</code>를 줄입니다. 이미지 출력은 채팅 경로에서도 생성 수나 해상도를 줄입니다. 이미지가 스트림 이벤트 하나로 전달되면 스트리밍 전환만으로 해결되지 않을 수 있습니다. 처리 자리 부족이면 간격을 늘려 재시도합니다. 이미 모델이 생성한 응답에서 발생할 수 있으므로 유료 요청을 다시 보내면 추가 비용이 들 수 있습니다.</p>
          <p><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">request_body_incomplete</code>는 업로드가 도중에 끊긴 것이므로 연결 상태를 확인하고 같은 요청을 다시 보냅니다.</p>
          <p>429나 금액 관련 오류는 <GuideLink slug="llm/limits" anchor="retry">한도에 걸렸을 때</GuideLink>의 재시도 기준을 따릅니다. 점검이나 서버 오류는 <GuideAction action="notices">공지사항</GuideAction>을 확인하고 잠시 후 다시 시도합니다.</p>
          <p>스트리밍 요청은 HTTP 200이어도 도중 오류가 있을 수 있습니다. 끝까지 받은 뒤 완료 여부를 판단하고, 실패 시 일부만 받은 답변을 완성된 결과로 저장하지 않습니다.</p>
        </>,
      },
      {
        id: 'codes',
        title: '오류 코드 전체 목록',
        body: <>
          <Table>
            <THead><TR><TH>code</TH><TH>HTTP</TH><TH>뜻</TH></TR></THead>
            <TBody>{LLM_ERROR_CODES.map((entry) => <TR key={entry.code}><TD><code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">{entry.code}</code></TD><TD>{entry.alsoStatus === undefined ? entry.status : `${entry.status}, ${entry.alsoStatus}`}</TD><TD>{entry.meaning}</TD></TR>)}</TBody>
          </Table>
        </>,
      },
      {
        id: 'contact',
        title: '해결되지 않을 때 문의',
        body: <>
          <p><a target="_blank" rel="noreferrer" className="font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800" href={CONTACT_URL}>문의 창구</a>에 키 이름, 발생 시각, 요청 모델과 경로, HTTP 상태와 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">error.code</code>, 응답 헤더의 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">X-Request-Id</code>를 함께 전달하면 실패한 요청을 확인할 수 있습니다. 유료 모델이 정상 응답한 결과나 금액을 문의할 때는 응답 헤더의 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-neutral-800">X-Generation-Id</code>도 알려 주세요. 키의 평문이나 민감한 프롬프트는 보내지 마세요.</p>
          <p>개선 의견은 <a target="_blank" rel="noreferrer" className="font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800" href={FEEDBACK_URL}>의견 창구</a>로 보낼 수 있습니다. 로그인이나 리소스 표시 문제는 <GuideLink slug="troubleshooting">계정과 리소스 문제 해결</GuideLink>에서 확인합니다.</p>
          <p>설정을 고친 뒤 동일한 최소 요청이 정상 응답하고 <GuideLink slug="llm/limits" anchor="usage">사용량</GuideLink>에 반영되는지 확인하면 점검이 끝납니다.</p>
        </>,
      },
    ],
  },
]
