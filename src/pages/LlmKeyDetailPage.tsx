import { Suspense, lazy, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchLlmKey,
  invalidateResourceLists,
  issueLlmKeyToken,
  type LlmKeyDetail,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { CopyButton } from '../components/CopyButton'
import { LlmKeyConnectionCard } from '../components/llm-key/LlmKeyConnectionCard'
import { LlmKeyInfoCard } from '../components/llm-key/LlmKeyInfoCard'
import { LlmKeySettingsCard } from '../components/llm-key/LlmKeySettingsCard'
import { RevokeKeyCard } from '../components/llm-key/RevokeKeyCard'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorBoundary,
  LlmKeyStatusBadge,
  Modal,
  PermissionNotice,
  Spinner,
  TabPanel,
  Tabs,
  type TabItem,
} from '../components/ui'
import { DOCS_PATH } from '../lib/brand'
import { formatDateTime } from '../lib/format'
import { consolePaths } from '../lib/paths'
import { effectiveLlmKeyStatus, type LlmApiKeyStatus } from '../lib/status'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'
import { LlmKeyBodiesSection } from '../components/llm-body/LlmKeyBodiesSection'

// 사용량 차트는 uPlot을 끌어오므로 사용량 탭을 여는 사람에게만 내려받는다
// (할당 추이·VM 모니터링과 같은 규칙).
const LlmKeyUsageSection = lazy(() => import('../components/llm-usage/LlmKeyUsageSection'))

/** 상세 탭 구성. 배열 순서가 렌더 순서이고, 탭 id는 `?tab=` 링크가 쓴다. */
const KEY_TABS: TabItem[] = [
  { id: 'overview', label: '개요' },
  { id: 'usage', label: '사용량' },
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
  // 본문 기록을 켜는 등급 — EditSection이 쓰는 것과 같은 근거를 그대로 본다.
  const canEditKey = llmKey.myResourceRole === 'OWNER' || llmKey.myResourceRole === 'EDITOR'
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeTab = KEY_TABS.some((tab) => tab.id === rawTab) ? rawTab! : 'overview'
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
          <p className="mt-1 text-sm text-neutral-500">
            {llmKey.workspaceName} 소유
            {llmKey.purpose && <> · {llmKey.purpose}</>}
          </p>
        </div>
      </div>

      <Tabs
        tabs={KEY_TABS}
        value={activeTab}
        onChange={selectTab}
        aria-label="LLM API 키 상세 영역"
      />

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
            onGoToOverview={() => selectTab('overview')}
          />
        </ErrorBoundary>
      </TabPanel>

      <TabPanel id="overview" active={activeTab === 'overview'} className="space-y-6">
      <StatusNotice status={status} />
      <IssueSection llmKey={llmKey} status={status} />
      {status === 'ACTIVE' && <LlmKeyConnectionCard keyId={llmKey.id} />}
      <LlmKeyInfoCard llmKey={llmKey} />

      {!terminal && <LlmKeySettingsCard llmKey={llmKey} />}

      <Card>
        <CardHeader>
          <CardTitle>접근 권한</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-neutral-600">
            이 키에는 접근 목록에 있는 사람만 닿을 수 있습니다. 같은 워크스페이스라도
            목록에 없으면 이름과 상태만 보입니다.
          </p>
          {llmKey.accessManageAllowed ? (
            <Link
              to={consolePaths.llmKeyAccess(llmKey.id)}
              className="inline-flex h-9 items-center rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              접근 권한 관리
            </Link>
          ) : (
            <PermissionNotice>
              접근 권한은 이 키의 소유자 또는 워크스페이스 소유자만 관리할 수 있습니다.
            </PermissionNotice>
          )}
        </CardContent>
      </Card>

      {!terminal && (
        <RevokeKeyCard
          keyId={llmKey.id}
          name={llmKey.name}
          allowed={llmKey.accessManageAllowed}
        />
      )}
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

/* ─── 발급·재발급 ─── */

/**
 * 평문을 만드는 자리.
 *
 * 평문은 뮤테이션 상태에만 존재한다 — 컴포넌트 상태로 옮기지 않고, 결과 모달은
 * `reset()`으로 닫아 그 자리에서 버린다 (릴레이 토큰과 같은 규칙). 서버에는
 * 해시만 남아 다시 조회할 방법이 없으므로, 창을 닫으면 정말로 끝이다.
 */
function IssueSection({ llmKey, status }: { llmKey: LlmKeyDetail; status: LlmApiKeyStatus }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rotation = status !== 'PENDING'
  const actionLabel = rotation ? '키 재발급' : '키 발급'
  // 발급은 부여받은 권한이다 — 이 키의 접근 목록에서 소유자 등급을 받은 사람만
  // 한다. 워크스페이스 소유자의 상시 권한(폐기·목록 관리)은 여기에 닿지 않으므로
  // accessManageAllowed로 판단하면 눌러야만 아는 403이 된다.
  const allowed = llmKey.myResourceRole === 'OWNER'
  // 발급이 뜻을 갖는 상태는 둘뿐이다. 서버의 발급은 '발급 전'만 활성으로 올리므로
  // 정지·만료된 키에 발급을 걸면 쓰던 값만 죽고 새 값도 아무것도 인증하지 못한다 —
  // 다시 볼 수 없다는 경고와 함께 쓸모없는 평문을 쥐여 주는 셈이다. 폐기와 같이 뺀다.
  const issuable = status === 'PENDING' || status === 'ACTIVE'

  const issue = useMutation({
    // 평문이 캐시에 남지 않도록 모달을 닫는 즉시 GC 대상이 되게 한다.
    gcTime: 0,
    mutationFn: () => issueLlmKeyToken(llmKey.id),
    onSuccess: async () => {
      setConfirming(false)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['llm-keys', llmKey.id] })
      await invalidateResourceLists(queryClient)
    },
    onError: (err) => {
      setConfirming(false)
      setError(toApiError(err, 'LLM API 키를 발급하지 못했습니다.').message)
    },
  })

  if (!issuable) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{actionLabel}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rotation && (
          <p className="text-sm text-neutral-600">값을 잃어버렸다면 재발급합니다.</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={rotation ? 'secondary' : 'primary'}
            disabled={!allowed}
            onClick={() => {
              setError(null)
              setConfirming(true)
            }}
          >
            {actionLabel}
          </Button>
        </div>
        {!allowed && (
          <PermissionNotice>
            키 발급은 이 키의 접근 목록에서 소유자 등급을 받은 사람만 할 수 있습니다.
          </PermissionNotice>
        )}
        {error && <Alert variant="danger">{error}</Alert>}

        {/* 발급 확인 — 재발급이 무엇을 끊는지는 누르기 전에 말한다. */}
        <Modal
          open={confirming}
          onClose={() => setConfirming(false)}
          title={actionLabel}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                돌아가기
              </Button>
              <Button
                variant={rotation ? 'danger' : 'primary'}
                loading={issue.isPending}
                onClick={() => issue.mutate()}
              >
                {actionLabel}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {rotation && (
              <Alert variant="danger">
                재발급 즉시 이전 키 값이 무효화됩니다. 그 값을 쓰고 있는 코드·배포 설정을
                새 값으로 바꾸기 전까지 요청이 거부됩니다.
              </Alert>
            )}
            <p className="text-sm text-neutral-600">
              평문은 다음 화면에서 한 번만 볼 수 있습니다.
            </p>
          </div>
        </Modal>

        {/* 발급 결과 — 평문이 존재하는 유일한 화면 */}
        <Modal
          open={issue.isSuccess}
          onClose={() => issue.reset()}
          title="LLM API 키 발급 완료"
          footer={
            <Button variant="secondary" onClick={() => issue.reset()}>
              확인했습니다
            </Button>
          }
        >
          {issue.data && (
            <div className="space-y-3">
              <Alert variant="warning" title="이 키는 다시 볼 수 없습니다">
                창을 닫으면 평문을 다시 확인할 수 없습니다. 서버에는 해시만 저장되므로
                지금 복사해 안전한 곳에 보관해 주세요.
              </Alert>
              <div className="flex items-center justify-between gap-3">
                <code className="overflow-x-auto rounded-md bg-neutral-900 px-3 py-2 font-mono text-xs break-all text-neutral-100">
                  {issue.data.token}
                </code>
                <CopyButton value={issue.data.token} label="복사" />
              </div>
              {issue.data.expiresAt && (
                <p className="text-sm text-neutral-600">
                  만료: {formatDateTime(issue.data.expiresAt)}
                </p>
              )}
              <p className="text-sm text-neutral-600">
                호출 방법은{' '}
                <Link
                  to={DOCS_PATH}
                  className="font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800"
                >
                  사용 가이드
                </Link>
                에 있습니다.
              </p>
            </div>
          )}
        </Modal>
      </CardContent>
    </Card>
  )
}
