import { Suspense, lazy, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchLlmKey,
  invalidateResourceLists,
  issueLlmKeyToken,
  updateLlmKey,
  type LlmKeyDetail,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { CodeBlock } from '../components/CodeBlock'
import { CopyButton } from '../components/CopyButton'
import { RevokeKeyCard } from '../components/llm-key/RevokeKeyCard'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ErrorBoundary,
  FormField,
  Input,
  LlmKeyStatusBadge,
  Modal,
  PermissionNotice,
  Spinner,
  TabPanel,
  Tabs,
  Textarea,
  type TabItem,
} from '../components/ui'
import { DOCS_PATH } from '../lib/brand'
import { formatDateTime } from '../lib/format'
import { LLM_API_BASE_URL, LLM_DEFAULT_MODEL } from '../lib/llm-api'
import { consolePaths } from '../lib/paths'
import { effectiveLlmKeyStatus, type LlmApiKeyStatus } from '../lib/status'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'

// 사용량 차트는 uPlot을 끌어오므로 사용량 탭을 여는 사람에게만 내려받는다
// (할당 추이·VM 모니터링과 같은 규칙).
const LlmKeyUsageSection = lazy(() => import('../components/llm-usage/LlmKeyUsageSection'))

/** 상세 탭 구성. 배열 순서가 렌더 순서이고, 탭 id는 `?tab=` 링크가 쓴다. */
const KEY_TABS: TabItem[] = [
  { id: 'overview', label: '개요' },
  { id: 'usage', label: '사용량' },
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

      <TabPanel id="overview" active={activeTab === 'overview'} className="space-y-6">
      <StatusNotice status={status} />
      <IssueSection llmKey={llmKey} status={status} />
      {status === 'ACTIVE' && <ConnectionSection />}

      <Card>
        <CardHeader>
          <CardTitle>키 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <Field label="키 앞부분">
              {/* 두 키를 구별하려고 두는 값이다. 아직 발급 전이면 존재하지 않는다. */}
              {llmKey.tokenPrefix ? (
                <code className="font-mono text-sm">{llmKey.tokenPrefix}…</code>
              ) : (
                '발급 전'
              )}
            </Field>
            <Field label="마지막 사용">
              {llmKey.lastUsedAt ? formatDateTime(llmKey.lastUsedAt) : '사용 기록 없음'}
            </Field>
            <Field label="만료">
              {llmKey.expiresAt ? formatDateTime(llmKey.expiresAt) : '만료 없음'}
            </Field>
            <Field label="본문 기록">{llmKey.recordBodies ? '켜짐' : '꺼짐'}</Field>
            <Field label="분당 요청 한도 (자체 서빙)">{limitLabel(llmKey.rpm, '회')}</Field>
            <Field label="분당 토큰 한도 (자체 서빙)">{limitLabel(llmKey.tpm, '토큰')}</Field>
            <Field label="동시 요청 한도 (자체 서빙)">
              {limitLabel(llmKey.concurrency, '건')}
            </Field>
            <Field label="유료 모델">{creditAxisLabel(llmKey)}</Field>
            {llmKey.creditLimit ? (
              <Field label="쓸 수 있는 유료 모델">
                {llmKey.creditAllowedModels.length === 0
                  ? '제한 없음. 금액 한도 안에서 모든 유료 모델'
                  : llmKey.creditAllowedModels.join(', ')}
              </Field>
            ) : null}
            <Field label="생성일">{formatDateTime(llmKey.createdAt)}</Field>
            {llmKey.revokedAt && (
              <Field label="폐기 시각">{formatDateTime(llmKey.revokedAt)}</Field>
            )}
          </dl>
          <p className="mt-4 text-xs text-neutral-500">
            마지막 사용 시각에는 최근 호출이 늦게 반영될 수 있습니다.
          </p>
        </CardContent>
      </Card>

      {!terminal && <EditSection llmKey={llmKey} />}

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

/** null 한도는 "무제한"이 아니라 "게이트웨이 기본값"이다 — 계약이 그렇게 말한다. */
function limitLabel(value: number | null | undefined, unit: string): string {
  return value == null ? '게이트웨이 기본값' : `${value}${unit}`
}

/**
 * 유료 모델의 세 상태를 한 줄로 말한다. 한도는 부여됐는데 아직 적용 전인 상태가
 * 셋째이고, 이 상태를 말하지 않으면 화면은 한도를 보여주면서 호출은 거절되는
 * 모습이 되어 사용자가 플랫폼 오류로 읽는다. 게이트웨이가 같은 순간 돌려주는
 * `credit_pending` 문구와 같은 사실을 말해야 한다.
 */
function creditAxisLabel(llmKey: {
  creditLimit: number
  creditLimitReset?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null
  creditAxisConnected: boolean
}): string {
  if (!llmKey.creditLimit) return '금액 한도가 없어 유료 모델을 쓸 수 없습니다'
  const window =
    llmKey.creditLimitReset == null
      ? '총액'
      : { DAILY: '일일', WEEKLY: '주간', MONTHLY: '월간' }[llmKey.creditLimitReset]
  const amount = `$${llmKey.creditLimit.toLocaleString('ko-KR')} (${window})`
  return llmKey.creditAxisConnected
    ? amount
    : `${amount}, 승인된 한도를 적용하는 중입니다`
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-800">{children}</dd>
    </div>
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

/* ─── 연결 정보 ─── */

/**
 * 키를 손에 쥔 자리에서 첫 호출까지 가게 하는 카드.
 *
 * 키 평문은 서버에 없으므로 예시에는 환경 변수 자리표시자만 넣는다. 발급 화면을
 * 떠나면 어디로 보내는지 알 방법이 없어, 주소와 모델 이름을 여기에 둔다.
 */
function ConnectionSection() {
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
          <Field label="base URL">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{LLM_API_BASE_URL}</span>
              <CopyButton value={LLM_API_BASE_URL} label="복사" />
            </div>
          </Field>
          <Field label="모델">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{LLM_DEFAULT_MODEL}</span>
              <CopyButton value={LLM_DEFAULT_MODEL} label="복사" />
            </div>
          </Field>
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
      </CardContent>
    </Card>
  )
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

/* ─── 이름·용도·본문 기록 ─── */

function EditSection({ llmKey }: { llmKey: LlmKeyDetail }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(llmKey.name)
  const [purpose, setPurpose] = useState(llmKey.purpose ?? '')
  const [recordBodies, setRecordBodies] = useState(llmKey.recordBodies)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // 편집은 편집자 등급부터다 (서버와 같은 기준).
  const allowed = llmKey.myResourceRole === 'OWNER' || llmKey.myResourceRole === 'EDITOR'

  // 서버 값이 갱신되면(다른 탭의 변경, 발급 후 재조회) 폼도 그 값을 따라간다.
  useEffect(() => {
    setName(llmKey.name)
    setPurpose(llmKey.purpose ?? '')
    setRecordBodies(llmKey.recordBodies)
  }, [llmKey.name, llmKey.purpose, llmKey.recordBodies])

  // 서버는 두 문자열을 모두 다듬어 저장한다. 화면도 같은 값으로 비교해야
  // "바뀐 것"의 정의가 양쪽에서 같아진다 — 공백만 덧붙인 편집을 변경으로 보면
  // 저장 후 돌아온 값이 그대로라 폼이 영원히 미저장 상태에 갇힌다.
  const trimmedName = name.trim()
  const trimmedPurpose = purpose.trim()

  const save = useMutation({
    // 바뀐 항목만 보낸다 — 생략한 항목을 서버가 그대로 두는 것이 계약이라,
    // 전부 보내면 다른 사람이 방금 바꾼 값을 되돌리게 된다.
    mutationFn: () =>
      updateLlmKey(llmKey.id, {
        ...(trimmedName === llmKey.name ? {} : { name: trimmedName }),
        // 빈 문자열은 용도를 지우는 방법이고, 항목을 빼는 것은 그대로 두는 방법이다.
        ...(trimmedPurpose === (llmKey.purpose ?? '') ? {} : { purpose: trimmedPurpose }),
        ...(recordBodies === llmKey.recordBodies ? {} : { recordBodies }),
      }),
    onSuccess: async () => {
      setError(null)
      setSaved(true)
      await queryClient.invalidateQueries({ queryKey: ['llm-keys', llmKey.id] })
      await invalidateResourceLists(queryClient)
    },
    onError: (err) => {
      setSaved(false)
      setError(toApiError(err, 'LLM API 키를 수정하지 못했습니다.').message)
    },
  })

  const dirty =
    trimmedName !== llmKey.name ||
    trimmedPurpose !== (llmKey.purpose ?? '') ||
    recordBodies !== llmKey.recordBodies
  // 이름은 지울 수 없다 (계약이 1자 이상을 요구한다). 서버가 422로 막기 전에
  // 여기서 말해 준다 — 눌러야만 아는 거절을 만들지 않는다.
  const nameError = trimmedName === '' ? '키 이름은 비워 둘 수 없습니다.' : undefined

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!dirty || nameError) return
    setSaved(false)
    save.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>키 설정</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert variant="danger">{error}</Alert>}
        {saved && !dirty && <Alert variant="success">설정을 저장했습니다.</Alert>}
        <form onSubmit={submit} className="space-y-4">
          <FormField label="이름" className="max-w-md" error={nameError}>
            <Input
              value={name}
              maxLength={100}
              disabled={!allowed}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <FormField
            label="용도"
            className="max-w-md"
            description="이 키를 무엇에 쓰는지 — 목록에서 두 키를 구별하는 데 쓰입니다."
          >
            <Textarea
              rows={2}
              value={purpose}
              maxLength={2000}
              disabled={!allowed}
              onChange={(event) => setPurpose(event.target.value)}
            />
          </FormField>
          <Checkbox
            className="max-w-md"
            label="프롬프트·응답 본문 기록"
            description="켜면 이 키로 보낸 프롬프트와 응답이 수집됩니다. 개인정보가 담기는 요청에는 켜지 마세요."
            checked={recordBodies}
            disabled={!allowed}
            onChange={(event) => setRecordBodies(event.target.checked)}
          />
          <Button
            type="submit"
            loading={save.isPending}
            disabled={!allowed || !dirty || Boolean(nameError)}
          >
            저장
          </Button>
        </form>
        {!allowed && (
          <PermissionNotice>
            키 설정 변경은 편집자 이상 등급을 받은 사람만 할 수 있습니다.
          </PermissionNotice>
        )}
      </CardContent>
    </Card>
  )
}
