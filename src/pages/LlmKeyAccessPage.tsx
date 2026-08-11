import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchLlmKeyAccessGrants } from '../api/queries'
import { ResourceAccessSection } from '../components/resource/ResourceAccessSection'
import { Alert, LlmKeyStatusBadge, Spinner } from '../components/ui'
import { consolePaths } from '../lib/paths'
import type { LlmApiKeyStatus } from '../lib/status'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'

/**
 * LLM API 키 하나의 접근 권한만 다루는 화면.
 *
 * 상세와 따로 있는 이유는 VM과 같다 — 이 화면을 여는 사람은 그 키의 상세를 열
 * 수 없는 경우가 있다. 워크스페이스 소유자는 접근 목록에 없으면 키 안을 못 보지만
 * 누가 접근할지는 정할 수 있고(서버가 상세에 403을 준다), 소유자가 워크스페이스를
 * 떠난 키를 되살리는 길이 그것뿐이다. 그래서 상세를 부르지 않고 이름·상태는
 * 접근 목록 응답이 함께 주는 것만 쓴다.
 */
export function LlmKeyAccessPage() {
  const params = useParams()
  const keyId = params.keyId ?? ''
  const idValid = isUuid(keyId)
  const access = useQuery({
    queryKey: ['llm-keys', keyId, 'access'],
    queryFn: () => fetchLlmKeyAccessGrants(keyId),
    // 형식부터 틀린 주소는 서버에 물어볼 것이 없다.
    enabled: idValid,
  })
  const llmKey = access.data?.resource

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link to={consolePaths.llmKeys(null)} className="text-primary-700 hover:underline">
          ← 내 LLM API 키
        </Link>
      </nav>

      {!idValid ? (
        <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
      ) : access.isPending ? (
        <Spinner label="접근 권한 불러오는 중" />
      ) : access.isError ? (
        <Alert variant="danger">{access.error.message}</Alert>
      ) : (
        <>
          <header className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-neutral-900">{llmKey?.name}</h1>
              {llmKey?.type === 'LLM_API_KEY' && (
                <LlmKeyStatusBadge status={llmKey.status as LlmApiKeyStatus} />
              )}
            </div>
            <p className="text-sm text-neutral-500">{llmKey?.workspaceName} 소유</p>
          </header>
          <ResourceAccessSection type="LLM_API_KEY" resourceId={keyId} />
        </>
      )}
    </div>
  )
}
