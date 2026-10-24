import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useSearchParams } from 'react-router'
import { fetchAdminLlmCapacity, type AdminLlmCapacity, type LlmCapacityQuery } from '../../api/queries'
import { requestReaderKey } from '../../api/request-review'
import { useAuth } from '../../auth/auth-context'
import { canQueryWork, SYS_READERS } from '../../auth/institution-authority'
import { isSysTier } from '../../auth/permissions'
import { useAdminScope } from '../../lib/use-admin-scope'
import { CAPACITY_WINDOWS, capacityState, capacityWindow } from '../../lib/llm-capacity'
import { updateListParams, withListReturn } from '../../lib/list-url'
import { adminPaths } from '../../lib/paths'
import { formatDateTimeSeconds } from '../../lib/format'
import { TokenValue } from '../TokenValue'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'
import { formatTokenCompact, formatTokenExact } from '../../lib/token-presentation'
import { Button, Card, CardContent, CardHeader, CardTitle, DataTable, DescriptionList, EmptyState, Input, LoadingBlock, MessageBar, Pagination, Select, TBody, TD, TH, THead, TR } from '../ui'

type Counts = AdminLlmCapacity['summary']
type Consumer = AdminLlmCapacity['consumers']['items'][number]

const REASONS: Record<string, string> = {
  quota_exhausted: '일일 토큰 한도 소진', credit_exhausted: '금액 한도 소진',
  rate_limit_requests: '분당 요청 한도', rate_limit_tokens: '분당 토큰 한도', rate_limit_concurrency: '동시 요청 한도',
  endpoint_not_allowed: '기능 권한 없음', large_request_busy: '큰 요청 처리 자리 부족', server_busy: '전체 중계 처리 여유 부족',
  model_not_found: '모델 없음', model_not_allowed: '모델 정책 거절', credit_model_not_allowed: '유료 모델 정책 거절',
  model_not_available_on_route: '호출 경로에서 지원하지 않는 모델', router_model_not_supported: '지원하지 않는 라우터 모델',
  credit_only_parameter: '유료 모델 전용 설정', upstream_rejected: '공급자 요청 거절', upstream_timeout: '공급자 시간 초과',
  upstream_error: '공급자 오류', request_too_large: '요청 크기 초과', input_too_long: '입력 길이 초과',
  api_key_expired: '키 만료', api_key_revoked: '키 폐기', account_suspended: '키 이용 정지',
  invalid_api_key: '유효하지 않은 키', missing_api_key: '키 미제공', service_disabled: '서비스 점검',
  credit_unavailable: '유료 모델 연결 불가', credit_pending: '유료 모델 연결 대기',
}
const CATEGORIES: Record<string, string> = {
  USER_QUOTA: '사용자 한도', ENDPOINT_POLICY: '기능 정책', MODEL_POLICY: '모델 정책', LARGE_REQUEST: '큰 요청',
  GLOBAL_ADMISSION: '전역 중계', PROVIDER: '공급 경로 결과', INPUT: '입력', AUTHENTICATION: '인증', SERVICE: '서비스', CANCELED: '취소', UNCLASSIFIED: '미분류',
}
const FILTER_KEYS = ['workspaceId', 'upstreamId', 'publicModelName', 'errorType', 'errorTypeMissing', 'reasonCategory', 'group', 'bucketSeconds', 'page'] as const

function count(value: number | null | undefined): string { return value == null ? '미확인' : value.toLocaleString('ko-KR') }
function requests(value: number | null | undefined): string { return value == null ? '미확인' : `${count(value)}건` }
function at(value: string | null | undefined): string {
  if (!value) return '관측 기록 없음'
  const fraction = new Date(value).toISOString().slice(19, 23)
  return `${formatDateTimeSeconds(value)}${fraction === '.000' ? '' : fraction} KST`
}
function axisAt(seconds: number, windowMillis: number): string {
  const kst = new Date(seconds * 1000 + 9 * 3600_000).toISOString()
  return windowMillis <= 300_000 ? kst.slice(11, 19) : windowMillis <= 86400_000 ? kst.slice(11, 16) : kst.slice(5, 10)
}
function amount(counts: Counts): string {
  if (!counts.financeVisible) return '제공되지 않음'
  if (counts.pricedRequests == null) return '미확인'
  if (counts.costUsd == null) return counts.pricedRequests === 0 ? '금액 표본 없음' : '미확인'
  return counts.costUsd.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 8 })
}
function reasonLabel(errorType: string | null | undefined, category: string | undefined): string {
  if (errorType == null) return '원인 미기록'
  if (errorType === 'server_busy' && category !== 'GLOBAL_ADMISSION') {
    return category === 'PROVIDER' ? 'server_busy (공급 경로 결과)' : 'server_busy (발생 위치 미확인)'
  }
  return REASONS[errorType] ?? errorType
}
function localInput(value: string): string { return new Date(Date.parse(value) + 9 * 3600_000).toISOString().slice(0, 23) }

function WindowEditor({ from, to, onApply }: { from: string; to: string; onApply: (from: string, to: string) => void }) {
  const [start, setStart] = useState(localInput(from))
  const [end, setEnd] = useState(localInput(to))
  return <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" onSubmit={(event) => {
    event.preventDefault()
    if (start && end) onApply(new Date(`${start}+09:00`).toISOString(), new Date(`${end}+09:00`).toISOString())
  }}>
    <label className="min-w-0 text-sm">시작 시각 (KST)<Input aria-label="시작 시각 (KST)" type="datetime-local" step="0.001" required value={start} onChange={(event) => setStart(event.target.value)} /></label>
    <label className="min-w-0 text-sm">종료 시각 (KST)<Input aria-label="종료 시각 (KST)" type="datetime-local" step="0.001" required value={end} onChange={(event) => setEnd(event.target.value)} /></label>
    <Button type="submit" variant="secondary">기간 적용</Button>
  </form>
}

function ModelFilter({ value, onApply }: { value: string; onApply: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  return <form className="flex min-w-0 flex-1 items-end gap-2" onSubmit={(event) => { event.preventDefault(); onApply(draft) }}>
    <label className="min-w-0 flex-1 text-sm">요청한 공개 모델<Input aria-label="요청한 공개 모델" value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
    <Button type="submit" variant="secondary">모델 적용</Button>
  </form>
}

function Totals({ value }: { value: Counts }) {
  return <DescriptionList columns={3} items={[
    { term: '보존된 요청', description: requests(value.requests) },
    { term: '성공 / 제한 / 실패 / 취소', description: [value.succeeded, value.rateLimited, value.failed, value.canceled].map(count).join(' / ') },
    { term: '입력 / 출력 토큰', description: <>{value.inputTokens == null ? '미확인' : <TokenValue value={value.inputTokens} />} / {value.outputTokens == null ? '미확인' : <TokenValue value={value.outputTokens} />}</> },
    { term: 'TOKEN / CREDIT / 축 미상 요청', description: [value.tokenAxisRequests, value.creditAxisRequests, value.unknownAxisRequests].map(count).join(' / ') },
    { term: '키 / 모델 / 최종 공급원 미상', description: [value.unknownKeyRequests, value.unknownModelRequests, value.unknownFinalUpstreamRequests].map(count).join(' / ') },
    { term: '추정 토큰을 포함한 요청', description: requests(value.estimatedRequests) },
    { term: '공급자가 보고한 요청 금액', description: amount(value) },
    { term: '금액 표본', description: value.financeVisible ? requests(value.pricedRequests) : '제공되지 않음' },
  ]} />
}

function CurrentLimits({ value }: { value: Consumer['currentLimits'] }) {
  if (!value) return <>제공되지 않음</>
  return <div className="space-y-1 text-xs">
    <p>저장된 현재 설정 · {at(value.configurationObservedAt)}</p>
    <p>일일 {value.dailyTokens == null ? '무제한' : value.dailyTokens === 0 ? 'TOKEN 사용 불가' : <TokenValue value={value.dailyTokens} />}{value.quotaExhausted ? ' · 소진 상태' : ''}</p>
    <p>RPM {value.rpm == null ? '기본값 미보고' : count(value.rpm)} · TPM {value.tpm == null ? '기본값 미보고' : <TokenValue value={value.tpm} />} · 동시 요청 {value.concurrency == null ? '기본값 미보고' : count(value.concurrency)}</p>
    <p>과거 요청 당시 설정이나 서비스 반영 완료를 뜻하지 않습니다.</p>
  </div>
}

export default function LlmCapacityView() {
  const { user } = useAuth()
  const scope = useAdminScope()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [fallback] = useState(() => capacityWindow(86400))
  const parsed = capacityState(params, fallback)
  const query: LlmCapacityQuery = { ...parsed.query, orgId: scope.activeOrgId }
  const reader = requestReaderKey(user)
  const permitted = canQueryWork(user, ['llm.observe'], { orgId: scope.activeOrgId, workspaceId: query.workspaceId }, SYS_READERS)
  const visibility = JSON.stringify({ ...query, from: null, to: null, bucketSeconds: null, reader })
  const identity = JSON.stringify({ ...query, reader })
  const load = async () => {
    const value = await fetchAdminLlmCapacity(query)
    return { identity, visibility, value, fetchedAt: new Date().toISOString() }
  }
  const lastSuccess = useRef<Awaited<ReturnType<typeof load>> | null>(null)
  const capacity = useQuery({
    queryKey: ['admin', 'llm-capacity', identity],
    queryFn: load,
    enabled: scope.ready && permitted && !parsed.error,
    staleTime: 60_000,
    placeholderData: (previous) => previous?.visibility === visibility ? previous : undefined,
  })
  useEffect(() => {
    if (capacity.data && !capacity.isPlaceholderData) lastSuccess.current = capacity.data
  }, [capacity.data, capacity.isPlaceholderData])
  useEffect(() => {
    if (params.has('from') && params.has('to')) return
    const next = new URLSearchParams(params)
    if (!next.has('from')) next.set('from', fallback.from)
    if (!next.has('to')) next.set('to', fallback.to)
    setParams(next, { replace: true })
  }, [params, setParams, fallback])
  const result = capacity.data?.visibility === visibility ? capacity.data
    : lastSuccess.current?.visibility === visibility ? lastSuccess.current : undefined
  const data = scope.ready && permitted && !parsed.error ? result?.value : undefined
  const current = result?.identity === identity && !capacity.isPlaceholderData
  const update = (changes: Record<string, string | number | undefined>, reset = true) => setParams(updateListParams(params, changes, reset))
  const sameWindow = data && Date.parse(data.from) === Date.parse(query.from) && Date.parse(data.to) === Date.parse(query.to)
  const windowChanged = !current || !sameWindow
  const referenceWarning = data && Object.values(data.selectors).some((collection) => collection.truncated)
  const series = data?.series ?? []
  const axisWindowMillis = data ? Date.parse(data.to) - Date.parse(data.from) : 0
  const returnTo = `${location.pathname}${location.search}`

  return <section className="space-y-4 pt-4" aria-label="장비와 수요 비교">
    <div className="flex flex-wrap gap-2" role="group" aria-label="수요 비교 기간">
      {CAPACITY_WINDOWS.map((window) => <Button key={window.seconds} size="sm" variant="secondary" onClick={() => update({ ...capacityWindow(window.seconds), bucketSeconds: undefined })}>{window.label}</Button>)}
      <Button size="sm" variant="secondary" onClick={() => { void capacity.refetch() }} disabled={!scope.ready || !permitted || !!parsed.error || capacity.isFetching}>다시 조회</Button>
    </div>
    <WindowEditor key={`${query.from}:${query.to}`} from={query.from} to={query.to} onApply={(from, to) => update({ from, to, bucketSeconds: undefined })} />
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      {scope.ready && permitted && <ModelFilter key={JSON.stringify([reader, scope.activeOrgId, query.publicModelName])} value={query.publicModelName ?? ''} onApply={(value) => update({ publicModelName: value })} />}
      {FILTER_KEYS.some((key) => params.has(key)) && <div className="space-y-1">
        <Button variant="secondary" disabled={!scope.ready} onClick={() => update(Object.fromEntries(FILTER_KEYS.map((key) => [key, undefined])))}>조회 필터 초기화</Button>
        <p className="text-xs text-foreground-muted">기관과 기간은 유지합니다.</p>
      </div>}
    </div>
    {parsed.error && <MessageBar variant="danger">{parsed.error}</MessageBar>}
    {query.upstreamId && <MessageBar title="최종 처리 경로로 좁힌 결과입니다">
      <p>이 공급원에 귀속된 기록만 표시합니다. 경로 판정 전 거절과 공급원 미귀속 기록은 제외되므로, 표시된 0을 해당 장비의 거절 수요가 없다는 뜻으로 해석하지 마세요.</p>
      <Button variant="secondary" size="sm" onClick={() => update({ upstreamId: undefined })}>경로 제한 없이 보기</Button>
    </MessageBar>}
    {!permitted && <MessageBar>선택한 기관·공간 범위의 LLM 관측 업무가 없습니다.</MessageBar>}
    {permitted && capacity.isPending && !parsed.error && <LoadingBlock label="수요 비교 자료 불러오는 중" />}
    {capacity.isFetching && data && <MessageBar>새 조회 결과를 기다리고 있습니다. 아래에는 마지막 성공 응답의 기간을 표시합니다.</MessageBar>}
    {capacity.isError && <MessageBar variant="danger">갱신하지 못했습니다. {capacity.error.message} {data ? '마지막 성공 결과는 해당 조회 기간의 값입니다.' : '성공한 조회 결과가 없습니다.'}</MessageBar>}
    {data && <>
      <Card>
        <CardHeader><CardTitle>같은 시간창의 수요</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {windowChanged && <MessageBar variant="warning">이전 조회 결과입니다. 선택한 기간의 새 결과로 해석하지 마세요.</MessageBar>}
          <DescriptionList columns={2} items={[
            { term: '실제 응답 기간', description: `${at(data.from)} 이상 ~ ${at(data.to)} 미만` },
            { term: '요청한 기간', description: `${at(query.from)} 이상 ~ ${at(query.to)} 미만` },
            { term: '응답 생성', description: at(data.generatedAt) },
            { term: '콘솔 마지막 GET 성공', description: at(result?.fetchedAt) },
            { term: '집계 간격', description: `${count(data.bucketSeconds)}초` },
            { term: '수요 범위', description: scope.activeOrg?.name ?? (scope.tier === 'system' ? '플랫폼 전체' : '허용된 기관') },
          ]} />
          <Totals value={data.summary} />
          <p className="text-sm text-foreground-muted">TOKEN/CREDIT은 요청 당시 예산 축입니다. 실제 최종 공급원과 비용 부담은 별개이며 토큰 비중은 개인별 GPU 점유율이 아닙니다.</p>
          {data.summary.financeVisible && <p className="text-sm text-foreground-muted">금액은 공급자가 보고한 요청 금액입니다. 사용자·플랫폼 부담과 원가는 확인되지 않았습니다.</p>}
        </CardContent>
      </Card>
      {isSysTier(user?.role ?? 'USER') && data.telemetryVisible && <Card>
        <CardHeader><CardTitle>장비 전체와 추론 관측</CardTitle></CardHeader>
        <CardContent><MessageBar>{data.telemetry.status === 'NOT_CONFIGURED' ? '장비·추론 수집이 구성되지 않았습니다. 수요 기록만으로 장비 여유나 한도 증감 효과를 판단할 수 없습니다.' : '장비·추론 관측이 제공되지 않습니다.'}</MessageBar></CardContent>
      </Card>}
      <Card>
        <CardHeader><CardTitle>기록의 보존과 전달</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {data.quality.rawHistoryState === 'FULLY_SWEPT' ? <MessageBar variant="warning">조회 기간의 원문 수요 기록이 보존되어 있지 않습니다. 미확인을 0으로 표시하지 않습니다.</MessageBar>
            : data.quality.rawHistoryState === 'PARTIALLY_SWEPT' ? <MessageBar variant="warning">조회 기간 일부가 삭제되어 보존된 구간만 집계했습니다.</MessageBar> : null}
          <DescriptionList columns={3} items={[
            { term: '원문 기록의 보존 경계', description: data.quality.rawRetainedFrom ? at(data.quality.rawRetainedFrom) : '삭제 경계 보고 없음' },
            { term: '설정된 보존 기간', description: data.quality.configuredRetentionDays === 0 ? '무기한' : `${data.quality.configuredRetentionDays}일` },
            { term: '마지막 사용량 수신', description: at(data.quality.latestUsageReceivedAt) },
            { term: '일별 집계 마지막 성공', description: at(data.quality.rollupLastSuccessAt) },
            { term: '게이트웨이 마지막 연결', description: at(data.quality.gateway.lastContactAt) },
            { term: '응답 시점의 게이트웨이 보고', description: { NOT_REPORTED: '미보고', STALE: '보고 지연', FRESH: '최근 보고됨' }[data.quality.gateway.reportState] },
            { term: '사용량 전달 마지막 성공', description: isSysTier(user?.role ?? 'USER') ? at(data.quality.gateway.lastUsageShipSuccessAt) : '제공되지 않음' },
            { term: '기간 전체의 수집 완전성', description: '미확인' },
          ]} />
          <p className="text-sm text-foreground-muted">마지막 수신 시각은 기간 전체의 수집 완료를 보장하지 않습니다. 기록이 없더라도 미수집이나 전송 손실이 없었다는 뜻은 아닙니다.</p>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TimeSeriesChart title="같은 기간의 요청 기록" times={series.map((point) => Date.parse(point.from) / 1000)} series={[{ label: '요청', data: series.map((point) => point.counts.requests ?? null) }]}
          format={(value) => `${count(value)}건`} formatDetail={(value) => `${count(value)}건`} formatTime={(value) => at(new Date(value * 1000).toISOString())} formatAxisTime={(value) => axisAt(value, axisWindowMillis)} splitBase="integer" />
        <TimeSeriesChart title="같은 기간의 입력·출력 토큰" times={series.map((point) => Date.parse(point.from) / 1000)} series={[{ label: '입력', data: series.map((point) => point.counts.inputTokens ?? null) }, { label: '출력', data: series.map((point) => point.counts.outputTokens ?? null) }]}
          format={formatTokenCompact} formatDetail={formatTokenExact} formatTime={(value) => at(new Date(value * 1000).toISOString())} formatAxisTime={(value) => axisAt(value, axisWindowMillis)} splitBase="integer" caption="각 구간의 합계입니다. 초당 처리량이나 순간 최댓값이 아닙니다." />
      </div>
      {current && sameWindow && <>
        <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {scope.tier === 'system' && <label className="min-w-0 flex-1 text-sm">수요 기관<Select aria-label="수요 기관" value={scope.activeOrgId ?? ''} onChange={(event) => update({ org: event.target.value, workspaceId: undefined })}><option value="">플랫폼 전체 읽기 범위</option>{data.selectors.institutions.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>}
          <label className="min-w-0 flex-1 text-sm">워크스페이스<Select aria-label="수요 워크스페이스" value={query.workspaceId ?? ''} onChange={(event) => update({ workspaceId: event.target.value, group: 'KEY' })}><option value="">현재 기관 범위 전체</option>{query.workspaceId && !data.selectors.workspaces.items.some((item) => item.id === query.workspaceId) && <option value={query.workspaceId}>선택 목록 밖의 현재 필터</option>}{data.selectors.workspaces.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
          <label className="min-w-0 flex-1 text-sm">최종 처리 공급원<Select aria-label="최종 처리 공급원" value={query.upstreamId ?? ''} onChange={(event) => update({ upstreamId: event.target.value })}><option value="">공급원 전체·미귀속 포함</option>{query.upstreamId && !data.selectors.upstreams.items.some((item) => item.id === query.upstreamId) && <option value={query.upstreamId}>선택 목록 밖의 현재 필터</option>}{data.selectors.upstreams.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
          <label className="min-w-0 flex-1 text-sm">소비처 구분<Select aria-label="소비처 구분" value={query.group} onChange={(event) => update({ group: event.target.value })}>{scope.tier === 'system' && <option value="ORG">기관</option>}<option value="WORKSPACE">워크스페이스</option><option value="KEY">키</option></Select></label>
        </div>
        {referenceWarning && <MessageBar>선택 목록은 일부만 표시됩니다. 현재 조건과 권한에서 읽을 수 있는 대상만 조회합니다.</MessageBar>}
        <Card><CardHeader><CardTitle>거절·오류 원인</CardTitle></CardHeader><CardContent className="space-y-3">
          {(query.errorType || query.errorTypeMissing || query.reasonCategory) && <div className="flex flex-wrap items-center gap-2"><p className="break-all text-sm">선택한 원인: {query.errorTypeMissing ? '원인 미기록' : query.errorType ? reasonLabel(query.errorType, query.reasonCategory) : '모든 원인'} · {query.reasonCategory ? CATEGORIES[query.reasonCategory] ?? '미분류' : '모든 분류'}</p><Button variant="secondary" size="sm" onClick={() => update({ errorType: undefined, errorTypeMissing: undefined, reasonCategory: undefined })}>원인 전체로</Button></div>}
          {data.reasons.length === 0 ? <EmptyState title="보존된 거절·오류 기록이 없습니다" /> : <DataTable caption="같은 조건의 거절·오류 원인"><THead><TR><TH>원인</TH><TH>분류</TH><TH>요청</TH><TH>확인된 키</TH></TR></THead><TBody>{data.reasons.map((reason, index) => <TR key={`${reason.errorType}:${index}`}>
            <TD><button type="button" className="cursor-pointer text-left text-brand-foreground underline [overflow-wrap:anywhere]" onClick={() => update({ errorType: reason.errorType ?? undefined, errorTypeMissing: reason.errorType == null ? 'true' : undefined, reasonCategory: reason.category, group: 'KEY' })}>{reasonLabel(reason.errorType, reason.category)}</button></TD>
            <TD>{CATEGORIES[reason.category] ?? '미분류'}</TD><TD>{count(reason.requests)}건</TD><TD>{count(reason.knownKeys)}개</TD>
          </TR>)}</TBody></DataTable>}
          <p className="text-sm text-foreground-muted">거절 전 모델·공급원이 결정되지 않은 기록은 특정 장비의 처리 부하로 귀속하지 않습니다. 구성 연결은 실제 처리 경로나 영향 키 목록이 아닙니다.</p>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>같은 조건의 소비처</CardTitle><p className="text-sm text-foreground-muted">전체 {count(data.consumers.totalElements)}개 · {data.consumers.page + 1}페이지</p></CardHeader><CardContent className="space-y-3">
          {data.consumers.items.length === 0 ? <EmptyState title="현재 조건의 보존된 소비처가 없습니다" /> : <DataTable caption="같은 조건의 소비처"><THead><TR><TH>소비처</TH><TH>요청</TH><TH>입력 / 출력 토큰</TH><TH>보고된 금액</TH>{data.consumers.group === 'KEY' && <TH>현재 키 설정</TH>}</TR></THead><TBody>{data.consumers.items.map((item, index) => <TR key={item.keyId ?? item.workspaceId ?? item.orgId ?? index}>
            <TD>{item.keyId ? <Link className="text-brand-foreground underline [overflow-wrap:anywhere]" to={withListReturn(adminPaths.llmKeyDetail(item.keyId, scope.activeOrgId), returnTo)}>{item.keyName ?? '이름 없는 키'}</Link>
              : data.consumers.group === 'ORG' && item.orgId ? <button type="button" className="cursor-pointer text-left text-brand-foreground underline" onClick={() => update({ org: item.orgId!, workspaceId: undefined, group: 'WORKSPACE' })}>{item.orgName ?? '이름 없는 기관'}</button>
                : item.workspaceId ? <button type="button" className="cursor-pointer text-left text-brand-foreground underline" onClick={() => update({ workspaceId: item.workspaceId!, group: 'KEY' })}>{item.workspaceName ?? '이름 없는 워크스페이스'}</button> : '귀속 대상 미상'}</TD>
            <TD>{count(item.counts.requests)}</TD><TD>{item.counts.inputTokens == null ? '미확인' : <TokenValue value={item.counts.inputTokens} />} / {item.counts.outputTokens == null ? '미확인' : <TokenValue value={item.counts.outputTokens} />}</TD><TD>{amount(item.counts)}</TD>
            {data.consumers.group === 'KEY' && <TD><CurrentLimits value={item.currentLimits} /></TD>}
          </TR>)}</TBody></DataTable>}
          <Pagination page={data.consumers.page} totalPages={data.consumers.totalPages} onPageChange={(page) => update({ page }, false)} />
        </CardContent></Card>
      </>}
    </>}
  </section>
}
