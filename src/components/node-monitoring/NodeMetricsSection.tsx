import {
  fetchAdminNodeMetrics,
  type MetricsTimeframe,
  type NodeMetrics,
} from '../../api/queries'
import { formatByteRate, formatBytes, formatPercent } from '../../lib/format'
import { MetricsPanel } from '../metrics/MetricsPanel'
import { pickSeries } from '../metrics/metric-series'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'

/**
 * 노드 사용량 시계열 — CPU·iowait, 메모리, 네트워크.
 * uPlot을 끌어오므로 노드 화면에서 지연 로드한다(기본 내보내기).
 */
export default function NodeMetricsSection({
  nodeId,
  nodeName,
}: {
  nodeId: string
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
      emptyMessage="아직 쌓인 사용량 데이터가 없습니다."
      blankWindowMessage="이 구간 동안 노드가 응답한 값이 없습니다."
    >
      {({ data, times, axisFormat }) => (
        <>
          <TimeSeriesChart
            title="CPU"
            times={times}
            series={[
              { label: 'CPU 사용률', data: pickSeries(data.points, 'cpu', 100) },
              { label: 'I/O 대기', data: pickSeries(data.points, 'iowait', 100) },
            ]}
            format={formatPercent}
            formatTime={axisFormat}
            yMax={100}
          />
          <TimeSeriesChart
            title="메모리"
            times={times}
            series={[
              { label: '사용', data: pickSeries(data.points, 'memUsedBytes') },
              {
                label: '전체',
                data: pickSeries(data.points, 'memTotalBytes'),
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
              { label: '수신', data: pickSeries(data.points, 'netinBps') },
              { label: '송신', data: pickSeries(data.points, 'netoutBps') },
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
