import { Alert } from '../ui'
import {
  fetchVmMetrics,
  type MetricsTimeframe,
  type VmMetricPoint,
  type VmMetrics,
} from '../../api/queries'
import { formatByteRate, formatBytes, formatPercent } from '../../lib/format'
import { MetricsPanel } from '../metrics/MetricsPanel'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'

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

/** 아직(또는 더는) 하이퍼바이저에 실체가 없는 VM — 그릴 자료가 아니라 안내다. */
function notProvisionedNotice(data: VmMetrics) {
  if (data.available) return null
  return <Alert variant="info">VM이 준비되면 사용량 데이터가 표시됩니다.</Alert>
}

/**
 * VM 사용량 탭 본문 — CPU·메모리·네트워크·디스크 I/O 시계열.
 * uPlot을 끌어오므로 상세 화면에서 지연 로드한다(기본 내보내기).
 */
export default function VmMonitoringSection({ vmId }: { vmId: number }) {
  return (
    <MetricsPanel<VmMetrics>
      title="사용량"
      pendingLabel="사용량 불러오는 중"
      // ['vms'] 무효화(전원 제어 등)에 함께 걸리도록 vms 하위 키를 쓴다.
      queryKey={(timeframe: MetricsTimeframe) => ['vms', vmId, 'metrics', timeframe]}
      queryFn={(timeframe: MetricsTimeframe) => fetchVmMetrics(vmId, timeframe)}
      gapNote="중지된 동안의 구간은 비어 있습니다."
      emptyMessage="아직 쌓인 사용량 데이터가 없습니다. 잠시 후 다시 확인해 주세요."
      unavailableNotice={notProvisionedNotice}
    >
      {({ data, times, axisFormat }) => (
        <>
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
        </>
      )}
    </MetricsPanel>
  )
}
