import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchAdminNodeMetrics,
  type MetricsTimeframe,
  type NodeMetricPoint,
} from '../../api/queries'
import { Alert, Card, CardContent, CardHeader, CardTitle, Spinner } from '../ui'
import { formatByteRate, formatBytes, formatDateTime, formatPercent } from '../../lib/format'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'
import { TimeframeSwitcher } from '../metrics/TimeframeSwitcher'
import { timeframeAxisFormat, toEpochSeconds } from '../metrics/timeframe'

/** 1시간 구간만 폴링한다 (VM 사용량 화면과 같은 기준). */
const METRICS_POLL_MS = import.meta.env.MODE === 'test' ? 250 : 30_000

function pick(
  points: NodeMetricPoint[],
  key: keyof NodeMetricPoint,
  scale = 1,
): (number | null)[] {
  return points.map((point) => {
    const value = point[key]
    return typeof value === 'number' ? value * scale : null
  })
}

/**
 * 노드 사용량 시계열 — CPU·iowait, 메모리, 네트워크.
 * uPlot을 끌어오므로 노드 화면에서 지연 로드한다(기본 내보내기).
 */
export default function NodeMetricsSection({
  nodeId,
  nodeName,
}: {
  nodeId: number
  nodeName: string
}) {
  const [timeframe, setTimeframe] = useState<MetricsTimeframe>('HOUR')
  const metrics = useQuery({
    queryKey: ['admin', 'nodes', nodeId, 'metrics', timeframe],
    queryFn: () => fetchAdminNodeMetrics(nodeId, timeframe),
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
        <CardTitle>{nodeName} 사용량</CardTitle>
        <TimeframeSwitcher
          value={timeframe}
          onChange={setTimeframe}
          label={`${nodeName} 조회 구간`}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {metrics.isPending && (
          <div className="flex justify-center py-6">
            <Spinner label="노드 사용량 불러오는 중" />
          </div>
        )}
        {metrics.isError && !data && <Alert variant="danger">{metrics.error.message}</Alert>}
        {metrics.isError && data && (
          <Alert variant="warning">
            사용량 데이터를 일시적으로 불러오지 못했습니다. 마지막 갱신{' '}
            {formatDateTime(data.fetchedAt)} 기준으로 표시합니다.
          </Alert>
        )}

        {data && data.points.length === 0 && (
          <p className="py-2 text-sm text-neutral-500">
            아직 쌓인 사용량 데이터가 없습니다.
          </p>
        )}

        {data && data.points.length > 0 && (
          <>
            <p className="text-xs text-neutral-500">
              마지막 갱신 {formatDateTime(data.fetchedAt)} · 응답이 없던 구간은 비어
              있습니다.
            </p>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <TimeSeriesChart
                title="CPU"
                times={times}
                series={[
                  { label: 'CPU 사용률', data: pick(data.points, 'cpu', 100) },
                  { label: 'I/O 대기', data: pick(data.points, 'iowait', 100) },
                ]}
                format={formatPercent}
                formatTime={axisFormat}
                yMax={100}
                caption="노드 전체 스레드를 100%로 본 사용률입니다. I/O 대기가 높으면 저장장치가 병목입니다."
              />
              <TimeSeriesChart
                title="메모리"
                times={times}
                series={[
                  { label: '사용', data: pick(data.points, 'memUsedBytes') },
                  {
                    label: '전체',
                    data: pick(data.points, 'memTotalBytes'),
                    reference: true,
                  },
                ]}
                format={formatBytes}
                formatTime={axisFormat}
                splitBase="binary"
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
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
