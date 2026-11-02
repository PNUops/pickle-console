import { useState } from 'react'
import type { AdminLlmCapacity, InferenceDevice } from '../../api/queries'
import { formatDateTimeSeconds } from '../../lib/format'
import { formatTokenStatisticCompact } from '../../lib/token-presentation'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'
import { Card, CardContent, CardHeader, CardTitle, DescriptionList, EmptyState, MessageBar, Select } from '../ui'

type Point = InferenceDevice['series'][number]
type Engine = Point['engines'][number]
type Metric = Point['host'][string]
type Kind = 'host' | 'gauges' | 'rates' | 'histogramMeans'
type MetricChoice = { kind: Kind; key: string }

const HOST: Record<string, { label: string; unit: string }> = {
  cpu_load1: { label: 'CPU 1분 load average', unit: 'load' },
  memory_total_bytes: { label: '시스템 통합 메모리 전체', unit: 'bytes' },
  memory_available_bytes: { label: '시스템 통합 메모리 사용 가능', unit: 'bytes' },
  swap_used_bytes: { label: '사용 중인 스왑', unit: 'bytes' },
  gpu_memory_total_bytes: { label: 'GPU 메모리 보고값', unit: 'bytes' },
  gpu_utilization_percent: { label: 'GPU 활성도', unit: 'percent' },
  gpu_temperature_celsius: { label: 'GPU 온도', unit: 'celsius' },
  gpu_power_watts: { label: 'GPU 전력', unit: 'watts' },
  gpu_power_limit_watts: { label: 'GPU 전력 상한 보고값', unit: 'watts' },
}
const ENGINE: Record<string, { label: string; unit: string }> = {
  num_requests_running: { label: '실행 중인 요청', unit: 'requests' },
  num_requests_waiting: { label: '대기 요청', unit: 'requests' },
  num_requests_waiting_by_reason: { label: '원인별 대기 요청', unit: 'requests' },
  engine_sleep_state: { label: '엔진 수면 상태 값', unit: 'state' },
  kv_cache_usage_perc: { label: 'KV 캐시 사용 비율', unit: 'ratio' },
  prompt_tokens_total: { label: '입력 토큰', unit: 'tokens' },
  generation_tokens_total: { label: '출력 토큰', unit: 'tokens' },
  prompt_tokens_cached_total: { label: '캐시된 입력 토큰', unit: 'tokens' },
  prefix_cache_queries_total: { label: '접두 캐시 조회 토큰', unit: 'tokens' },
  prefix_cache_hits_total: { label: '접두 캐시 적중 토큰', unit: 'tokens' },
  external_prefix_cache_queries_total: { label: '외부 접두 캐시 조회 토큰', unit: 'tokens' },
  external_prefix_cache_hits_total: { label: '외부 접두 캐시 적중 토큰', unit: 'tokens' },
  num_preemptions_total: { label: '선점', unit: 'preemptions' },
  mm_cache_queries_total: { label: '멀티모달 캐시 조회', unit: 'items' },
  mm_cache_hits_total: { label: '멀티모달 캐시 적중', unit: 'items' },
  request_success_total: { label: '종료된 요청', unit: 'requests' },
  prompt_tokens_by_source_total: { label: '출처별 입력 토큰', unit: 'tokens' },
  time_to_first_token_seconds: { label: '첫 토큰 지연 (TTFT)', unit: 'seconds' },
  inter_token_latency_seconds: { label: '엔진 출력 간격', unit: 'seconds' },
  request_time_per_output_token_seconds: { label: '요청별 출력 토큰 시간 (TPOT)', unit: 'seconds' },
  e2e_request_latency_seconds: { label: '엔진 요청 전체 시간', unit: 'seconds' },
  request_queue_time_seconds: { label: '엔진 대기 시간', unit: 'seconds' },
  request_inference_time_seconds: { label: '엔진 추론 시간', unit: 'seconds' },
  request_prefill_time_seconds: { label: 'Prefill 시간', unit: 'seconds' },
  request_decode_time_seconds: { label: 'Decode 시간', unit: 'seconds' },
  request_prompt_tokens: { label: '요청 입력 길이', unit: 'tokens' },
  request_generation_tokens: { label: '요청 출력 길이', unit: 'tokens' },
  iteration_tokens_total: { label: '반복별 토큰', unit: 'tokens' },
  request_max_num_generation_tokens: { label: '요청 최대 생성 토큰 보고값', unit: 'tokens' },
  request_params_max_tokens: { label: '요청 설정 출력 상한', unit: 'tokens' },
  request_prefill_kv_computed_tokens: { label: 'Prefill 계산 토큰', unit: 'tokens' },
  request_params_n: { label: '요청 시퀀스 수', unit: 'sequences' },
}

function count(value: number | null | undefined) { return value == null ? '미확인' : value.toLocaleString('ko-KR') }
function number(value: number, precise = false) {
  if (precise) return value.toLocaleString('ko-KR', { maximumSignificantDigits: 17 })
  const text = value.toLocaleString('ko-KR', { maximumFractionDigits: 6 })
  return value !== 0 && Number(text.replaceAll(',', '')) === 0 ? value.toExponential(2) : text
}
function at(value: string | null | undefined): string {
  if (!value) return '관측 기록 없음'
  const fraction = value.match(/T\d{2}:\d{2}:\d{2}(\.\d+)/)?.[1] ?? ''
  return `${formatDateTimeSeconds(value)}${/^\.0+$/.test(fraction) ? '' : fraction} KST`
}
function metricInfo(choice: MetricChoice) {
  if (choice.kind === 'host') return HOST[choice.key] ?? { label: choice.key, unit: '' }
  const base = choice.key.split('{')[0].replace(/^vllm:/, '')
  const definition = ENGINE[base] ?? { label: base, unit: '' }
  const dimensions = choice.key.includes('{') ? ` ${choice.key.slice(choice.key.indexOf('{'))}` : ''
  return { ...definition, label: `${definition.label}${dimensions}${choice.kind === 'rates' ? ' /초' : ''}` }
}
function formatted(value: number, choice: MetricChoice, precise = false) {
  const { unit } = metricInfo(choice)
  const suffix = choice.kind === 'rates' ? '/초' : ''
  if (unit === 'bytes') return `${number(value / 1024 ** 3, precise)} GiB`
  if (unit === 'percent') return `${number(value, precise)}%`
  if (unit === 'ratio') return `${number(value * 100, precise)}%`
  if (unit === 'celsius') return `${number(value, precise)}°C`
  if (unit === 'watts') return `${number(value, precise)} W`
  if (unit === 'seconds') return `${number(value * 1000, precise)} ms`
  if (unit === 'tokens' && !precise) return `${formatTokenStatisticCompact(value)} 토큰${suffix}`
  const units: Record<string, string> = { requests: '건', tokens: '토큰', preemptions: '회', items: '항목', sequences: '시퀀스' }
  return `${number(value, precise)}${units[unit] ? ` ${units[unit]}` : ''}${suffix}`
}
function engineKey(value: Engine) {
  return JSON.stringify([value.modelName, value.engineId, value.epoch, value.bootId, value.processId, value.configId])
}

function MetricChart({ points, metrics, choice, intervalStates }: {
  points: Point[]; metrics: (Metric | undefined)[]; choice: MetricChoice; intervalStates?: (Engine['intervalState'] | undefined)[]
}) {
  const info = metricInfo(choice)
  const interval = choice.kind === 'rates' || choice.kind === 'histogramMeans'
  const values = (field: 'mean' | 'min' | 'max') => points.map((point, index) => {
    const metric = metrics[index]
    // Explicit metric sample times can land in a bucket without snapshot rows.
    if (point.retentionState === 'OUTSIDE' || metric?.state !== 'OBSERVED' || metric.observedSamples <= 0) return null
    if (interval && intervalStates?.[index] !== 'VALID' && intervalStates?.[index] !== 'PARTIAL') return null
    const value = metric[field]
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  })
  const names = choice.kind === 'histogramMeans' ? ['구간 평균', '구간 평균 최소', '구간 평균 최대']
    : choice.kind === 'rates' ? ['구간율 평균', '구간율 최소', '구간율 최대'] : ['관측 평균', '표본 최소', '표본 최대']
  const states = new Set(metrics.filter((x) => x != null).map((x) => x.state))
  const windowMillis = points.length ? Date.parse(points.at(-1)!.to) - Date.parse(points[0].from) : 0
  return <div className="space-y-2">
    {states.size === 1 && states.has('UNSUPPORTED') && <MessageBar>지원하지 않는 지표입니다.</MessageBar>}
    {states.has('SOURCE_FAILED') && <MessageBar variant="warning">일부 관측에 실패했습니다.</MessageBar>}
    {(states.has('UNKNOWN') || states.has('NOT_REPORTED')) && <MessageBar>보고되지 않은 값이 있습니다.</MessageBar>}
    <TimeSeriesChart title={`${choice.kind === 'host' ? '장비 관측' : '엔진 관측'}: ${info.label}`}
      times={points.map((p) => Date.parse(p.from) / 1000)}
      series={(['mean', 'min', 'max'] as const).map((key, index) => ({ label: names[index], data: values(key) }))}
      format={(value) => formatted(value, choice)} formatDetail={(value) => formatted(value, choice, true)}
      formatTime={(value) => at(new Date(value * 1000).toISOString())}
      formatAxisTime={(value) => { const text = new Date(value * 1000 + 9 * 3600_000).toISOString(); return windowMillis <= 300_000 ? text.slice(11, 19) : windowMillis <= 86400_000 ? text.slice(11, 16) : text.slice(5, 10) }}
      />
  </div>
}

function DeviceHistory({ device, previousWindow }: { device: InferenceDevice; previousWindow: boolean }) {
  const points = device.series
  const hostKeys = [...new Set(points.flatMap((p) => Object.keys(p.host)))].sort()
  const [hostChoice, setHostChoice] = useState('gpu_utilization_percent')
  const hostMetric = hostKeys.includes(hostChoice) ? hostChoice : hostKeys[0]
  const identities = new Map<string, Engine>()
  for (const point of points) for (const engine of point.engines) identities.set(engineKey(engine), engine)
  const groups = [...identities.entries()]
  const [engineChoice, setEngineChoice] = useState('')
  const selectedGroup = identities.has(engineChoice) ? engineChoice : groups[0]?.[0]
  const selected = selectedGroup ? identities.get(selectedGroup) : undefined
  const enginePoints = points.map((p) => p.engines.find((e) => engineKey(e) === selectedGroup))
  const metricChoices = [...new Set(enginePoints.flatMap((e) => e ? (['gauges', 'rates', 'histogramMeans'] as const).flatMap((kind) => Object.keys(e[kind]).map((key) => JSON.stringify([kind, key]))) : []))].map((key) => {
    const [kind, metric] = JSON.parse(key) as [Kind, string]
    return { kind, key: metric }
  })
  const [engineMetricChoice, setEngineMetricChoice] = useState('')
  const choiceId = (choice: MetricChoice) => JSON.stringify([choice.kind, choice.key])
  const engineMetric = metricChoices.find((choice) => choiceId(choice) === engineMetricChoice) ?? metricChoices[0]
  const evidence = device.evidence
  return <div className="space-y-4">
    {previousWindow && <MessageBar variant="warning">이전 조회 기간의 장비 이력입니다.</MessageBar>}
    <DescriptionList columns={3} items={[
      { term: '관측 원천 연결', description: device.upstreamName ?? '이름 미보고' },
      { term: '관측 원천 ID', description: <span className="break-all">{device.sourceId}</span> },
      { term: '장비 응답 기간', description: `${at(device.from)} 이상 ~ ${at(device.to)} 미만` },
      { term: '표본 주기 / 보존 설정', description: `${count(device.sampleIntervalSeconds)}초 / ${count(device.retentionDays)}일` },
      { term: '장비 집계 간격', description: `${count(device.bucketSeconds)}초` },
      { term: '장비 이력 보존 경계', description: at(evidence.retainedFrom) },
      { term: '실제 표본 / 예상 주기 수', description: `${count(evidence.samplesInWindow)} / ${count(evidence.expectedSamples)}` },
      { term: '최신 원천 관측', description: at(evidence.latestObservedAt) },
      { term: '최신 API 수신', description: at(evidence.latestReceivedAt) },
      { term: '실패 / baseline / reset / gap', description: [evidence.failedSamples, evidence.baselineIntervals, evidence.resetIntervals, evidence.gapIntervals].map(count).join(' / ') },
    ]} />
    {evidence.freshness === 'STALE' && <MessageBar variant="warning">장비 보고가 지연되고 있습니다.</MessageBar>}
    {evidence.freshness === 'NOT_REPORTED' && <MessageBar>장비 보고 시각이 없습니다.</MessageBar>}
    {evidence.gapIntervals != null && evidence.gapIntervals > 0 && <MessageBar>보고가 끊긴 구간이 있습니다.</MessageBar>}
    {evidence.retentionState === 'OUTSIDE' ? <MessageBar variant="warning">조회 기간이 보존 범위 밖입니다.</MessageBar> : <>
      {evidence.retentionState === 'PARTIAL' && <MessageBar variant="warning">조회 기간 일부의 이력이 없습니다.</MessageBar>}
      {evidence.truncated && <MessageBar variant="warning">일부 모델·엔진만 표시합니다.</MessageBar>}
      {hostMetric ? <div className="space-y-3">
        <label className="block min-w-0 text-sm">장비 관측 지표<Select aria-label="장비 관측 지표" value={hostMetric} onChange={(event) => setHostChoice(event.target.value)}>{hostKeys.map((key) => <option key={key} value={key}>{metricInfo({ kind: 'host', key }).label}</option>)}</Select></label>
        <MetricChart key={`host:${hostMetric}`} points={points} metrics={points.map((p) => p.host[hostMetric])} choice={{ kind: 'host', key: hostMetric }} />
      </div> : <EmptyState title="조회 기간의 이력이 없습니다." />}
      {selected && engineMetric && <div className="space-y-3 border-t border-stroke-subtle pt-4">
        <label className="block min-w-0 text-sm">관측 모델·엔진<Select aria-label="관측 모델·엔진" value={selectedGroup} onChange={(event) => setEngineChoice(event.target.value)}>{groups.map(([key, engine], index) => <option key={key} value={key}>{engine.modelName} · 엔진 {engine.engineId} · 구성 {engine.configId ?? '미보고'} · 구분 {index + 1}</option>)}</Select></label>
        <DescriptionList columns={2} items={[
          { term: '모델 / 엔진', description: <span className="break-all">{selected.modelName} / {selected.engineId}</span> },
          { term: '수집 구분', description: <span className="break-all">{selected.epoch}</span> },
          { term: '부팅 / 프로세스', description: <span className="break-all">{selected.bootId ?? '미보고'} / {selected.processId ?? '미보고'}</span> },
          { term: '구성 구분', description: <span className="break-all">{selected.configId ?? '미보고'}</span> },
          { term: '선택 구분의 유효 / 기준 / reset / gap 구간', description: (['validIntervals', 'baselineIntervals', 'resetIntervals', 'gapIntervals'] as const).map((key) => count(enginePoints.reduce((sum, engine) => sum + (engine?.[key] ?? 0), 0))).join(' / ') },
        ]} />
        {enginePoints.some((engine) => engine?.intervalState === 'PARTIAL') && <MessageBar variant="warning">일부 지표만 확인할 수 있습니다.</MessageBar>}
        <label className="block min-w-0 text-sm">엔진 관측 지표<Select aria-label="엔진 관측 지표" value={choiceId(engineMetric)} onChange={(event) => setEngineMetricChoice(event.target.value)}>{metricChoices.map((choice) => <option key={choiceId(choice)} value={choiceId(choice)}>{metricInfo(choice).label}{choice.kind === 'histogramMeans' ? ' · 구간 분포 평균' : ''}</option>)}</Select></label>
        <MetricChart key={JSON.stringify([selectedGroup, engineMetric.kind, engineMetric.key])} points={points} metrics={enginePoints.map((e) => e?.[engineMetric.kind === 'host' ? 'gauges' : engineMetric.kind][engineMetric.key])} choice={engineMetric} intervalStates={enginePoints.map((e) => e?.intervalState)} />
      </div>}
    </>}
  </div>
}

export function InferenceTelemetryView({ telemetry, from, to, previousWindow, requestedSourceId }: {
  telemetry: AdminLlmCapacity['telemetry']; from: string; to: string; previousWindow: boolean; requestedSourceId?: string
}) {
  const device = telemetry.device
  const sameWindow = device && Date.parse(device.from) === Date.parse(from) && Date.parse(device.to) === Date.parse(to)
  const sameSource = !requestedSourceId || device?.sourceId.toLowerCase() === requestedSourceId.toLowerCase()
  return <Card>
    <CardHeader><CardTitle>장비 전체와 추론 관측</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {telemetry.status === 'NOT_CONFIGURED' ? <MessageBar>장비 수집이 구성되지 않았습니다.</MessageBar>
        : telemetry.status === 'NOT_PROVIDED' ? <MessageBar>장비·추론 관측이 제공되지 않습니다.</MessageBar>
          : !device ? <MessageBar>보고된 장비·추론 표본이 없습니다.</MessageBar>
            : !sameSource ? <MessageBar variant="warning">선택한 관측 원천과 다릅니다.</MessageBar>
              : !sameWindow ? <MessageBar variant="warning">장비 이력의 응답 기간이 다릅니다.</MessageBar>
              : <DeviceHistory key={device.sourceId} device={device} previousWindow={previousWindow} />}
    </CardContent>
  </Card>
}
