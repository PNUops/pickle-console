import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchVmMetrics,
  type MetricsTimeframe,
  type VmMetricPoint,
} from '../../api/queries'
import { Alert, Card, CardContent, CardHeader, CardTitle, Spinner } from '../ui'
import { formatByteRate, formatBytes, formatDateTime, formatPercent } from '../../lib/format'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'
import { TimeframeSwitcher } from '../metrics/TimeframeSwitcher'
import { timeframeAxisFormat, toEpochSeconds } from '../metrics/timeframe'

/**
 * 1시간 구간만 폴링한다 — 그보다 긴 구간은 한 점이 수 분~수 시간이라 자주 다시
 * 받아도 그림이 달라지지 않는다. (테스트에서는 빠르게 돌려 갱신을 관찰한다.)
 */
const METRICS_POLL_MS = import.meta.env.MODE === 'test' ? 250 : 30_000

/** 계열 값 추출기 — null(자료 없는 구간)은 그대로 통과시켜 빈 구간으로 남긴다. */
function pick(
  points: VmMetricPoint[],
  key: keyof VmMetricPoint,
  scale = 1,
): (number | null)[] {
  return points.map((point) => {
    const value = point[key]
    return typeof value === 'number' ? value * scale : null
  })
}

/**
 * VM 사용량 탭 본문 — CPU·메모리·네트워크·디스크 I/O 시계열.
 * uPlot을 끌어오므로 상세 화면에서 지연 로드한다(기본 내보내기).
 */
export default function VmMonitoringSection({ vmId }: { vmId: number }) {
  const [timeframe, setTimeframe] = useState<MetricsTimeframe>('HOUR')
  const metrics = useQuery({
    // ['vms'] 무효화(전원 제어 등)에 함께 걸리도록 vms 하위 키를 쓴다.
    queryKey: ['vms', vmId, 'metrics', timeframe],
    queryFn: () => fetchVmMetrics(vmId, timeframe),
    // 구간을 바꾸는 동안 이전 그림을 유지한다 — 빈 화면으로 깜빡이지 않게.
    placeholderData: keepPreviousData,
    refetchInterval: timeframe === 'HOUR' ? METRICS_POLL_MS : false,
  })

  const data = metrics.data
  // 축 라벨은 화면에 그려진 자료의 구간을 따른다 — 구간을 바꾼 직후(또는 새 구간
  // 조회가 실패해 이전 자료가 남아 있을 때) 선택값을 따르면 라벨이 자료와 어긋난다.
  const axisFormat = timeframeAxisFormat(
    (data?.timeframe as MetricsTimeframe | undefined) ?? timeframe,
  )
  const times = data ? data.points.map((point) => toEpochSeconds(point.time)) : []

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>사용량</CardTitle>
        <TimeframeSwitcher value={timeframe} onChange={setTimeframe} />
      </CardHeader>
      <CardContent className="space-y-4">
        {metrics.isPending && (
          <div className="flex justify-center py-6">
            <Spinner label="사용량 불러오는 중" />
          </div>
        )}

        {/* 첫 조회가 실패하면 안내만, 이미 받아 둔 그림이 있으면 경고와 함께 유지한다. */}
        {metrics.isError && !data && <Alert variant="danger">{metrics.error.message}</Alert>}
        {metrics.isError && data && (
          <Alert variant="warning">
            사용량 데이터를 일시적으로 불러오지 못했습니다. 마지막 갱신{' '}
            {formatDateTime(data.fetchedAt)} 기준으로 표시합니다.
          </Alert>
        )}

        {data && !data.available && (
          <Alert variant="info">VM이 준비되면 사용량 데이터가 표시됩니다.</Alert>
        )}

        {data && data.available && data.points.length === 0 && (
          <p className="py-2 text-sm text-neutral-500">
            아직 쌓인 사용량 데이터가 없습니다. 잠시 후 다시 확인해 주세요.
          </p>
        )}

        {data && data.available && data.points.length > 0 && (
          <>
            <p className="text-xs text-neutral-500">
              마지막 갱신 {formatDateTime(data.fetchedAt)} · 중지된 동안의 구간은 비어
              있습니다.
            </p>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <TimeSeriesChart
                title="CPU"
                times={times}
                series={[{ label: 'CPU 사용률', data: pick(data.points, 'cpu', 100) }]}
                format={formatPercent}
                formatTime={axisFormat}
                yMax={100}
                caption="할당된 vCPU 전체를 100%로 본 사용률입니다."
              />
              <TimeSeriesChart
                title="메모리"
                times={times}
                series={[
                  { label: '사용', data: pick(data.points, 'memBytes') },
                  {
                    label: '최대',
                    data: pick(data.points, 'maxmemBytes'),
                    reference: true,
                  },
                ]}
                format={formatBytes}
                formatTime={axisFormat}
                splitBase="binary"
                caption="게스트 에이전트가 보고한 내부 사용량 기준이며, 에이전트가 없으면 하이퍼바이저 관점 값으로 표시됩니다."
              />
              <TimeSeriesChart
                title="네트워크"
                times={times}
                series={[
                  { label: '수신', data: pick(data.points, 'netinBps') },
                  { label: '송신', data: pick(data.points, 'netoutBps') },
                ]}
                format={formatByteRate}
                formatTime={axisFormat}
                splitBase="binary"
              />
              <TimeSeriesChart
                title="디스크 I/O"
                times={times}
                series={[
                  { label: '읽기', data: pick(data.points, 'diskReadBps') },
                  { label: '쓰기', data: pick(data.points, 'diskWriteBps') },
                ]}
                format={formatByteRate}
                formatTime={axisFormat}
                splitBase="binary"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
