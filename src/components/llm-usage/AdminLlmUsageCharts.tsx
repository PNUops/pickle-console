import type { LlmUsageDailyPoint } from '../../api/queries'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'
import { formatKstDay } from '../metrics/timeframe'

function dayEpochSeconds(day: string): number {
  return Math.round(new Date(`${day}T00:00:00+09:00`).getTime() / 1000)
}

function count(value: number): string {
  return Math.round(value).toLocaleString('ko-KR')
}

function DailyValuesTable({
  title,
  points,
  columns,
}: {
  title: string
  points: LlmUsageDailyPoint[]
  columns: { label: string; value: (point: LlmUsageDailyPoint) => number; suffix: string }[]
}) {
  return (
    <details className="rounded-panel border border-stroke-subtle bg-surface-subtle">
      <summary
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          const details = event.currentTarget.parentElement as HTMLDetailsElement
          details.open = !details.open
        }}
        className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        {title} 표
      </summary>
      <div className="overflow-x-auto border-t border-stroke-subtle">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="bg-surface-card">
              <th scope="col" className="border-b border-stroke-subtle px-3 py-2 text-left font-semibold">
                날짜 (KST)
              </th>
              {columns.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  className="border-b border-stroke-subtle px-3 py-2 text-right font-semibold"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stroke-subtle">
            {points.map((point) => (
              <tr key={point.day}>
                <th scope="row" className="px-3 py-2 text-left font-medium text-foreground-primary">
                  {point.day}
                </th>
                {columns.map((column) => (
                  <td key={column.label} className="px-3 py-2 text-right text-foreground-secondary">
                    {count(column.value(point))}{column.suffix}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

/** Administrator daily demand charts. This module owns the lazy uPlot import. */
export default function AdminLlmUsageCharts({
  points,
}: {
  points: LlmUsageDailyPoint[]
}) {
  const times = points.map((point) => dayEpochSeconds(point.day))
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div className="space-y-3">
        <TimeSeriesChart
          title="일별 요청 수"
          times={times}
          series={[{ label: '요청', data: points.map((point) => point.requests) }]}
          format={(value) => `${count(value)}건`}
          formatTime={formatKstDay}
          splitBase="integer"
          caption="선택 기간의 KST 달력일별 전체 요청입니다. 사용하지 않은 날은 0으로 표시합니다."
        />
        <DailyValuesTable
          title="날짜별 요청 수"
          points={points}
          columns={[{ label: '요청', value: (point) => point.requests, suffix: '건' }]}
        />
      </div>
      <div className="space-y-3">
        <TimeSeriesChart
          title="일별 입력·출력 token"
          times={times}
          series={[
            { label: '입력', data: points.map((point) => point.inputTokens) },
            { label: '출력', data: points.map((point) => point.outputTokens) },
          ]}
          format={(value) => `${count(value)} token`}
          formatTime={formatKstDay}
          splitBase="integer"
          caption="요청 당시 기록된 입력과 출력 token을 분리해 표시합니다."
        />
        <DailyValuesTable
          title="날짜별 입력·출력 token"
          points={points}
          columns={[
            { label: '입력 token', value: (point) => point.inputTokens, suffix: '' },
            { label: '출력 token', value: (point) => point.outputTokens, suffix: '' },
          ]}
        />
      </div>
    </div>
  )
}
