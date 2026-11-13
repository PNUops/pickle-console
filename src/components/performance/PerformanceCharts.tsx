import type { AdminLlmPerformance } from '../../api/queries'
import { DonutChart } from '../llm-usage/DonutChart'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'
import { CHART_SERIES_1, CHART_SERIES_2 } from '../metrics/chart-colors'
import { EmptyState } from '../ui'
import { TokenValue } from '../TokenValue'
import { formatTokenCompact, formatTokenExact, isExactTokenCount, UNKNOWN_TOKEN_VALUE } from '../../lib/token-presentation'

function count(value: number): string {
  return isExactTokenCount(value) ? `${value.toLocaleString('ko-KR')}건` : UNKNOWN_TOKEN_VALUE
}

function sum(values: number[]): number {
  let total = 0
  for (const value of values) {
    if (!isExactTokenCount(value) || !isExactTokenCount(total + value)) return Number.NaN
    total += value
  }
  return total
}

export default function PerformanceCharts({ data }: { data: AdminLlmPerformance }) {
  if (data.totals.requests === 0) return <EmptyState title="이 기간에는 LLM 요청이 없어요" />
  const times = data.trend.map((point) => Math.round(new Date(`${point.periodStart}T00:00:00+09:00`).getTime() / 1000))
  const daily = data.granularity === 'DAY'
  const date = new Intl.DateTimeFormat('ko-KR', { timeZone: data.timezone, year: 'numeric', month: 'long', ...(daily ? { day: 'numeric' } : {}) })
  const axisDate = new Intl.DateTimeFormat('ko-KR', { timeZone: data.timezone, month: 'numeric', ...(daily ? { day: 'numeric' } : { year: 'numeric' }) })
  const formatTime = (seconds: number) => date.format(new Date(seconds * 1000))
  const formatAxisTime = (seconds: number) => axisDate.formatToParts(new Date(seconds * 1000))
    .filter((part) => part.type !== 'literal').map((part) => part.value).join('.')
  const compact = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 })
  const modelSlices = data.models.slice(0, 4).map((model) => ({ label: model.publicModelName ?? '알 수 없는 모델', value: model.requests, residual: false }))
  const otherModels = sum([data.otherModelRequests, ...data.models.slice(4).map((model) => model.requests)])
  if (otherModels > 0) modelSlices.push({ label: '기타 모델', value: otherModels, residual: true })
  const modelTotal = sum(modelSlices.map((slice) => slice.value))
  const showConsumerRanking = data.consumers.level !== 'ORG'
  const consumerNoun = data.consumers.level === 'WORKSPACE' ? '워크스페이스' : '키'
  const maxConsumerRequests = Math.max(...data.consumers.items.map((row) => row.requests), 0)
  const periodTitle = daily ? '일별' : '월별'
  const panel = 'min-w-0 overflow-hidden rounded-2xl border border-stroke-subtle bg-surface-card p-5 shadow-sm sm:p-6'
  const inputRemainder = data.totals.inputTokens - data.totals.cachedInputTokens
  const outputRemainder = data.totals.outputTokens - data.totals.reasoningTokens
  const inputComposition = [data.totals.inputTokens, data.totals.cachedInputTokens, inputRemainder].every(isExactTokenCount)
  const outputComposition = [data.totals.outputTokens, data.totals.reasoningTokens, outputRemainder].every(isExactTokenCount)

  const showComposition = inputComposition || outputComposition

  return <section aria-label="LLM 이용 추이와 비중" className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
    <div className={`${panel} xl:col-span-2`}>
      <TimeSeriesChart title={daily ? '날짜별 요청 수' : '월별 요청 수'} times={times}
        series={[{ label: '요청', data: data.trend.map((point) => isExactTokenCount(point.requests) ? point.requests : null) }]}
        format={(value) => `${compact.format(value)}건`} formatDetail={count}
        formatTime={formatTime} formatAxisTime={formatAxisTime} splitBase="integer" height={260} />
    </div>
    <div className={panel}>
      <h2 className="mb-6 text-base font-semibold text-foreground-primary">모델별 요청 비중</h2>
      {isExactTokenCount(modelTotal) && isExactTokenCount(otherModels) ? <DonutChart title="모델별 요청 비중" slices={modelSlices} format={count} size={190} /> : <p className="text-sm text-foreground-muted">{UNKNOWN_TOKEN_VALUE}</p>}
    </div>
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-2 xl:col-span-3">
      {([
        { field: 'inputTokens', label: '입력', color: CHART_SERIES_1 },
        { field: 'outputTokens', label: '출력', color: CHART_SERIES_2 },
      ] as const).map(({ field, label, color }) => <div className={panel} key={field}>
        <TimeSeriesChart title={`${periodTitle} ${label} 토큰`} times={times}
          series={[{ label, color, data: data.trend.map((point) => isExactTokenCount(point[field]) ? point[field] : null) }]}
          format={formatTokenCompact} formatDetail={formatTokenExact}
          formatTime={formatTime} formatAxisTime={formatAxisTime} splitBase="integer" height={240} />
      </div>)}
    </div>
    {showConsumerRanking && <div className={`${panel} xl:col-span-3`}>
      <h2 className="mb-5 text-base font-semibold text-foreground-primary">요청이 많은 {consumerNoun}</h2>
      {data.consumers.items.length === 0 ? <p className="text-sm text-foreground-muted">이용 기록이 없어요.</p> : <ol className="grid gap-x-10 gap-y-4 lg:grid-cols-2">
        {data.consumers.items.map((row, index) => <li key={row.id} className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${index === 0 ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-foreground-muted'}`}>{index + 1}</span>
          <div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm"><span className="min-w-0 font-medium text-foreground-primary [overflow-wrap:anywhere]">{row.name}</span><span className="shrink-0 text-foreground-muted">{count(row.requests)}</span></div>
            {isExactTokenCount(row.requests) && isExactTokenCount(maxConsumerRequests) && maxConsumerRequests > 0 && <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-50"><div className="h-full rounded-full bg-primary-500" style={{ width: `${row.requests / maxConsumerRequests * 100}%` }} /></div>}
          </div>
        </li>)}
      </ol>}
    </div>}
    {showComposition && <div className={`${panel} xl:col-span-3`}>
      <h2 className="mb-5 text-base font-semibold text-foreground-primary">토큰 사용 내역</h2>
      <div className="grid gap-8 lg:grid-cols-2">
        {inputComposition && <div className="space-y-4"><h3 className="text-sm font-semibold text-foreground-secondary">입력 토큰</h3><DonutChart title="입력 토큰 구성" slices={[{ label: '캐시에서 읽은 입력', value: data.totals.cachedInputTokens }, { label: '일반 입력', value: inputRemainder }]} format={formatTokenExact} renderValue={(value) => <TokenValue value={value} />} size={160} /></div>}
        {outputComposition && <div className="space-y-4"><h3 className="text-sm font-semibold text-foreground-secondary">출력 토큰</h3><DonutChart title="출력 토큰 구성" slices={[{ label: '추론에 사용한 출력', value: data.totals.reasoningTokens }, { label: '일반 출력', value: outputRemainder }]} format={formatTokenExact} renderValue={(value) => <TokenValue value={value} />} size={160} /></div>}
      </div>
    </div>}
  </section>
}
