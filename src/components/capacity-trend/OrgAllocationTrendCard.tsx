import { useQuery } from '@tanstack/react-query'
import { fetchCapacityTrend } from '../../api/queries'
import { Alert, Card, CardContent, CardHeader, CardTitle, Spinner } from '../ui'
import { formatBytes } from '../../lib/format'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'
import { formatKstDay } from '../metrics/timeframe'
import {
  BYTES_PER_MB,
  TREND_DAYS,
  allocationSummary,
  hasAllocation,
  formatVcpu,
  trendTimes,
} from './capacity-series'

/**
 * 기관 할당 추이 카드 — 평문 요약 + 자원별 작은 차트.
 * uPlot을 끌어오므로 대시보드에서 지연 로드한다(기본 내보내기).
 */
export default function OrgAllocationTrendCard({ orgId }: { orgId?: string }) {
  const trend = useQuery({
    queryKey: ['admin', 'capacity-trend', { days: TREND_DAYS, orgId: orgId ?? null }],
    queryFn: () => fetchCapacityTrend({ days: TREND_DAYS, orgId }),
  })

  const points = trend.data?.points ?? []
  const times = trendTimes(points)

  return (
    <Card>
      <CardHeader>
        <CardTitle>가상머신 할당 추이 (최근 {TREND_DAYS}일)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {trend.isPending && (
          <div className="flex justify-center py-6">
            <Spinner label="할당 추이 불러오는 중" />
          </div>
        )}
        {trend.isError && <Alert variant="warning">{trend.error.message}</Alert>}
        {trend.isSuccess && (
          <>
            <p className="text-sm text-neutral-600">{allocationSummary(points)}</p>
            {/* 할당이 내내 0인 기관에는 차트를 그리지 않는다 — 0으로 눕는 선 두 개는
                위 문장이 이미 말한 것을 되풀이할 뿐이다. 관리자 화면 쪽은 용량
                기준선이 함께 있어 0도 정보가 되므로 거기서는 계속 그린다. */}
            {points.length > 0 && hasAllocation(points) && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <TimeSeriesChart
                  title="vCPU 할당"
                  times={times}
                  series={[{ label: 'vCPU 할당', data: points.map((point) => point.vcpu) }]}
                  format={formatVcpu}
                  formatTime={formatKstDay}
                  splitBase="integer"
                  height={160}
                />
                <TimeSeriesChart
                  title="메모리 할당"
                  times={times}
                  series={[
                    {
                      label: '메모리 할당',
                      data: points.map((point) => point.memoryMb * BYTES_PER_MB),
                    },
                  ]}
                  format={formatBytes}
                  formatTime={formatKstDay}
                  splitBase="binary"
                  height={160}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
