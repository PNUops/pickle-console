import { Suspense, lazy, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAdminLlmUsage,
  fetchAdminWorkspaces,
  type AdminLlmUsage,
  type AdminLlmUsageDays,
  type GatewayReportState,
  type LlmLimitPressure,
  type LlmLimitReview,
  type LlmUsageConsumer,
  type LlmUsageConsumerLevel,
  type LlmUsageQuality,
  type LlmUsageWindow,
} from '../api/queries'
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  DescriptionList,
  EmptyState,
  ErrorBoundary,
  LlmKeyStatusBadge,
  LoadingBlock,
  MessageBar,
  PageHeader,
  Select,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  type BadgeVariant,
  type DescriptionItem,
} from '../components/ui'
import { ObservationMoment } from '../components/OpenRouterCredits'
import { formatBytes } from '../lib/format'
import { WORKSPACE_KIND_LABELS, type WorkspaceKind } from '../lib/labels'
import { endpointKindLabel } from '../lib/llm-endpoint-kinds'
import { formatUsd } from '../lib/openrouter-credits'
import { passthroughLabel } from '../lib/passthrough-endpoints'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'

const AdminLlmUsageCharts = lazy(
  () => import('../components/llm-usage/AdminLlmUsageCharts'),
)

const DAY_OPTIONS = [7, 30, 90] as const
const PAGE_TOP = 20

const PRESSURE_LABELS: Record<LlmLimitPressure['reason'], string> = {
  quota_exhausted: '일일 토큰 한도 소진',
  credit_exhausted: '금액 한도 소진',
  rate_limit_requests: '분당 요청 수 한도',
  rate_limit_tokens: '분당 토큰 한도',
  rate_limit_concurrency: '동시 요청 한도',
}

const REPORT_LABELS: Record<GatewayReportState, string> = {
  FRESH: '최근 보고됨',
  STALE: '보고 지연',
  NOT_REPORTED: '확인 전',
}

const REPORT_VARIANTS: Record<GatewayReportState, BadgeVariant> = {
  FRESH: 'success',
  STALE: 'warning',
  NOT_REPORTED: 'neutral',
}

function parseDays(raw: string | null): AdminLlmUsageDays {
  const value = Number(raw)
  return value === 30 || value === 90 ? value : 7
}

function count(value: number): string {
  return value.toLocaleString('ko-KR')
}

function tokens(value: number): string {
  return `${count(value)} 토큰`
}

function percent(value: number): string {
  const scaled = value * 100
  return `${scaled.toFixed(Number.isInteger(scaled) || scaled >= 100 ? 0 : 1)}%`
}

function ratio(value: number | null | undefined, empty = '표본 없음'): string {
  return value == null ? empty : percent(value)
}

function axisShare(value: number, total: number): string {
  return `${count(value)}건 · ${total === 0 ? '비중 없음' : percent(value / total)}`
}

function moment(value: string | null | undefined, empty = '기록 없음'): ReactNode {
  return <ObservationMoment value={value} empty={empty} />
}

function reportBadge(state: GatewayReportState) {
  return <Badge variant={REPORT_VARIANTS[state]}>{REPORT_LABELS[state]}</Badge>
}

function DemandSection({
  data,
  onDays,
}: {
  data: AdminLlmUsage
  onDays: (days: AdminLlmUsageDays) => void
}) {
  const selected = data.demand.windows.find((window) => window.days === data.days)
    ?? data.demand.windows[0]
  const noUsage = !selected || selected.requests === 0
  const quality = data.quality
  return (
    <Card>
      <CardHeader className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>수요 추이</CardTitle>
          <p className="type-caption mt-1 text-foreground-muted">
            KST 달력일 기준입니다.
          </p>
        </div>
        <div role="group" aria-label="LLM 사용량 조회 기간" className="flex flex-wrap gap-1">
          {DAY_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={data.days === days}
              onClick={() => onDays(days)}
              className={
                'cursor-pointer rounded-control px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-focus-ring ' +
                (data.days === days
                  ? 'bg-primary-600 text-white'
                  : 'text-foreground-secondary hover:bg-surface-subtle')
              }
            >
              {days}일
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {data.demand.windows.map((window) => (
            <WindowSummary key={window.days} window={window} selected={window.days === data.days} />
          ))}
        </div>

        {selected && (
          <DescriptionList
            columns={2}
            items={[
              { term: '자체 서빙 모델 요청', description: axisShare(selected.tokenAxisRequests, selected.requests) },
              { term: '유료 모델 요청', description: axisShare(selected.creditAxisRequests, selected.requests) },
              { term: '종류 미상 요청', description: axisShare(selected.unknownAxisRequests, selected.requests) },
              { term: '예산 축 기록 범위', description: ratio(selected.axisCoverage) },
            ]}
          />
        )}

        {noUsage ? (
          <EmptyState
            title="선택 기간에 LLM 요청이 없습니다"
            description="다른 기간이나 관리 범위를 선택해 보세요."
            className="min-h-40"
          />
        ) : (
          <ErrorBoundary label="LLM 사용량 추이">
            <Suspense
              fallback={
                <div className="flex justify-center py-10">
                  <Spinner label="LLM 사용량 차트 불러오는 중" />
                </div>
              }
            >
              <AdminLlmUsageCharts points={data.demand.daily} />
            </Suspense>
          </ErrorBoundary>
        )}

        {quality.totalTokens > 0 && quality.estimatedTokens == null && (
          <MessageBar variant="warning" title="추정 토큰 비율을 계산할 수 없습니다">
            선택 구간에 원본 기록이 보존되지 않은 날이 있습니다.
          </MessageBar>
        )}
        {quality.estimatedTokenRatio != null && quality.estimatedTokenRatio > 0 && (
          <MessageBar variant="warning" title="일부 토큰은 추정값입니다">
            {tokens(quality.estimatedTokens ?? 0)} · 전체 토큰의 {percent(quality.estimatedTokenRatio)}
          </MessageBar>
        )}
      </CardContent>
    </Card>
  )
}

function WindowSummary({ window, selected }: { window: LlmUsageWindow; selected: boolean }) {
  return (
    <div
      className={
        'rounded-panel border p-4 ' +
        (selected ? 'border-primary-300 bg-primary-50' : 'border-stroke-subtle bg-surface-subtle')
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-foreground-primary">최근 {window.days}일</p>
        {selected && <Badge variant="primary">선택됨</Badge>}
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground-primary">{count(window.requests)}건</p>
      <p className="mt-1 text-xs text-foreground-muted">
        입력 {tokens(window.inputTokens)} · 출력 {tokens(window.outputTokens)}
      </p>
    </div>
  )
}

/**
 * 금액 칸.
 *
 * **값이 없는 것과 0은 다르고, 값이 없는 이유도 둘이다.** 자체 서빙 모델에는 금액이라는
 * 것이 아예 없고, 축이 생기기 전(2026-09-06)의 요청은 기록되지 않았다. 둘 다 `$0.00`으로
 * 적으면 「공짜로 썼다」는, 서버가 한 적 없는 주장이 된다.
 *
 * **일부만 가격이 붙은 행은 그 사실을 그 자리에서 말한다.** 전체 개수만 따로 세면 그 몇
 * 건이 어느 모델에서, 어느 경로에서 빠진 것인지 알 수 없다. 여기 붙이면 빠진 자리가
 * 곧 그 행이다. 한 건도 안 붙은 행은 값 자체가 없으므로 개수를 덧붙이지 않는다.
 */
function amountCell(
  amount: number | null | undefined,
  requests: number,
  priced: number,
): string {
  if (amount == null) return '—'
  const missing = requests - priced
  return missing > 0 ? `${formatUsd(amount)} (${count(missing)}건 미상)` : formatUsd(amount)
}

/** 나열된 것이 무엇인지. 「소비처」는 세 단계를 한 단어로 뭉갠다. */
const CONSUMER_LEVEL_LABELS: Record<LlmUsageConsumerLevel, string> = {
  ORG: '기관',
  WORKSPACE: '워크스페이스',
  KEY: '키',
}

function consumerName(item: LlmUsageConsumer, level: LlmUsageConsumerLevel): string {
  if (level === 'ORG') return item.orgName ?? '이름 없는 기관'
  if (level === 'WORKSPACE') return item.workspaceName ?? '이름 없는 워크스페이스'
  return item.keyName ?? '이름 없는 LLM API 키'
}

function ConsumersSection({
  data,
  activeOrgId,
  workspaceKinds,
}: {
  data: AdminLlmUsage
  activeOrgId?: string
  workspaceKinds: Map<string, WorkspaceKind>
}) {
  const { consumers } = data
  return (
    <Card>
      <CardHeader>
        <CardTitle>주요 소비처</CardTitle>
        <p className="type-caption mt-1 text-foreground-muted">
          이름을 누르면 이 화면이 그 범위로 좁혀집니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {consumers.items.length === 0 ? (
          <EmptyState
            title="표시할 소비처가 없습니다"
            description="선택 기간과 관리 범위에 귀속된 요청이 없습니다."
            className="min-h-40"
          />
        ) : (
          // caption 은 화면에 띄우지 않는다 — 바로 위 카드 제목이 같은 말을 한다.
          <DataTable caption="LLM 주요 소비처">
            <THead>
              <TR>
                {/* 무엇이 나열됐는지 열 이름이 말한다. 「소비처」는 세 단계를
                    한 단어로 뭉개서, 워크스페이스 목록을 보면서도 그것이
                    워크스페이스인지 알 수 없었다. */}
                <TH>{CONSUMER_LEVEL_LABELS[consumers.level]}</TH>
                <TH>요청</TH>
                <TH>입력 토큰</TH>
                <TH>출력 토큰</TH>
                <TH>금액</TH>
              </TR>
            </THead>
            <TBody>
              {consumers.items.map((item, index) => (
                <ConsumerRow
                  key={item.keyId ?? item.workspaceId ?? item.orgId ?? index}
                  item={item}
                  level={consumers.level}
                  activeOrgId={activeOrgId}
                  days={data.days as AdminLlmUsageDays}
                  workspaceKinds={workspaceKinds}
                />
              ))}
            </TBody>
          </DataTable>
        )}
        {consumers.truncated && (
          <MessageBar>
            상위 {consumers.items.length.toLocaleString('ko-KR')}개만 표시합니다. 전체 소비처는{' '}
            {consumers.totalItems.toLocaleString('ko-KR')}개입니다.
          </MessageBar>
        )}
      </CardContent>
    </Card>
  )
}

function ConsumerRow({
  item,
  level,
  activeOrgId,
  days,
  workspaceKinds,
}: {
  item: LlmUsageConsumer
  level: LlmUsageConsumerLevel
  activeOrgId?: string
  days: AdminLlmUsageDays
  /** 워크스페이스 종류. 목록 조회가 이미 실어 오므로 서버에 더 묻지 않는다. */
  workspaceKinds: Map<string, WorkspaceKind>
}) {
  const name = consumerName(item, level)
  const kind = item.workspaceId ? workspaceKinds.get(item.workspaceId) : undefined
  const primary = level === 'ORG' && item.orgId
    ? adminPaths.llmUsage(item.orgId, null, days)
    : level === 'WORKSPACE' && item.workspaceId
      ? adminPaths.llmUsage(activeOrgId, item.workspaceId, days)
      : level === 'KEY' && item.keyId
        ? adminPaths.llmKeyDetail(item.keyId, activeOrgId)
        : null
  return (
    <TR>
      <TD>
        {primary ? (
          <Link to={primary} className="font-medium text-brand-foreground hover:underline">
            {name}
          </Link>
        ) : (
          <span className="font-medium text-foreground-primary">{name}</span>
        )}
        {level === 'WORKSPACE' && kind && (
          <span className="text-foreground-muted"> ({WORKSPACE_KIND_LABELS[kind]})</span>
        )}
        {level === 'KEY' && item.workspaceName && (
          <span className="block text-xs text-foreground-muted">{item.workspaceName}</span>
        )}
      </TD>
      <TD>{count(item.requests)}건</TD>
      <TD>{tokens(item.inputTokens)}</TD>
      <TD>{tokens(item.outputTokens)}</TD>
      {/* 금액이 없는 것은 0이 아니다. 자체 서빙 모델에는 금액이라는 것이 아예
          없고, 축이 생기기 전의 요청은 기록되지 않았다. 둘 다 `$0.00`으로 적으면
          「공짜로 썼다」는, 서버가 한 적 없는 주장이 된다. */}
      <TD>{amountCell(item.attributedCostUsd, item.requests, item.pricedRequests)}</TD>
    </TR>
  )
}

type BreakdownGrain = 'model' | 'endpoint' | 'capability'

const BREAKDOWN_GRAINS: { value: BreakdownGrain; label: string }[] = [
  { value: 'model', label: '모델별' },
  { value: 'endpoint', label: '호출 종류별' },
  { value: 'capability', label: '기능 권한별' },
]

/**
 * 같은 기간을 「무엇을」로 자른 셋.
 *
 * 카드 하나에 전환기를 두고 셋을 담는다. 라우트를 나누면 한 응답이 실어 온 것을
 * 다시 받아야 하고, 관리자 내비의 LLM 항목이 이미 넷이라 다섯째를 더하면 이
 * 구역만 다른 전 구역보다 커진다. 무엇보다 셋은 같은 질문의 세 입도라, 흩으면
 * 읽는 사람이 카드를 오가며 합을 맞춰야 한다.
 *
 * 어느 자리에도 시간축을 주지 않는다. 여기서 조치로 이어지는 사실은 추이가 아니라
 * 구성비이고, 범주가 넷을 넘는 순간 계열 색이 모자란다.
 */
function BreakdownSection({ data }: { data: AdminLlmUsage }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get('breakdown')
  const grain: BreakdownGrain =
    raw === 'endpoint' || raw === 'capability' ? raw : 'model'
  const select = (next: BreakdownGrain) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'model') params.delete('breakdown')
    else params.set('breakdown', next)
    setSearchParams(params, { replace: true })
  }
  const { breakdown } = data
  return (
    <Card>
      <CardHeader className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>호출 분해</CardTitle>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="분해 기준">
          {BREAKDOWN_GRAINS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => select(option.value)}
              aria-pressed={grain === option.value}
              className={
                grain === option.value
                  ? 'rounded-md bg-brand-background px-3 py-1 text-sm font-medium text-brand-foreground cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-foreground'
                  : 'rounded-md px-3 py-1 text-sm text-foreground-muted hover:text-foreground-primary cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-foreground'
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {grain === 'model' && <ModelBreakdownTable rows={breakdown.models} />}
        {grain === 'endpoint' && <EndpointBreakdownTable rows={breakdown.endpointKinds} />}
        {grain === 'capability' && (
          <CapabilityGrantTable rows={breakdown.passthroughGrants} />
        )}
        {grain === 'endpoint'
          && data.quality.endpointRecordedRequests < data.quality.totalRequests && (
          <MessageBar>
            「종류 미상」은 {count(data.quality.totalRequests
              - data.quality.endpointRecordedRequests)}건입니다.
          </MessageBar>
        )}
      </CardContent>
    </Card>
  )
}

function ModelBreakdownTable({ rows }: { rows: AdminLlmUsage['breakdown']['models'] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="표시할 모델이 없습니다"
        description="선택 기간과 관리 범위에 호출된 모델이 없습니다."
        className="min-h-40"
      />
    )
  }
  return (
    <DataTable caption="모델별 사용" captionVisible>
      <THead>
        <TR>
          <TH>모델</TH>
          <TH>요청</TH>
          <TH>토큰</TH>
          <TH>금액</TH>
          <TH>평균 응답</TH>
          <TH>실패율</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.modelName ?? 'unknown'}>
            <TD>{row.modelName ?? '모델 미상'}</TD>
            <TD>{count(row.requests)}건</TD>
            <TD>{tokens(row.inputTokens + row.outputTokens)}</TD>
            {/* 값 없음과 0을 가른다. 자체 서빙 모델에는 금액이라는 것이 없다. */}
            <TD>{amountCell(row.attributedCostUsd, row.requests, row.pricedRequests)}</TD>
            <TD>{Math.round(row.avgLatencyMs).toLocaleString('ko-KR')}ms</TD>
            <TD>
              {/* percent()가 100을 곱한다. 여기서 또 곱하면 476%가 나온다. */}
              {row.requests === 0 ? '—' : percent(row.failed / row.requests)}
            </TD>
          </TR>
        ))}
      </TBody>
    </DataTable>
  )
}

function EndpointBreakdownTable({
  rows,
}: {
  rows: AdminLlmUsage['breakdown']['endpointKinds']
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="표시할 호출 종류가 없습니다"
        description="선택 기간과 관리 범위에 들어온 요청이 없습니다."
        className="min-h-40"
      />
    )
  }
  const anyImages = rows.some((row) => row.imageCount > 0)
  return (
    <DataTable caption="호출 종류별 사용" captionVisible>
      <THead>
        <TR>
          <TH>호출 종류</TH>
          <TH>요청</TH>
          <TH>토큰</TH>
          <TH>금액</TH>
          {anyImages && <TH>이미지</TH>}
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.endpoint ?? 'unknown'}>
            <TD>{endpointKindLabel(row.endpoint)}</TD>
            <TD>{count(row.requests)}건</TD>
            <TD>{tokens(row.inputTokens + row.outputTokens)}</TD>
            <TD>{amountCell(row.attributedCostUsd, row.requests, row.pricedRequests)}</TD>
            {anyImages && <TD>{count(row.imageCount)}장</TD>}
          </TR>
        ))}
      </TBody>
    </DataTable>
  )
}

/**
 * 사용량이 아니라 「부여했는데 아무도 안 쓰는 권한이 있나」를 답한다. 사용량 자체는
 * 호출 종류별이 이미 말하므로 되풀이하지 않는다.
 */
function CapabilityGrantTable({
  rows,
}: {
  rows: AdminLlmUsage['breakdown']['passthroughGrants']
}) {
  return (
    <DataTable caption="기능 권한별 사용" captionVisible>
      <THead>
        <TR>
          <TH>기능</TH>
          <TH>부여된 키</TH>
          <TH>실제로 쓴 키</TH>
          <TH>요청</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.capability}>
            <TD>{passthroughLabel(row.capability)}</TD>
            <TD>{count(row.grantedKeys)}개</TD>
            <TD>{count(row.usedKeys)}개</TD>
            <TD>{count(row.requests)}건</TD>
          </TR>
        ))}
      </TBody>
    </DataTable>
  )
}

function actualExhaustion(item: LlmLimitReview): boolean {
  return item.quotaExhausted || item.pressure.some(
    (pressure) => pressure.reason === 'quota_exhausted' || pressure.reason === 'credit_exhausted',
  )
}

function LimitReviewSection({ data, activeOrgId }: { data: AdminLlmUsage; activeOrgId?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>한도 검토</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.limitReview.items.length === 0 ? (
          <EmptyState
            title="검토할 한도가 없습니다"
            description="설정된 한도나 최근 한도 압력이 있는 활성 키가 없습니다."
            className="min-h-40"
          />
        ) : (
          <DataTable caption="LLM API 키 한도 검토" captionVisible>
            <THead>
              <TR>
                <TH>키</TH>
                <TH>판정</TH>
                <TH>오늘 자체 서빙</TH>
                <TH>유료 모델</TH>
                <TH>최근 7일 압력</TH>
              </TR>
            </THead>
            <TBody>
              {data.limitReview.items.map((item) => {
                const danger = actualExhaustion(item)
                return (
                  <TR key={item.keyId}>
                    <TD>
                      <Link
                        to={adminPaths.llmKeyDetail(item.keyId, activeOrgId)}
                        className="font-medium text-brand-foreground hover:underline"
                      >
                        {item.keyName}
                      </Link>
                      <span className="block text-xs text-foreground-muted">
                        {item.orgName} · {item.workspaceName}
                      </span>
                      <span className="mt-1 block"><LlmKeyStatusBadge status={item.status} /></span>
                    </TD>
                    <TD>
                      {danger ? (
                        <Badge variant="danger">실제 소진 확인</Badge>
                      ) : item.pressure.length > 0 ? (
                        <Badge variant="warning">한도 압력</Badge>
                      ) : (
                        <Badge>설정 검토</Badge>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-xs">
                      <span className="block">자체 서빙 {tokens(item.todayTokens)}</span>
                      <span className="block text-foreground-muted">
                        종류 미상 {tokens(item.todayUnknownAxisTokens)}
                      </span>
                      <span className="block text-foreground-muted">
                        일일 한도 {item.dailyTokens == null ? '없음' : tokens(item.dailyTokens)}
                      </span>
                    </TD>
                    <TD className="min-w-48 text-xs">
                      <span className="block">한도 {formatUsd(item.creditLimit)}</span>
                      <span className="block">사용 {formatUsd(item.creditUsage)}</span>
                      <span className="block">잔여 {formatUsd(item.creditLimitRemaining)}</span>
                      <span className="block text-foreground-muted">{moment(item.creditUsageAt, '금액 관측 전')}</span>
                      <span className="mt-1 block">
                        {item.creditAxisConnected ? '유료 모델 연결됨' : '유료 모델 연결되지 않음'}
                      </span>
                      {item.openrouterAccountId && (
                        <Link
                          to={adminPaths.llmAccountDetail(item.openrouterAccountId, activeOrgId)}
                          className="mt-1 inline-block text-brand-foreground hover:underline"
                        >
                          {item.openrouterAccountName ?? 'OpenRouter 사업 계정'}
                        </Link>
                      )}
                    </TD>
                    <TD>
                      {item.pressure.length === 0 ? '기록 없음' : (
                        <ul className="space-y-1 text-xs">
                          {item.pressure.map((pressure) => (
                            <li key={pressure.reason}>
                              {PRESSURE_LABELS[pressure.reason]} {count(pressure.requests)}건
                            </li>
                          ))}
                        </ul>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </DataTable>
        )}
        {data.limitReview.truncated && (
          <MessageBar>
            {data.limitReview.totalItems.toLocaleString('ko-KR')}개 중 상위{' '}
            {data.limitReview.items.length.toLocaleString('ko-KR')}개만 표시합니다.
          </MessageBar>
        )}
      </CardContent>
    </Card>
  )
}

function QualitySection({
  quality,
  activeOrgId,
}: {
  quality: LlmUsageQuality
  activeOrgId?: string
}) {
  const diagnostics: DescriptionItem[] = []
  if (quality.lastUsageShipSuccessAt != null) {
    diagnostics.push({ term: '마지막 사용량 전송 성공', description: moment(quality.lastUsageShipSuccessAt) })
  }
  if (quality.usageQueueObservedAt != null) {
    diagnostics.push({ term: '대기열 마지막 확인', description: moment(quality.usageQueueObservedAt) })
  }
  if (quality.oldestUnshippedEventAt != null) {
    diagnostics.push({ term: '가장 오래된 미전송 기록', description: moment(quality.oldestUnshippedEventAt) })
  }
  if (quality.queuedUsageEvents != null) {
    diagnostics.push({ term: '전송 대기 기록', description: `${count(quality.queuedUsageEvents)}건` })
  }
  if (quality.queuedUsageBytes != null) {
    diagnostics.push({ term: '전송 대기 용량', description: formatBytes(quality.queuedUsageBytes) })
  }
  if (quality.spoolWriteFailures != null) {
    diagnostics.push({ term: '게이트웨이 저장 실패', description: `${count(quality.spoolWriteFailures)}회` })
  }
  if (quality.usageShipFailures != null) {
    diagnostics.push({ term: '사용량 전송 실패', description: `${count(quality.usageShipFailures)}회` })
  }
  if (quality.usageQueueScanFailures != null) {
    diagnostics.push({ term: '대기열 확인 실패', description: `${count(quality.usageQueueScanFailures)}회` })
  }
  if (quality.unattributedRequests != null) {
    diagnostics.push({ term: '어느 키인지 모르는 요청', description: `${count(quality.unattributedRequests)}건` })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>데이터 신선도·신뢰도</CardTitle>
          </div>
          <Link to={adminPaths.llmStatus(activeOrgId)} className="text-sm text-brand-foreground hover:underline">
            LLM 서비스 상태 보기
          </Link>
        </CardHeader>
        <CardContent>
          <DescriptionList
            columns={3}
            items={[
              { term: '집계 마지막 성공', description: moment(quality.rollupLastSuccessAt, '성공 기록 없음') },
              {
                term: '마지막 사용량 수신',
                description: moment(quality.latestUsageReceivedAt, '수신 기록 없음'),
              },
              {
                term: 'OpenRouter 사용액 확인',
                description: quality.creditMetersTotal === 0
                  ? '금액 한도가 0보다 큰 키 없음'
                  : `${count(quality.creditMetersObserved)} / ${count(quality.creditMetersTotal)}개`,
              },
              { term: '가장 오래된 금액 관측', description: moment(quality.oldestCreditUsageAt, '관측 기록 없음') },
              { term: '가장 최근 금액 관측', description: moment(quality.latestCreditUsageAt, '관측 기록 없음') },
              {
                term: '추정으로 채운 요청',
                description: quality.totalRequests === 0
                  ? '표본 없음'
                  : `${count(quality.estimatedRequests)}건 · ${ratio(quality.estimatedRequestRatio)}`,
              },
              { term: '게이트웨이 보고', description: reportBadge(quality.gatewayReportState) },
              { term: '전송 대기열 확인', description: reportBadge(quality.usageQueueReportState) },
              { term: '게이트웨이 마지막 연결', description: moment(quality.lastContactAt, '연결 기록 없음') },
            ]}
          />
        </CardContent>
      </Card>
      {diagnostics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>사용량 전달 진단</CardTitle>
            <p className="type-caption mt-1 text-foreground-muted">
              기관 범위와 무관한 플랫폼 전체 수치입니다.
            </p>
          </CardHeader>
          <CardContent>
            <DescriptionList columns={3} items={diagnostics} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export function AdminLlmUsagePage() {
  const scope = useAdminScope()
  const [searchParams, setSearchParams] = useSearchParams()
  const days = parseDays(searchParams.get('days'))
  const workspaceId = searchParams.get('workspaceId') ?? undefined
  const scopeKey = scope.activeOrgId ?? null
  const workspaceKey = workspaceId ?? null
  const usage = useQuery({
    queryKey: ['admin', 'llm-usage', { orgId: scopeKey, workspaceId: workspaceKey, days, top: PAGE_TOP }],
    queryFn: async () => ({
      scopeKey,
      workspaceKey,
      days,
      value: await fetchAdminLlmUsage({
        orgId: scope.activeOrgId,
        workspaceId,
        days,
        top: PAGE_TOP,
      }),
    }),
    enabled: scope.ready,
    staleTime: 60_000,
  })
  // 고를 목록. 기관이 정해지지 않은 시스템 계층 전체 보기에서는 워크스페이스가
  // 수백 개가 될 수 있어 고를 자리로 쓸 수 없으므로, 기관이 정해졌을 때만 묻는다.
  const workspaces = useQuery({
    queryKey: ['admin', 'workspaces', { orgId: scopeKey, for: 'llm-usage-filter' }],
    queryFn: () => fetchAdminWorkspaces(scope.activeOrgId == null ? {} : { orgId: scope.activeOrgId }),
    enabled: scope.ready && scope.activeOrgId != null,
    staleTime: 60_000,
  })

  // 종류는 이미 받아 온 목록에 있다. 소비처 응답에 필드를 더하지 않고 화면에서
  // 잇는다 — 종류가 필요한 자리가 이 표 하나뿐이고, 계약을 늘리면 그 필드를 쓰는
  // 곳이 여기밖에 없는 채로 남는다.
  const workspaceKinds = new Map(
    (workspaces.data ?? []).map((workspace) => [workspace.id, workspace.kind]),
  )

  const data = usage.data?.scopeKey === scopeKey
      && usage.data.workspaceKey === workspaceKey
      && usage.data.days === days
    ? usage.data.value
    : undefined

  const selectDays = (nextDays: AdminLlmUsageDays) => {
    const next = new URLSearchParams(searchParams)
    next.set('days', String(nextDays))
    setSearchParams(next, { replace: true })
  }

  const selectWorkspace = (nextWorkspaceId: string) => {
    const next = new URLSearchParams(searchParams)
    if (nextWorkspaceId) next.set('workspaceId', nextWorkspaceId)
    else next.delete('workspaceId')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="리소스"
        title="LLM 사용량"
        description={`${scope.activeOrg?.name ?? '플랫폼 전체'}의 수요, 소비처, 한도 압력과 데이터 신뢰도를 확인합니다.`}
      />

      {/* 워크스페이스를 직접 고르는 자리. 종전에는 「주요 소비처」 표에서 이름을
          눌러야만 이 범위에 닿았는데, **같은 행의 마지막 열이 키 목록이라는 다른
          곳으로 가서** 통계를 찾는 사람이 그쪽을 누르기 쉬웠다. 수업 하나를 보는
          것이 가장 흔한 동작이면 그것이 세 단계여서는 안 된다.

          이 화면의 다른 곳은 그대로다 — 서버는 이미 이 파라미터로 전 구역을
          좁히고 있었고, 없던 것은 고르는 자리뿐이다. */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="LLM 사용량 워크스페이스 필터"
          className="w-full sm:w-64"
          value={workspaceId ?? ''}
          onChange={(event) => selectWorkspace(event.target.value)}
        >
          <option value="">기관 전체</option>
          {workspaces.data?.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </Select>
        {workspaceId && (
          <button
            type="button"
            onClick={() => selectWorkspace('')}
            className="cursor-pointer rounded-md px-3 py-1 text-sm text-foreground-muted hover:text-foreground-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-foreground"
          >
            기관 전체로
          </button>
        )}
      </div>

      {usage.isPending && <LoadingBlock label="LLM 사용량 불러오는 중" />}
      {usage.isError && !data && <MessageBar variant="danger">{usage.error.message}</MessageBar>}
      {data && (
        <>
          <DemandSection data={data} onDays={selectDays} />
          <ConsumersSection
            data={data}
            activeOrgId={scope.activeOrgId}
            workspaceKinds={workspaceKinds}
          />
          <BreakdownSection data={data} />
          <LimitReviewSection data={data} activeOrgId={scope.activeOrgId} />
          <QualitySection quality={data.quality} activeOrgId={scope.activeOrgId} />
        </>
      )}
    </div>
  )
}
