import { Suspense, lazy, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAdminLlmUsage,
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
import { formatUsd } from '../lib/openrouter-credits'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'

const AdminLlmUsageCharts = lazy(
  () => import('../components/llm-usage/AdminLlmUsageCharts'),
)

const DAY_OPTIONS = [7, 30, 90] as const
const PAGE_TOP = 20

const PRESSURE_LABELS: Record<LlmLimitPressure['reason'], string> = {
  quota_exhausted: '일일 token 한도 소진',
  credit_exhausted: '금액 한도 소진',
  rate_limit_requests: '분당 요청 수 한도',
  rate_limit_tokens: '분당 token 한도',
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
  return `${count(value)} token`
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
              { term: 'TOKEN request', description: axisShare(selected.tokenAxisRequests, selected.requests) },
              { term: 'CREDIT request', description: axisShare(selected.creditAxisRequests, selected.requests) },
              { term: 'UNKNOWN request', description: axisShare(selected.unknownAxisRequests, selected.requests) },
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
          <MessageBar variant="warning" title="추정 token 비율을 계산할 수 없습니다">
            선택 구간에 원본 event가 보존되지 않은 bucket이 있습니다.
          </MessageBar>
        )}
        {quality.estimatedTokenRatio != null && quality.estimatedTokenRatio > 0 && (
          <MessageBar variant="warning" title="일부 token은 추정값입니다">
            {tokens(quality.estimatedTokens ?? 0)} · 전체 token의 {percent(quality.estimatedTokenRatio)}
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

function consumerName(item: LlmUsageConsumer, level: LlmUsageConsumerLevel): string {
  if (level === 'ORG') return item.orgName ?? '이름 없는 기관'
  if (level === 'WORKSPACE') return item.workspaceName ?? '이름 없는 워크스페이스'
  return item.keyName ?? '이름 없는 LLM API 키'
}

function ConsumersSection({
  data,
  activeOrgId,
}: {
  data: AdminLlmUsage
  activeOrgId?: string
}) {
  const { consumers } = data
  return (
    <Card>
      <CardHeader>
        <CardTitle>주요 소비처</CardTitle>
        <p className="type-caption mt-1 text-foreground-muted">
          행을 따라 기관·워크스페이스·key로 좁힙니다.
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
          <DataTable caption="LLM 주요 소비처" captionVisible>
            <THead>
              <TR>
                <TH>소비처</TH>
                <TH>요청</TH>
                <TH>입력 token</TH>
                <TH>출력 token</TH>
                <TH>연결</TH>
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
}: {
  item: LlmUsageConsumer
  level: LlmUsageConsumerLevel
  activeOrgId?: string
  days: AdminLlmUsageDays
}) {
  const name = consumerName(item, level)
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
        {level === 'KEY' && item.workspaceName && (
          <span className="block text-xs text-foreground-muted">{item.workspaceName}</span>
        )}
      </TD>
      <TD>{count(item.requests)}건</TD>
      <TD>{tokens(item.inputTokens)}</TD>
      <TD>{tokens(item.outputTokens)}</TD>
      <TD>
        {level === 'WORKSPACE' && item.workspaceId ? (
          <Link
            to={adminPaths.llmKeys(activeOrgId, item.workspaceId)}
            className="text-brand-foreground hover:underline"
          >
            필터된 key 목록
          </Link>
        ) : primary ? (
          <Link to={primary} className="text-brand-foreground hover:underline">
            {level === 'ORG' ? '워크스페이스 보기' : 'key 상세'}
          </Link>
        ) : '—'}
      </TD>
    </TR>
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
            description="설정된 한도나 최근 한도 압력이 있는 활성 key가 없습니다."
            className="min-h-40"
          />
        ) : (
          <DataTable caption="LLM API 키 한도 검토" captionVisible>
            <THead>
              <TR>
                <TH>Key</TH>
                <TH>판정</TH>
                <TH>오늘 TOKEN</TH>
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
                      <span className="block">TOKEN {tokens(item.todayTokens)}</span>
                      <span className="block text-foreground-muted">
                        UNKNOWN {tokens(item.todayUnknownAxisTokens)}
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
                          {item.openrouterAccountName ?? 'OpenRouter 사업 account'}
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
    diagnostics.push({ term: '마지막 usage 전송 성공', description: moment(quality.lastUsageShipSuccessAt) })
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
                  ? '양수 금액 한도 key 없음'
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

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="리소스"
        title="LLM 사용량"
        description={`${scope.activeOrg?.name ?? '플랫폼 전체'}의 수요, 소비처, 한도 압력과 데이터 신뢰도를 확인합니다.`}
        actions={workspaceId ? (
          <Link
            to={adminPaths.llmUsage(scope.activeOrgId, null, days)}
            className="text-sm font-medium text-brand-foreground hover:underline"
          >
            전체 소비처로 돌아가기
          </Link>
        ) : undefined}
      />

      {usage.isPending && <LoadingBlock label="LLM 사용량 불러오는 중" />}
      {usage.isError && !data && <MessageBar variant="danger">{usage.error.message}</MessageBar>}
      {data && (
        <>
          <DemandSection data={data} onDays={selectDays} />
          <ConsumersSection data={data} activeOrgId={scope.activeOrgId} />
          <LimitReviewSection data={data} activeOrgId={scope.activeOrgId} />
          <QualitySection quality={data.quality} activeOrgId={scope.activeOrgId} />
        </>
      )}
    </div>
  )
}
