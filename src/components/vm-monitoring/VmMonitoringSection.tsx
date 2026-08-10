import { Alert } from '../ui'
import {
  fetchVmMetrics,
  type MetricsTimeframe,
  type VmMetrics,
} from '../../api/queries'
import { formatByteRate, formatBytes, formatPercent } from '../../lib/format'
import { MetricsPanel } from '../metrics/MetricsPanel'
import { pickSeries } from '../metrics/metric-series'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'

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
      emptyMessage="아직 쌓인 사용량 데이터가 없습니다. 잠시 후 다시 확인해 주세요."
      blankWindowMessage="이 구간 동안 VM이 실행되지 않아 측정된 값이 없습니다."
      unavailableNotice={notProvisionedNotice}
    >
      {({ data, times, axisFormat }) => (
        <>
          <TimeSeriesChart
            title="CPU"
            times={times}
            series={[{ label: 'CPU 사용률', data: pickSeries(data.points, 'cpu', 100) }]}
            format={formatPercent}
            formatTime={axisFormat}
            yMax={100}
          />
          <TimeSeriesChart
            title="메모리"
            times={times}
            series={[
              { label: '사용', data: pickSeries(data.points, 'memBytes') },
              {
                label: '최대',
                data: pickSeries(data.points, 'maxmemBytes'),
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
          <TimeSeriesChart
            title="디스크 I/O"
            times={times}
            series={[
              { label: '읽기', data: pickSeries(data.points, 'diskReadBps') },
              { label: '쓰기', data: pickSeries(data.points, 'diskWriteBps') },
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
