import type { AdminLlmPerformance } from '../../api/queries'
import { DonutChart } from '../llm-usage/DonutChart'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'
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
  if (data.totals.requests === 0) return <EmptyState title="선택 기간에 기록된 LLM 요청이 없어요" />
  const times = data.trend.map((point) => Math.round(new Date(`${point.periodStart}T00:00:00+09:00`).getTime() / 1000))
  const date = new Intl.DateTimeFormat('ko-KR', { timeZone: data.timezone, year: 'numeric', month: 'short', ...(data.granularity === 'DAY' ? { day: 'numeric' } : {}) })
  const formatTime = (seconds: number) => date.format(new Date(seconds * 1000))
  const compact = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 })
  const modelSlices = data.models.slice(0, 4).map((model) => ({ label: model.publicModelName ?? '모델 미상', value: model.requests, residual: false }))
  const otherModels = sum([data.otherModelRequests, ...data.models.slice(4).map((model) => model.requests)])
  if (otherModels > 0) modelSlices.push({ label: '기타 모델', value: otherModels, residual: true })
  const modelTotal = sum(modelSlices.map((slice) => slice.value))
  const consumerNoun = data.consumers.level === 'ORG' ? '기관' : data.consumers.level === 'WORKSPACE' ? '워크스페이스' : '키'
  const maxConsumerRequests = Math.max(...data.consumers.items.map((row) => row.requests), 0)
  const periodTitle = data.granularity === 'MONTH' ? '월별' : '일별'
  const panel = 'min-w-0 overflow-hidden rounded-2xl border border-stroke-subtle bg-surface-card p-5 shadow-sm sm:p-6'
  const inputRemainder = data.totals.inputTokens - data.totals.cachedInputTokens
  const outputRemainder = data.totals.outputTokens - data.totals.reasoningTokens
  const inputComposition = [data.totals.inputTokens, data.totals.cachedInputTokens, inputRemainder].every(isExactTokenCount)
  const outputComposition = [data.totals.outputTokens, data.totals.reasoningTokens, outputRemainder].every(isExactTokenCount)

  return <section aria-label="활용 추이와 분포" className="grid grid-cols-1 gap-5 xl:grid-cols-3">
    <div className={`${panel} xl:col-span-2`}>
      <TimeSeriesChart title={`${periodTitle} LLM 요청`} times={times}
        series={[{ label: '요청', data: data.trend.map((point) => isExactTokenCount(point.requests) ? point.requests : null) }]}
        format={(value) => `${compact.format(value)}건`} formatDetail={count}
        formatTime={formatTime} splitBase="integer" height={260} />
    </div>
    <div className={panel}>
      <h2 className="mb-6 text-base font-semibold text-foreground-primary">모델별 요청 비중</h2>
      {isExactTokenCount(modelTotal) && isExactTokenCount(otherModels) ? <DonutChart title="모델별 요청 비중" slices={modelSlices} format={count} size={190} /> : <p className="text-sm text-foreground-muted">{UNKNOWN_TOKEN_VALUE}</p>}
    </div>
    <div className={`${panel} xl:col-span-2`}>
      <TimeSeriesChart title={`${periodTitle} 토큰 활용`} times={times}
        series={[
          { label: '입력', data: data.trend.map((point) => isExactTokenCount(point.inputTokens) ? point.inputTokens : null) },
          { label: '출력', data: data.trend.map((point) => isExactTokenCount(point.outputTokens) ? point.outputTokens : null) },
        ]}
        format={formatTokenCompact} formatDetail={formatTokenExact}
        formatTime={formatTime} splitBase="integer" height={240} />
    </div>
    <div className={panel}>
      <h2 className="mb-5 text-base font-semibold text-foreground-primary">요청이 많은 {consumerNoun}</h2>
      {data.consumers.items.length === 0 ? <p className="text-sm text-foreground-muted">표시할 이용 내역이 없어요.</p> : <ol className="space-y-4">
        {data.consumers.items.map((row, index) => <li key={row.id} className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${index === 0 ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-foreground-muted'}`}>{index + 1}</span>
          <div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm"><span className="min-w-0 font-medium text-foreground-primary [overflow-wrap:anywhere]">{row.name}</span><span className="shrink-0 text-foreground-muted">{count(row.requests)}</span></div>
            {isExactTokenCount(row.requests) && isExactTokenCount(maxConsumerRequests) && maxConsumerRequests > 0 && <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-50"><div className="h-full rounded-full bg-primary-500" style={{ width: `${row.requests / maxConsumerRequests * 100}%` }} /></div>}
          </div>
        </li>)}
      </ol>}
    </div>
    {(inputComposition || outputComposition) && <div className={`${panel} xl:col-span-3`}>
      <h2 className="mb-5 text-base font-semibold text-foreground-primary">토큰 구성</h2>
      <div className="grid gap-8 lg:grid-cols-2">
        {inputComposition && <div className="space-y-4"><h3 className="text-sm font-semibold text-foreground-secondary">입력 토큰</h3><DonutChart title="입력 토큰 구성" slices={[{ label: '캐시 입력', value: data.totals.cachedInputTokens }, { label: '일반 입력', value: inputRemainder }]} format={formatTokenExact} renderValue={(value) => <TokenValue value={value} />} size={160} /></div>}
        {outputComposition && <div className="space-y-4"><h3 className="text-sm font-semibold text-foreground-secondary">출력 토큰</h3><DonutChart title="출력 토큰 구성" slices={[{ label: '추론 출력', value: data.totals.reasoningTokens }, { label: '일반 출력', value: outputRemainder }]} format={formatTokenExact} renderValue={(value) => <TokenValue value={value} />} size={160} /></div>}
      </div>
    </div>}
  </section>
}
