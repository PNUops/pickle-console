import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import {
  fetchAdminLlmMetrics,
  fetchAdminLlmStatus,
  type ActiveProbeStatus,
  type AdminLlmMetrics,
  type AdminLlmStatus,
  type LlmCatalogStatus,
  type GatewayReportState,
  type LlmLocalRejection,
  type LlmUpstreamMetric,
  type LlmUpstreamStatus,
  type UpstreamAvailability,
  type UpstreamReportState,
} from '../api/queries'
import { useAuth } from '../auth/auth-context'
import { isSysTier } from '../auth/permissions'
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  DescriptionList,
  EmptyState,
  LoadingBlock,
  MessageBar,
  PageHeader,
  TabPanel,
  Tabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
  type BadgeVariant,
} from '../components/ui'
import { ObservationMoment } from '../components/OpenRouterCredits'
import { formatBytes, formatDateTime, formatRelative } from '../lib/format'
import { useAdminScope } from '../lib/use-admin-scope'

const SCREEN_TABS = [
  { id: 'status', label: '상태' },
  { id: 'metrics', label: '지표' },
]

const REPORT_LABELS: Record<UpstreamReportState, string> = {
  OK: '보고됨',
  NOT_REPORTED: '아직 보고되지 않음',
  MISSING: '최근 보고에서 빠짐',
  STALE: '보고 지연',
  DECONFIGURED: 'Gateway 설정에서 제거됨',
  UNREGISTERED: '플랫폼에 미등록',
}

const ORG_REPORT_LABELS: Record<UpstreamReportState, string> = {
  OK: '보고됨',
  NOT_REPORTED: '아직 보고되지 않음',
  MISSING: '최근 상태에서 빠짐',
  STALE: '보고 지연',
  DECONFIGURED: '연결 해제됨',
  UNREGISTERED: '등록 확인 필요',
}

const REPORT_VARIANTS: Record<UpstreamReportState, BadgeVariant> = {
  OK: 'success',
  NOT_REPORTED: 'neutral',
  MISSING: 'warning',
  STALE: 'warning',
  DECONFIGURED: 'neutral',
  UNREGISTERED: 'warning',
}

const AVAILABILITY_LABELS: Record<UpstreamAvailability, string> = {
  UNKNOWN: '확인되지 않음',
  HEALTHY: '정상',
  DEGRADED: '주의',
  UNAVAILABLE: '사용 불가',
}

const AVAILABILITY_VARIANTS: Record<UpstreamAvailability, BadgeVariant> = {
  UNKNOWN: 'neutral',
  HEALTHY: 'success',
  DEGRADED: 'warning',
  UNAVAILABLE: 'danger',
}

const GATEWAY_REPORT_LABELS: Record<GatewayReportState, string> = {
  NOT_REPORTED: '아직 보고되지 않음',
  FRESH: '최근 보고됨',
  STALE: '보고 지연',
}

const GATEWAY_REPORT_VARIANTS: Record<GatewayReportState, BadgeVariant> = {
  NOT_REPORTED: 'neutral',
  FRESH: 'success',
  STALE: 'warning',
}

const QUEUE_REPORT_LABELS: Record<GatewayReportState, string> = {
  NOT_REPORTED: '아직 확인되지 않음',
  FRESH: '최근 확인됨',
  STALE: '확인 지연',
}

const ACTIVE_LABELS: Record<ActiveProbeStatus, string> = {
  OK: '연결 확인 성공',
  AUTH_UNVERIFIED: '도달함 · 인증 미확인',
  FAILED: '연결 확인 실패',
  UNKNOWN: '아직 확인하지 않음',
}

const CATALOG_LABELS: Record<LlmCatalogStatus, string> = {
  MATCH: '모델 목록 일치',
  MISMATCH: '모델 목록 불일치',
  NOT_APPLICABLE: '비교 대상 아님',
  UNKNOWN: '아직 비교하지 않음',
}

function count(value: number): string {
  return value.toLocaleString('ko-KR')
}

function diagnosticCount(value: number | null | undefined, suffix = '회'): string {
  return value == null ? '미보고' : `${count(value)}${suffix}`
}

function ratio(value: number): string {
  const percent = value * 100
  return `${percent.toFixed(percent >= 100 || Number.isInteger(percent) ? 0 : 1)}%`
}

function coverage(value: number, covered: number, total: number): string {
  if (total === 0) return '표본 없음'
  return `${ratio(value)} · ${count(covered)} / ${count(total)}건`
}

function moment(value: string | null | undefined, empty = '기록 없음') {
  return <ObservationMoment value={value} empty={empty} />
}

function metricRangeEndpoint(value: string): string {
  return value.includes('T') ? `${formatDateTime(value)} KST` : value
}

function upstreamKind(kind: string | null | undefined): string {
  if (kind === 'ON_PREM') return '온프렘'
  if (kind === 'EXTERNAL_API' || kind === 'EXTERNAL') return '외부 API'
  return kind == null ? '구분 없음' : '기타'
}

function generationText(status: AdminLlmStatus['gateway']): string {
  if (status.desiredGeneration == null || status.appliedGeneration == null) return '확인되지 않음'
  if (status.desiredGeneration === status.appliedGeneration) {
    return `${status.appliedGeneration.toLocaleString('ko-KR')} 적용됨`
  }
  return `요청 ${status.desiredGeneration.toLocaleString('ko-KR')} · 적용 ${status.appliedGeneration.toLocaleString('ko-KR')}`
}

function activeProbeText(upstream: LlmUpstreamStatus, systemView: boolean) {
  const { active } = upstream
  const observationExpired = active.stale
  const expiredStatusLabels: Record<ActiveProbeStatus, string> = {
    OK: '마지막 연결 확인 성공 · 관측 기한 지남',
    AUTH_UNVERIFIED: '마지막 확인: 도달함·인증 미확인 · 관측 기한 지남',
    FAILED: '마지막 연결 확인 실패 · 관측 기한 지남',
    UNKNOWN: '관측 기한 지남',
  }
  const statusLabel = observationExpired
    ? expiredStatusLabels[active.status]
    : active.status === 'UNKNOWN' && active.lastAttemptAt != null
      ? systemView
        ? '최근 probe 결과 없음'
        : '최근 상태 확인 불가'
      : ACTIVE_LABELS[active.status]
  return (
    <div>
      <span className="font-medium text-foreground-primary">{statusLabel}</span>
      {active.status === 'OK' && !observationExpired && active.latencyMs != null && (
        <span className="block text-xs text-foreground-muted">
          {active.latencyMs.toLocaleString('ko-KR')} ms
          {active.modelCount != null ? ` · 모델 ${count(active.modelCount)}개` : ''}
        </span>
      )}
      {systemView && active.failureType && (
        <span className="block text-xs text-foreground-muted">
          {active.failureType}
          {active.consecutiveFailures == null
            ? ''
            : ` · 연속 실패 ${count(active.consecutiveFailures)}회`}
        </span>
      )}
      {active.lastAttemptAt ? (
        <time dateTime={active.lastAttemptAt} className="block text-xs text-foreground-muted">
          {formatRelative(active.lastAttemptAt)} 확인
        </time>
      ) : (
        <span className="block text-xs text-foreground-muted">확인 시각 없음</span>
      )}
    </div>
  )
}

function passiveText(upstream: LlmUpstreamStatus, systemView: boolean) {
  const { passive } = upstream
  if (
    passive.lastAttemptAt == null &&
    passive.lastSuccessAt == null &&
    passive.lastFailureAt == null
  ) {
    return '실제 요청 기록 없음'
  }
  const failureIsLatest =
    passive.lastFailureAt != null &&
    (passive.lastSuccessAt == null ||
      new Date(passive.lastFailureAt).getTime() > new Date(passive.lastSuccessAt).getTime())
  const outcomeAt = failureIsLatest ? passive.lastFailureAt : passive.lastSuccessAt
  const coolingDown =
    passive.cooldownUntil != null && new Date(passive.cooldownUntil).getTime() > Date.now()
  return (
    <div>
      <span className="font-medium text-foreground-primary">
        {outcomeAt == null
          ? '가용성 판정 기록 없음'
          : failureIsLatest
            ? '최근 요청 실패'
            : '최근 요청 성공'}
      </span>
      {systemView && failureIsLatest && passive.lastFailureType && (
        <span className="block text-xs text-foreground-muted">
          {passive.lastFailureType}
          {passive.consecutiveFailures == null
            ? ''
            : ` · 연속 실패 ${count(passive.consecutiveFailures)}회`}
        </span>
      )}
      {coolingDown && passive.cooldownUntil && (
        <span className="block text-xs text-foreground-muted">
          라우팅 일시 제외 · {formatDateTime(passive.cooldownUntil)} KST까지
        </span>
      )}
      {outcomeAt && (
        <time dateTime={outcomeAt} className="block text-xs text-foreground-muted">
          {formatRelative(outcomeAt)} 판정
        </time>
      )}
      {passive.lastAttemptAt && (
        <time dateTime={passive.lastAttemptAt} className="block text-xs text-foreground-muted">
          {formatRelative(passive.lastAttemptAt)} 마지막 요청 시도
        </time>
      )}
    </div>
  )
}

function catalogText(upstream: LlmUpstreamStatus, systemView: boolean) {
  const { catalog } = upstream
  const mismatchCounts = [
    catalog.missingModelCount == null ? null : `누락 ${count(catalog.missingModelCount)}개`,
    catalog.unexpectedModelCount == null
      ? null
      : `추가 ${count(catalog.unexpectedModelCount)}개`,
  ].filter((value): value is string => value != null)
  return (
    <div>
      <span className="font-medium text-foreground-primary">{CATALOG_LABELS[catalog.status]}</span>
      {catalog.status === 'MISMATCH' && mismatchCounts.length > 0 && (
        <span className="block text-xs text-foreground-muted">
          {mismatchCounts.join(' · ')}
          {catalog.expectedModelCount != null ? ` / 예상 ${count(catalog.expectedModelCount)}개` : ''}
        </span>
      )}
      {systemView && catalog.missingPublicModels.length > 0 && (
        <span className="block max-w-56 truncate text-xs text-foreground-muted">
          {catalog.missingPublicModels.join(', ')}
        </span>
      )}
    </div>
  )
}

function GatewayNotice({
  status,
  systemView,
}: {
  status: AdminLlmStatus['gateway']
  systemView: boolean
}) {
  if (status.reportState === 'NOT_REPORTED') {
    return (
      <MessageBar
        title={
          systemView
            ? 'Gateway 보고를 받은 적이 없습니다'
            : '서비스 상태를 확인한 기록이 없습니다'
        }
      >
        연결 상태를 판단할 자료가 아직 없습니다. 등록되지 않은 상태와 장애 상태를 같은 것으로
        표시하지 않습니다.
      </MessageBar>
    )
  }
  if (status.reportState === 'STALE') {
    return (
      <MessageBar
        variant="warning"
        title={systemView ? 'Gateway 보고가 늦습니다' : '서비스 상태 확인이 늦습니다'}
      >
        아래 값은 마지막 보고 시점의 기록입니다. 마지막 연결은 {moment(status.lastContactAt)}입니다.
      </MessageBar>
    )
  }
  return null
}

function GatewaySummary({ data, systemView }: { data: AdminLlmStatus; systemView: boolean }) {
  const { gateway } = data
  return (
    <Card>
      <CardHeader className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{systemView ? 'LLM Gateway' : '요청 처리 연결'}</CardTitle>
          <p className="type-caption mt-1 text-foreground-muted">
            상태 응답 관측 {formatDateTime(data.observedAt)} KST
          </p>
        </div>
        <Badge variant={GATEWAY_REPORT_VARIANTS[gateway.reportState]}>
          {GATEWAY_REPORT_LABELS[gateway.reportState]}
        </Badge>
      </CardHeader>
      <CardContent>
        <DescriptionList
          columns={systemView ? 3 : 1}
          items={[
            {
              term: systemView ? '마지막 Gateway 연결' : '마지막 상태 보고',
              description: moment(gateway.lastContactAt),
            },
            {
              term: '사용량 전송 관측',
              description: QUEUE_REPORT_LABELS[gateway.usageQueueReportState],
            },
            ...(systemView
              ? [
                  { term: '설정 반영', description: generationText(gateway) },
                  { term: 'Agent', description: gateway.agentVersion ?? '확인되지 않음' },
                  {
                    term: '문서 지원 형식',
                    description:
                      gateway.supportedFormat == null
                        ? '지원 여부 미보고'
                        : `format ${gateway.supportedFormat}`,
                  },
                  { term: '시작 시각', description: moment(gateway.startedAt) },
                  {
                    term: '처리 중 요청',
                    description:
                      gateway.inFlight == null
                        ? '확인되지 않음'
                        : `${count(gateway.inFlight)}${gateway.maxInFlight == null ? '' : ` / ${count(gateway.maxInFlight)}`}`,
                  },
                ]
              : []),
          ]}
        />
        {systemView && gateway.lastError && (
          <MessageBar variant="warning" title="Gateway가 마지막으로 보고한 오류" className="mt-4">
            <span className="break-all">{gateway.lastError}</span>
          </MessageBar>
        )}
      </CardContent>
    </Card>
  )
}

function PipelineDiagnostics({ status }: { status: AdminLlmStatus['gateway'] }) {
  const queueObservationStale = status.usageQueueReportState !== 'FRESH'
  const queueBacklog =
    status.usageQueueObservedAt == null
      ? '확인되지 않음'
      : status.queuedUsageEvents == null || status.queuedUsageBytes == null
        ? '수치 미보고'
        : (
            <>
              {count(status.queuedUsageEvents)}건 · {formatBytes(status.queuedUsageBytes)}
              {queueObservationStale && (
                <span className="block text-xs text-foreground-muted">마지막 관측 기준</span>
              )}
            </>
          )
  return (
    <Card>
      <CardHeader>
        <CardTitle>사용량 전달 상태</CardTitle>
        <p className="type-caption mt-1 text-foreground-muted">
          게이트웨이가 스스로 보고한 값입니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <DescriptionList
          columns={3}
          items={[
            { term: '마지막 전송 성공', description: moment(status.lastUsageShipSuccessAt) },
            {
              term: '전송 대기',
              description: queueBacklog,
            },
            { term: '대기열 마지막 확인', description: moment(status.usageQueueObservedAt) },
            { term: '가장 오래된 미전송 기록', description: moment(status.oldestUnshippedEventAt) },
          ]}
        />
        {queueObservationStale && (
          <MessageBar variant="warning" title="전송 대기열을 지금 값으로 확인할 수 없습니다">
            {status.usageQueueReportState === 'STALE'
              ? '대기열을 마지막으로 확인한 지 오래됐습니다.'
              : '대기열을 확인한 기록이 없습니다.'}{' '}
            전송 대기가 0건으로 보여도 지금 비어 있다는 뜻은 아닙니다.
          </MessageBar>
        )}
        <DataTable caption="게이트웨이가 재시작된 뒤로 쌓인 진단 수치" captionVisible>
          <THead>
            <TR>
              <TH>스풀 기록 실패</TH>
              <TH>사용량 전송 실패</TH>
              <TH>Queue 확인 실패</TH>
              <TH>본문 수집 누락</TH>
              <TH>설정 항목 거부</TH>
              <TH>설정 다시 읽기 실패</TH>
            </TR>
          </THead>
          <TBody>
            <TR>
              <TD>{diagnosticCount(status.spoolWriteFailures)}</TD>
              <TD>{diagnosticCount(status.usageShipFailures)}</TD>
              <TD>{diagnosticCount(status.usageQueueScanFailures)}</TD>
              <TD>{diagnosticCount(status.bodiesDropped)}</TD>
              <TD>{diagnosticCount(status.rejectedEntries)}</TD>
              <TD>{diagnosticCount(status.reloadFailures)}</TD>
            </TR>
          </TBody>
        </DataTable>
      </CardContent>
    </Card>
  )
}

function UpstreamStatusTable({
  upstreams,
  systemView,
}: {
  upstreams: LlmUpstreamStatus[]
  systemView: boolean
}) {
  if (upstreams.length === 0) {
    return (
      <EmptyState
        title="표시할 LLM 서비스가 없습니다"
        description={
          systemView
            ? '등록되거나 Gateway가 보고한 upstream이 없습니다.'
            : '선택한 기관이 소유하거나 연결된 공용 서비스가 없습니다.'
        }
      />
    )
  }
  return (
    <DataTable caption={systemView ? 'LLM upstream 현재 상태' : 'LLM 서비스 현재 상태'} captionVisible>
      <THead>
        <TR>
          <TH>서비스</TH>
          <TH>{systemView ? '보고 상태' : '관측 상태'}</TH>
          <TH>가용성</TH>
          <TH>{systemView ? 'Active probe' : '자동 연결 확인'}</TH>
          <TH>{systemView ? 'Passive 요청' : '실제 요청'}</TH>
          <TH>{systemView ? 'Catalog' : '모델 목록'}</TH>
          <TH>마지막 보고</TH>
        </TR>
      </THead>
      <TBody>
        {upstreams.map((upstream, index) => (
          <TR key={upstream.id ?? upstream.ref ?? `${upstream.name}-${index}`}>
            <TD>
              <span className="font-medium text-foreground-primary">{upstream.name}</span>
              <span className="block text-xs text-foreground-muted">
                {upstreamKind(upstream.kind)}
                {upstream.enabled === false ? ' · 운영 중지' : ''}
                {!upstream.configured
                  ? systemView
                    ? ' · Gateway 미설정'
                    : ' · 연결되지 않음'
                  : ''}
              </span>
              {systemView && upstream.ref && (
                <code className="mt-1 block text-xs text-foreground-muted">{upstream.ref}</code>
              )}
            </TD>
            <TD>
              <Badge variant={REPORT_VARIANTS[upstream.reportState]}>
                {(systemView ? REPORT_LABELS : ORG_REPORT_LABELS)[upstream.reportState]}
              </Badge>
            </TD>
            <TD>
              <Badge variant={AVAILABILITY_VARIANTS[upstream.availability]}>
                {AVAILABILITY_LABELS[upstream.availability]}
              </Badge>
            </TD>
            <TD>{activeProbeText(upstream, systemView)}</TD>
            <TD>{passiveText(upstream, systemView)}</TD>
            <TD>{catalogText(upstream, systemView)}</TD>
            <TD>{moment(upstream.lastReportedAt)}</TD>
          </TR>
        ))}
      </TBody>
    </DataTable>
  )
}

function StatusView({ data, systemView }: { data: AdminLlmStatus; systemView: boolean }) {
  return (
    <div className="space-y-5">
      <GatewayNotice status={data.gateway} systemView={systemView} />
      <GatewaySummary data={data} systemView={systemView} />
      <section aria-labelledby="llm-upstreams-heading" className="space-y-3">
        <div>
          <h2 id="llm-upstreams-heading" className="type-section-title text-foreground-primary">
            연결된 서비스
          </h2>
          <p className="type-caption mt-1 text-foreground-muted">
            실제 요청 결과와 별도 연결 확인을 섞지 않고 각각 표시합니다.
          </p>
        </div>
        <UpstreamStatusTable upstreams={data.upstreams} systemView={systemView} />
      </section>
      {systemView && <PipelineDiagnostics status={data.gateway} />}
    </div>
  )
}

function latencyText(metric: LlmUpstreamMetric) {
  if (
    metric.latencySamples === 0 ||
    metric.latencyP50Ms == null ||
    metric.latencyP95Ms == null ||
    metric.latencyP99Ms == null
  ) {
    return '표본 없음'
  }
  return (
    <div className="whitespace-nowrap">
      p50 {count(metric.latencyP50Ms)} ms
      <span className="block text-xs text-foreground-muted">
        p95 {count(metric.latencyP95Ms)} · p99 {count(metric.latencyP99Ms)} ms
      </span>
      <span className="block text-xs text-foreground-muted">성공 {count(metric.latencySamples)}건</span>
    </div>
  )
}

function metricName(metric: LlmUpstreamMetric, systemView: boolean) {
  return (
    <div>
      <span className="font-medium text-foreground-primary">{metric.name}</span>
      {systemView && metric.ref && (
        <code className="mt-1 block text-xs text-foreground-muted">{metric.ref}</code>
      )}
    </div>
  )
}

const REJECTION_LABELS: Record<string, string> = {
  quota_exhausted: '일일 토큰 한도 초과',
  credit_exhausted: '금액 한도 소진',
  rate_limit_requests: '분당 요청 수 한도 초과',
  rate_limit_tokens: '분당 토큰 한도 초과',
  rate_limit_concurrency: '동시 요청 한도 초과',
  credit_unavailable: '유료 모델 연결 불가',
  server_busy: 'Gateway 처리 여유 부족',
}

function rejectionLabel(item: LlmLocalRejection, systemView: boolean): string {
  if (item.errorType === 'server_busy' && !systemView) return '서비스 처리 여유 부족'
  return REJECTION_LABELS[item.errorType] ?? '기타 로컬 거절'
}

function MetricsView({ data, systemView }: { data: AdminLlmMetrics; systemView: boolean }) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>집계 범위와 데이터 품질</CardTitle>
          <p className="type-caption mt-1 text-foreground-muted">
            지표를 해석할 때 함께 봐야 하는 범위 정보이며 성과 지표가 아닙니다.
          </p>
        </CardHeader>
        <CardContent>
          <DescriptionList
            columns={3}
            items={[
              {
                term: '집계 구간',
                description: `${metricRangeEndpoint(data.from)} ~ ${metricRangeEndpoint(data.to)}`,
              },
              {
                term: systemView ? '수신 event' : '수신 요청 기록',
                description: `${count(data.totalEvents)}건`,
              },
              {
                term: systemView ? 'Upstream 귀속 범위' : '처리 서비스 확인 범위',
                description: coverage(
                  data.attributionCoverage,
                  data.attributedEvents,
                  data.totalEvents,
                ),
              },
              {
                term: '시도 횟수 기록 범위',
                description: coverage(
                  data.attemptCoverage,
                  data.attemptsKnownEvents,
                  data.totalEvents,
                ),
              },
              {
                term: '추정 토큰 비율',
                description:
                  data.totalEvents === 0
                    ? '표본 없음'
                    : `${ratio(data.estimatedCoverage)} · ${count(data.estimatedEvents)}건`,
              },
            ]}
          />
        </CardContent>
      </Card>

      {data.totalEvents > 0 &&
        (data.attributionCoverage < 1 || data.attemptCoverage < 1 || data.estimatedCoverage > 0) && (
        <MessageBar variant="warning" title="일부 지표에는 해석 범위가 있습니다">
          {systemView
            ? '귀속되지 않은 event와 시도 횟수가 없는 event는 upstream·다중 시도 계산에서 빠집니다. 추정 토큰은 실제 사용량이 아니라 Gateway가 산정한 값입니다.'
            : '처리 서비스를 확인할 수 없거나 시도 횟수가 없는 요청 기록은 일부 계산에서 빠집니다. 추정 토큰은 실제 사용량이 아니라 시스템이 산정한 값입니다.'}
        </MessageBar>
      )}

      <MessageBar title="지표를 읽는 기준">
        {systemView
          ? 'Upstream별 수치는 요청을 마지막으로 처리한 서비스의 최종 결과입니다. 중간 시도의 서비스와 retry·fallback 경로는 현재 event만으로 구분할 수 없습니다.'
          : '서비스별 수치는 요청을 마지막으로 처리한 서비스의 최종 결과입니다. 중간 시도의 서비스와 재시도·다른 서비스 전환 과정은 현재 요청 기록만으로 구분할 수 없습니다.'}
      </MessageBar>

      {data.upstreams.length === 0 ? (
        <EmptyState
          title={systemView ? '집계할 upstream 요청이 없습니다' : '집계할 서비스 요청이 없습니다'}
          description={
            systemView
              ? '선택한 범위와 기간에 upstream까지 도달해 최종 처리된 요청이 없습니다.'
              : '선택한 범위와 기간에 서비스까지 도달해 최종 처리된 요청이 없습니다.'
          }
        />
      ) : (
        <DataTable
          caption={systemView ? 'Upstream별 최종 처리 결과 지표' : '서비스별 최종 처리 결과 지표'}
          captionVisible
        >
          <THead>
            <TR>
              <TH>서비스</TH>
              <TH>최종 처리 요청</TH>
              <TH>{systemView ? '최종 결과 timeout·upstream error' : '시간 초과·서비스 오류'}</TH>
              <TH>집계 구간 토큰</TH>
              <TH>2회 이상 시도</TH>
              <TH>{systemView ? '성공 요청 end-to-end 지연' : '성공 요청 응답 시간'}</TH>
            </TR>
          </THead>
          <TBody>
            {data.upstreams.map((metric, index) => (
              <TR key={metric.id ?? metric.ref ?? `${metric.name}-${index}`}>
                <TD>{metricName(metric, systemView)}</TD>
                <TD>
                  {count(metric.finalOutcomes)}건
                  <span className="block text-xs text-foreground-muted">
                    성공 {count(metric.succeeded)}건
                  </span>
                </TD>
                <TD>
                  {count(metric.timeoutOrError)}건
                  <span className="block text-xs text-foreground-muted">
                    최종 결과의 {ratio(metric.timeoutOrErrorRate)}
                  </span>
                </TD>
                <TD className="whitespace-nowrap">
                  입력 {count(metric.inputTokens)}
                  <span className="block text-xs text-foreground-muted">
                    출력 {count(metric.outputTokens)}
                  </span>
                </TD>
                <TD>
                  {metric.attemptsKnown === 0 ? (
                    '시도 횟수 표본 없음'
                  ) : (
                    <>
                      {count(metric.multiAttemptRequests)}건 · {ratio(metric.multiAttemptRate)}
                      <span className="block text-xs text-foreground-muted">
                        기록된 요청 평균 {metric.attemptAmplification.toFixed(2)}회 시도
                      </span>
                      <span className="block text-xs text-foreground-muted">
                        시도 횟수 표본 {count(metric.attemptsKnown)}건
                      </span>
                    </>
                  )}
                </TD>
                <TD>{latencyText(metric)}</TD>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}

      <section aria-labelledby="llm-local-rejections-heading" className="space-y-3">
        <div>
          <h2 id="llm-local-rejections-heading" className="type-section-title text-foreground-primary">
            {systemView ? 'Upstream' : '서비스'} 도달 전 거절
          </h2>
          <p className="type-caption mt-1 text-foreground-muted">
            사용자 한도와 {systemView ? 'Gateway' : '서비스'} 상태로 요청이 외부 서비스에 전달되기
            전에 끝난 건입니다.
          </p>
        </div>
        {data.localRejections.length === 0 ? (
          <EmptyState
            title="로컬 거절이 없습니다"
            description={
              systemView
                ? '선택한 범위와 기간에 upstream 도달 전 끝난 요청이 없습니다.'
                : '선택한 범위와 기간에 서비스 도달 전 끝난 요청이 없습니다.'
            }
          />
        ) : (
          <DataTable
            caption={systemView ? 'Upstream 도달 전 거절 사유' : '서비스 도달 전 거절 사유'}
            captionVisible
          >
            <THead>
              <TR>
                <TH>사유</TH>
                <TH>요청</TH>
              </TR>
            </THead>
            <TBody>
              {data.localRejections.map((item, index) => (
                <TR key={item.errorType ?? `unknown-${index}`}>
                  <TD>
                    <span className="font-medium text-foreground-primary">
                      {rejectionLabel(item, systemView)}
                    </span>
                    {systemView && item.errorType && (
                      <code className="block text-xs text-foreground-muted">{item.errorType}</code>
                    )}
                  </TD>
                  <TD>{count(item.requests)}건</TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
        )}
      </section>
    </div>
  )
}

export function AdminLlmStatusPage() {
  const { user } = useAuth()
  const { activeOrgId, activeOrg } = useAdminScope()
  const systemView = !!user && isSysTier(user.role)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'metrics' ? 'metrics' : 'status'
  const scopeKey = activeOrgId ?? null

  const status = useQuery({
    queryKey: ['admin', 'llm-status', { orgId: scopeKey }],
    queryFn: async () => ({
      scopeKey,
      value: await fetchAdminLlmStatus(activeOrgId),
    }),
    enabled: activeTab === 'status',
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
  const metrics = useQuery({
    queryKey: ['admin', 'llm-metrics', { orgId: scopeKey, days: 7 }],
    queryFn: async () => ({
      scopeKey,
      value: await fetchAdminLlmMetrics(activeOrgId, 7),
    }),
    enabled: activeTab === 'metrics',
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })

  // 기관 scope가 바뀐 순간에는 직전 응답을 한 프레임도 쓰지 않는다. Query key가
  // 데이터를 격리하고, 이 비교가 완료 직전 race와 향후 placeholderData 도입까지 막는다.
  const statusData = status.data?.scopeKey === scopeKey ? status.data.value : undefined
  const metricsData = metrics.data?.scopeKey === scopeKey ? metrics.data.value : undefined

  const activeQuery = activeTab === 'status' ? status : metrics

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="운영"
        title="LLM 서비스"
        description={
          systemView
            ? `${activeOrg?.name ?? '플랫폼 전체'}의 Gateway 보고, 연결 확인과 최종 처리 지표를 관측합니다.`
            : `${activeOrg?.name ?? '선택한 기관'}이 사용하는 LLM 서비스의 상태와 처리 결과를 확인합니다.`
        }
      />

      <MessageBar>
        이 화면은 관측 전용입니다. 서비스·모델 설정 변경이나 즉시 연결 확인 작업은 제공하지
        않습니다.
      </MessageBar>

      <Tabs
        aria-label="LLM 서비스 화면"
        tabs={SCREEN_TABS}
        value={activeTab}
        onChange={(id) => {
          const next = new URLSearchParams(searchParams)
          if (id === 'status') next.delete('tab')
          else next.set('tab', id)
          setSearchParams(next, { replace: true })
        }}
      />

      {activeQuery.isPending && <LoadingBlock label="LLM 서비스 정보 불러오는 중" />}
      {activeQuery.isError && (
        <MessageBar variant="danger">{activeQuery.error.message}</MessageBar>
      )}

      <TabPanel id="status" active={activeTab === 'status'}>
        {statusData && <StatusView data={statusData} systemView={systemView} />}
      </TabPanel>
      <TabPanel id="metrics" active={activeTab === 'metrics'}>
        {metricsData && <MetricsView data={metricsData} systemView={systemView} />}
      </TabPanel>
    </div>
  )
}
