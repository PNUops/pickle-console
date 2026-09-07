import { Suspense, lazy } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchLlmKey, type LlmKeyDetail } from '../api/queries'
import { LlmKeyConnectionCard } from '../components/llm-key/LlmKeyConnectionCard'
import { LlmKeyBodyRecordCard } from '../components/llm-key/LlmKeyBodyRecordCard'
import { LlmKeyInfoCard } from '../components/llm-key/LlmKeyInfoCard'
import { LlmKeyIssueAction } from '../components/llm-key/LlmKeyIssueAction'
import { LlmKeyNameCard } from '../components/llm-key/LlmKeyNameCard'
import { RevokeKeyCard } from '../components/llm-key/RevokeKeyCard'
import { ResourceAccessSection } from '../components/resource/ResourceAccessSection'
import {
  Alert,
  ErrorBoundary,
  LlmKeyStatusBadge,
  Spinner,
  TabPanel,
  Tabs,
  type TabItem,
} from '../components/ui'
import { consolePaths } from '../lib/paths'
import { effectiveLlmKeyStatus, type LlmApiKeyStatus } from '../lib/status'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'
import { LlmKeyBodiesSection } from '../components/llm-body/LlmKeyBodiesSection'

// 사용량 차트는 uPlot을 끌어오므로 사용량 탭을 여는 사람에게만 내려받는다
// (할당 추이·VM 모니터링과 같은 규칙).
const LlmKeyUsageSection = lazy(() => import('../components/llm-usage/LlmKeyUsageSection'))

/**
 * 상세 탭 구성. 배열 순서가 렌더 순서이고, 탭 id는 `?tab=` 링크가 쓴다.
 * The tabs sit where the VM detail puts the same names.
 */
const KEY_TABS: TabItem[] = [
  { id: 'overview', label: '개요' },
  { id: 'usage', label: '사용량' },
  { id: 'access', label: '접근' },
  { id: 'settings', label: '설정' },
  // 설정은 「본문 기록」, 이 화면은 「기록된 본문」이다. 같은 말이 둘을 가리키면
  // 「본문 기록을 껐는데 본문 기록이 남아 있다」는 문장이 나온다.
  { id: 'bodies', label: '기록된 본문' },
]

/**
 * LLM API 키 하나의 상세 — 드로어가 아니라 라우트다.
 *
 * 발급은 되돌릴 수 없는 한 번짜리 작업이고, 그 화면은 공유 가능한 주소를 가져야
 * 한다(알림·북마크가 가리킬 곳). 목록 맥락을 지키는 것보다 그쪽이 무겁다.
 */
export function LlmKeyDetailPage() {
  const params = useParams()
  const keyId = params.keyId ?? ''
  const idValid = isUuid(keyId)
  const key = useQuery({
    queryKey: ['llm-keys', keyId],
    queryFn: () => fetchLlmKey(keyId),
    // 형식부터 틀린 주소는 서버에 물어볼 것이 없다.
    enabled: idValid,
  })

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link to={consolePaths.llmKeys(null)} className="text-primary-700 hover:underline">
          ← 내 LLM API 키
        </Link>
      </nav>

      {!idValid ? (
        <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
      ) : key.isPending ? (
        <div className="flex justify-center py-12">
          <Spinner label="LLM API 키 정보 불러오는 중" />
        </div>
      ) : key.isError ? (
        <Alert variant="danger">{key.error.message}</Alert>
      ) : (
        // 다른 키로 옮겨 갈 때(뒤로/앞으로) 이 라우트는 다시 마운트되지 않는다 —
        // key를 주지 않으면 앞 키의 저장 성공 알림·오류가 다음 키 화면에 남는다.
        <KeyDetail key={key.data.id} llmKey={key.data} />
      )}
    </div>
  )
}

function KeyDetail({ llmKey }: { llmKey: LlmKeyDetail }) {
  // 만료는 저장된 상태가 아니라 시각이 지배한다 — 게이트웨이가 보는 것과 같은
  // 근거를 화면도 본다. 배지·안내·발급 가능 판정이 모두 이 값을 쓴다.
  const status = effectiveLlmKeyStatus(llmKey.status, llmKey.expiresAt)
  const terminal = status === 'REVOKED' || status === 'EXPIRED'
  // The grade that may edit the key, the same test the settings card runs.
  const canEditKey = llmKey.myResourceRole === 'OWNER' || llmKey.myResourceRole === 'EDITOR'
  // The access tab follows the grant-management right alone, whatever the
  // status: a revoked key's grants still decide who may read its recorded
  // bodies. The settings tab needs someone who can act on it, either the
  // settings form (editor and up) or the revoke row (the workspace owner's
  // standing right), and nothing on it applies to a revoked or expired key.
  const accessVisible = llmKey.accessManageAllowed
  const settingsVisible = !terminal && (canEditKey || llmKey.accessManageAllowed)
  const tabs = KEY_TABS.filter((tab) => {
    if (tab.id === 'access') return accessVisible
    if (tab.id === 'settings') return settingsVisible
    return true
  })
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  // An unknown or hidden tab value falls back to the overview; the URL can stay.
  const activeTab = tabs.some((tab) => tab.id === rawTab) ? rawTab! : 'overview'
  const selectTab = (id: string) => {
    // 탭 전환(키보드 화살표 포함)마다 히스토리가 쌓이지 않게 replace.
    setSearchParams(id === 'overview' ? {} : { tab: id }, { replace: true })
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-neutral-900">{llmKey.name}</h1>
            <LlmKeyStatusBadge status={status} />
          </div>
          <p className="mt-1 text-sm text-neutral-500">{llmKey.workspaceName} 소유</p>
        </div>
      </div>

      <Tabs
        tabs={tabs}
        value={activeTab}
        onChange={selectTab}
        aria-label="LLM API 키 상세 영역"
      />

      <TabPanel id="overview" active={activeTab === 'overview'} className="space-y-6">
        <StatusNotice status={status} />
        {/* The facts first: the page's subject is this key, and its own
            properties are what confirm the reader is looking at the right one.
            Then what to do with it, and last the one-off that mints a value. */}
        <LlmKeyInfoCard llmKey={llmKey} />
        {status === 'ACTIVE' && <LlmKeyConnectionCard keyId={llmKey.id} />}
        <LlmKeyIssueAction llmKey={llmKey} status={status} />
      </TabPanel>

      <TabPanel id="usage" active={activeTab === 'usage'}>
        <ErrorBoundary label="사용량">
          <Suspense
            fallback={
              <div className="flex justify-center py-12">
                <Spinner label="사용량 화면 불러오는 중" />
              </div>
            }
          >
            <LlmKeyUsageSection keyId={llmKey.id} status={status} />
          </Suspense>
        </ErrorBoundary>
      </TabPanel>

      <TabPanel id="access" active={activeTab === 'access'} className="space-y-6">
        <ResourceAccessSection type="LLM_API_KEY" resourceId={llmKey.id} />
      </TabPanel>

      <TabPanel id="settings" active={activeTab === 'settings'} className="space-y-6">
        {/* One card per setting rather than a 「키 설정」 card holding both: the
            tab is already called 설정, so that title named nothing the reader
            did not know, and the two settings have nothing to do with each
            other. Revoking stays here, where a VM keeps its deletion. */}
        <LlmKeyNameCard llmKey={llmKey} />
        <LlmKeyBodyRecordCard llmKey={llmKey} />
        <RevokeKeyCard
          keyId={llmKey.id}
          name={llmKey.name}
          allowed={llmKey.accessManageAllowed}
        />
      </TabPanel>

      <TabPanel id="bodies" active={activeTab === 'bodies'}>
        {/* 지연 로드하지 않는다 — 사용량 탭이 그러는 이유는 uPlot 하나뿐이고
            여기에는 새 의존이 없다. ErrorBoundary만 두른다: 기록된 프롬프트의
            모양을 서버 타입이 보장하지 못하는 유일한 탭이라 렌더 실패가 실제로
            가능하다. */}
        <ErrorBoundary label="기록된 본문">
          <LlmKeyBodiesSection
            keyId={llmKey.id}
            status={status}
            recordBodies={llmKey.recordBodies}
            canEdit={canEditKey}
            onGoToSettings={() => selectTab('settings')}
          />
        </ErrorBoundary>
      </TabPanel>
    </>
  )
}

/**
 * 상태가 지금 무엇을 뜻하는지 한 문장.
 *
 * 발급 전과 폐기는 서로 다른 이야기다 — 하나는 남은 한 걸음, 다른 하나는 끝.
 */
function StatusNotice({ status }: { status: LlmApiKeyStatus }) {
  if (status === 'PENDING') {
    return (
      <Alert variant="info" title="아직 발급되지 않은 키입니다">
        발급 전에는 이 키로 보낸 요청이 하나도 인증되지 않습니다.
      </Alert>
    )
  }
  if (status === 'REVOKED') {
    return (
      <Alert variant="warning" title="폐기된 키입니다">
        이 키로 보낸 요청은 게이트웨이에서 거부됩니다. 폐기된 키는 다시 발급할 수 없으니
        필요하면 새로 신청해 주세요. 지금까지의 사용 기록은 남아 있습니다.
      </Alert>
    )
  }
  if (status === 'SUSPENDED') {
    return (
      <Alert variant="warning" title="정지된 키입니다">
        관리자가 해제하기 전까지는 요청이 거부됩니다.
      </Alert>
    )
  }
  if (status === 'EXPIRED') {
    return (
      <Alert variant="warning" title="만료된 키입니다">
        더 이상 요청을 인증하지 않습니다. 계속 쓰려면 새로 신청해 주세요.
      </Alert>
    )
  }
  return null
}
