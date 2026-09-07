import { useState } from 'react'
import { Link } from 'react-router'
import { CodeBlock } from '../CodeBlock'
import { CopyButton } from '../CopyButton'
import { Button, Card, CardContent, CardHeader, CardTitle, DescriptionField } from '../ui'
import { DOCS_PATH } from '../../lib/brand'
import { LLM_API_BASE_URL, LLM_DEFAULT_MODEL } from '../../lib/llm-api'
import { LlmKeyModelsModal } from './LlmKeyModelsModal'

/**
 * 키를 손에 쥔 자리에서 첫 호출까지 가게 하는 카드.
 *
 * 키 평문은 서버에 없으므로 예시에는 환경 변수 자리표시자만 넣는다. 발급 화면을
 * 떠나면 어디로 보내는지 알 방법이 없어, 주소와 모델 이름을 여기에 둔다.
 */
export function LlmKeyConnectionCard({ keyId }: { keyId: string }) {
  const [modelsOpen, setModelsOpen] = useState(false)
  const example = `curl ${LLM_API_BASE_URL}/chat/completions \\
  -H "Authorization: Bearer $PICKLE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${LLM_DEFAULT_MODEL}", "messages": [{"role": "user", "content": "안녕하세요"}]}'`

  return (
    <Card>
      <CardHeader>
        <CardTitle>연결 정보</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <DescriptionField label="base URL">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{LLM_API_BASE_URL}</span>
              <CopyButton value={LLM_API_BASE_URL} label="복사" />
            </div>
          </DescriptionField>
          <DescriptionField label="모델">
            {/* The model list sits beside the model it answers about, on
                the same row as the copy button. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm">{LLM_DEFAULT_MODEL}</span>
              <CopyButton value={LLM_DEFAULT_MODEL} label="복사" />
              <Button variant="secondary" size="sm" onClick={() => setModelsOpen(true)}>
                호출할 수 있는 모델 보기
              </Button>
            </div>
          </DescriptionField>
        </dl>
        <CodeBlock label="curl" code={example} />
        <p className="text-sm text-neutral-600">
          지원 파라미터와 한도, 에러 코드는{' '}
          <Link
            to={DOCS_PATH}
            className="font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800"
          >
            사용 가이드
          </Link>
          에 있습니다.
        </p>
        <LlmKeyModelsModal
          keyId={keyId}
          open={modelsOpen}
          onClose={() => setModelsOpen(false)}
        />
      </CardContent>
    </Card>
  )
}
