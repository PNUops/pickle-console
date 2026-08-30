import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchCapacityTrend, fetchOrgs } from '../../api/queries'
import { Alert, Card, CardContent, CardHeader, CardTitle, Select, Spinner } from '../ui'
import { formatBytes } from '../../lib/format'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'
import { formatKstDay } from '../metrics/timeframe'
import {
  BYTES_PER_GB,
  BYTES_PER_MB,
  constantSeries,
  formatVcpu,
  formatVmCount,
  trendTimes,
} from './capacity-series'
import { useAdminScope } from '../../lib/use-admin-scope'

/** 조회 기간 선택지 — 기본 90일. */
const DAY_OPTIONS = [30, 90, 180, 365]

/**
 * 할당 추이 — 자원별로 차트를 나눠 그리고 각 차트에 현재 용량 기준선을 얹는다.
 * (vCPU·메모리·디스크는 단위가 달라 한 축에 겹칠 수 없다.)
 * uPlot을 끌어오므로 노드 화면에서 지연 로드한다(기본 내보내기).
 */
export default function CapacityTrendSection({
  /** 기관을 좁혀 볼 수 있는가 — 기관 경계가 없는 SYS 티어에게만 열린다. */
  canFilterByOrg,
}: {
  canFilterByOrg: boolean
}) {
  const { activeOrgId } = useAdminScope()
  const [days, setDays] = useState(90)
  const [pageOrgId, setPageOrgId] = useState<string | undefined>(undefined)
  const orgId = activeOrgId ?? pageOrgId
  const orgs = useQuery({
    queryKey: ['orgs'],
    queryFn: fetchOrgs,
    enabled: canFilterByOrg && activeOrgId == null,
  })
  const trend = useQuery({
    queryKey: ['admin', 'capacity-trend', { days, orgId: orgId ?? null }],
    queryFn: () => fetchCapacityTrend({ days, orgId }),
    placeholderData: keepPreviousData,
  })

  const data = trend.data
  const points = data?.points ?? []
  const times = trendTimes(points)

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>할당 추이</CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="조회 기간" className="flex flex-wrap gap-1">
            {DAY_OPTIONS.map((option) => {
              const selected = option === days
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setDays(option)}
                  className={
                    'cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary-600 ' +
                    (selected
                      ? 'bg-primary-600 text-white'
                      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900')
                  }
                >
                  {option}일
                </button>
              )
            })}
          </div>
          {canFilterByOrg && activeOrgId == null && (
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              기관
              <Select
                aria-label="할당 추이 기관 필터"
                className="w-44"
                value={pageOrgId ?? ''}
                // DOM 값은 언제나 문자열이다. 빈 문자열("전체")만 없음으로
                // 접어야 질의 키의 `orgId: null` 항목과 뒤섞이지 않는다.
                onChange={(event) => setPageOrgId(event.target.value || undefined)}
              >
                <option value="">전체</option>
                {(orgs.data ?? []).map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {trend.isPending && (
          <div className="flex justify-center py-6">
            <Spinner label="할당 추이 불러오는 중" />
          </div>
        )}
        {trend.isError && !data && <Alert variant="danger">{trend.error.message}</Alert>}
        {trend.isError && data && (
          <Alert variant="warning">
            할당 추이를 일시적으로 불러오지 못했습니다. 이전에 받은 값을 표시합니다.
          </Alert>
        )}

        {data && points.length === 0 && (
          <p className="py-2 text-sm text-neutral-500">이 기간에는 기록된 스냅샷이 없습니다.</p>
        )}

        {data && points.length > 0 && (
          <>
            <p className="text-xs text-neutral-500">
              {data.from} ~ {data.to}
            </p>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <TimeSeriesChart
                title="vCPU 할당"
                times={times}
                series={[
                  { label: '할당', data: points.map((point) => point.vcpu) },
                  {
                    label: '현재 용량',
                    data: constantSeries(points.length, data.capacityCpuThreads),
                    reference: true,
                  },
                ]}
                format={formatVcpu}
                formatTime={formatKstDay}
                splitBase="integer"
              />
              <TimeSeriesChart
                title="메모리 할당"
                times={times}
                series={[
                  {
                    label: '할당',
                    data: points.map((point) => point.memoryMb * BYTES_PER_MB),
                  },
                  {
                    label: '현재 용량',
                    data: constantSeries(
                      points.length,
                      data.capacityMemoryMb * BYTES_PER_MB,
                    ),
                    reference: true,
                  },
                ]}
                format={formatBytes}
                formatTime={formatKstDay}
                splitBase="binary"
              />
              <TimeSeriesChart
                title="디스크 할당"
                times={times}
                series={[
                  {
                    label: '할당',
                    data: points.map((point) => point.diskGb * BYTES_PER_GB),
                  },
                  // 용량이 등록되지 않은 노드가 있으면 분모를 모르므로 기준선을 생략한다.
                  ...(data.capacityDiskGb != null
                    ? [
                        {
                          label: '현재 용량',
                          data: constantSeries(
                            points.length,
                            data.capacityDiskGb * BYTES_PER_GB,
                          ),
                          reference: true,
                        },
                      ]
                    : []),
                ]}
                format={formatBytes}
                formatTime={formatKstDay}
                splitBase="binary"
                caption={
                  data.capacityDiskGb == null
                    ? '풀 용량이 등록되지 않은 노드가 있어 현재 용량 기준선은 표시하지 않습니다.'
                    : undefined
                }
              />
              <TimeSeriesChart
                title="VM 수"
                times={times}
                series={[{ label: 'VM 수', data: points.map((point) => point.vmCount) }]}
                format={formatVmCount}
                formatTime={formatKstDay}
                splitBase="integer"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
