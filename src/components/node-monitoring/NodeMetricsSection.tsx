import {
  fetchAdminNodeMetrics,
  type MetricsTimeframe,
  type NodeMetricPoint,
  type NodeMetrics,
} from '../../api/queries'
import { formatByteRate, formatBytes, formatPercent } from '../../lib/format'
import { MetricsPanel } from '../metrics/MetricsPanel'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'

/** 계열 값 추출기 — null(응답이 없던 구간)은 그대로 통과시켜 빈 구간으로 남긴다. */
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
  return (
    <MetricsPanel<NodeMetrics>
      title={`${nodeName} 사용량`}
      switcherLabel={`${nodeName} 조회 구간`}
      pendingLabel="노드 사용량 불러오는 중"
      queryKey={(timeframe: MetricsTimeframe) => [
        'admin',
        'nodes',
        nodeId,
        'metrics',
        timeframe,
      ]}
      queryFn={(timeframe: MetricsTimeframe) => fetchAdminNodeMetrics(nodeId, timeframe)}
      gapNote="응답이 없던 구간은 비어 있습니다."
      emptyMessage="아직 쌓인 사용량 데이터가 없습니다."
    >
      {({ data, times, axisFormat }) => (
        <>
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
        </>
      )}
    </MetricsPanel>
  )
}
