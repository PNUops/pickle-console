import { useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery, type QueryKey } from '@tanstack/react-query'
import type { MetricsTimeframe } from '../../api/queries'
import { Alert, Card, CardContent, CardHeader, CardTitle, Spinner } from '../ui'
import { formatDateTime } from '../../lib/format'
import { METRICS_POLL_MS, isHypervisorUnreadable } from './metrics-state'
import { TimeframeSwitcher } from './TimeframeSwitcher'
import { timeframeAxisFormat, toEpochSeconds } from './timeframe'

/** VM·노드 시계열 응답이 공유하는 모양 — 패널이 상태를 판단하는 데 쓰는 부분. */
export interface MetricsPayload {
  timeframe: string
  fetchedAt: string
  points: { time: string }[]
}

/** 차트 묶음을 그리는 데 필요한, 이미 손질된 값들. */
export interface MetricsView<T> {
  data: T
  /** x축 값 (epoch 초). */
  times: number[]
  /** 화면에 그려진 자료의 구간을 따르는 시각 라벨 포매터. */
  axisFormat: (seconds: number) => string
}

export interface MetricsPanelProps<T extends MetricsPayload> {
  title: ReactNode
  /** 조회 구간 스위처의 접근 가능한 이름 — 한 화면에 여러 개면 구분해야 한다. */
  switcherLabel?: string
  queryKey: (timeframe: MetricsTimeframe) => QueryKey
  queryFn: (timeframe: MetricsTimeframe) => Promise<T>
  /** 첫 조회 스피너의 이름. */
  pendingLabel: string
  /** 응답은 왔지만 아직 쌓인 점이 없을 때. */
  emptyMessage: string
  /** 자료를 받았어도 그릴 대상이 아닐 때의 안내 (아직 준비되지 않은 VM 등). */
  unavailableNotice?: (data: T) => ReactNode | null
  children: (view: MetricsView<T>) => ReactNode
}

/**
 * VM·노드 사용량 화면이 공유하는 껍데기 — 폴링 주기, 대기·오류·낡은 자료·빈 자료
 * 상태와 차트 격자를 한곳에서 처리한다. 각 화면은 차트 구성과 문구만 넘긴다.
 *
 * 값을 읽을 수 없는 상태(하이퍼바이저 무응답)는 장애 화면이 아니라 사실 안내로
 * 그리고, 같은 답이 돌아올 조회를 30초마다 되풀이하지 않는다.
 */
export function MetricsPanel<T extends MetricsPayload>({
  title,
  switcherLabel,
  queryKey,
  queryFn,
  pendingLabel,
  emptyMessage,
  unavailableNotice,
  children,
}: MetricsPanelProps<T>) {
  const [timeframe, setTimeframe] = useState<MetricsTimeframe>('HOUR')
  const metrics = useQuery({
    queryKey: queryKey(timeframe),
    queryFn: () => queryFn(timeframe),
    // 구간을 바꾸는 동안 이전 그림을 유지한다 — 빈 화면으로 깜빡이지 않게.
    placeholderData: keepPreviousData,
    // 하이퍼바이저가 응답하지 않는 것은 다시 물어도 같은 답이다 — 전역 기본
    // 재시도(1회)도, 30초 폴링도 이 상태에서는 멈춘다.
    retry: (failureCount, error) => !isHypervisorUnreadable(error) && failureCount < 1,
    refetchInterval: (query) =>
      timeframe === 'HOUR' && !isHypervisorUnreadable(query.state.error)
        ? METRICS_POLL_MS
        : false,
  })

  const data = metrics.data
  // 축 라벨은 화면에 그려진 자료의 구간을 따른다 — 구간을 바꾼 직후(또는 새 구간
  // 조회가 실패해 이전 자료가 남아 있을 때) 선택값을 따르면 라벨이 자료와 어긋난다.
  const axisFormat = timeframeAxisFormat(
    (data?.timeframe as MetricsTimeframe | undefined) ?? timeframe,
  )
  const times = data ? data.points.map((point) => toEpochSeconds(point.time)) : []
  const notice = data ? (unavailableNotice?.(data) ?? null) : null

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        <TimeframeSwitcher
          value={timeframe}
          onChange={setTimeframe}
          label={switcherLabel}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {metrics.isPending && (
          <div className="flex justify-center py-6">
            <Spinner label={pendingLabel} />
          </div>
        )}

        {/* 값을 모른다는 사실은 차분하게, 그 밖의 실패는 오류로. 이미 받아 둔
            그림이 있으면 경고와 함께 유지한다. */}
        {metrics.isError && !data && isHypervisorUnreadable(metrics.error) && (
          <p className="py-2 text-sm text-neutral-500">
            하이퍼바이저가 응답하지 않아 사용량을 표시할 수 없습니다.
          </p>
        )}
        {metrics.isError && !data && !isHypervisorUnreadable(metrics.error) && (
          <Alert variant="danger">{metrics.error.message}</Alert>
        )}
        {metrics.isError && data && (
          <Alert variant="warning">
            사용량 데이터를 일시적으로 불러오지 못했습니다. 마지막 갱신{' '}
            {formatDateTime(data.fetchedAt)} 기준으로 표시합니다.
          </Alert>
        )}

        {notice}

        {data && notice == null && data.points.length === 0 && (
          <p className="py-2 text-sm text-neutral-500">{emptyMessage}</p>
        )}

        {data && notice == null && data.points.length > 0 && (
          <>
            <p className="text-xs text-neutral-500">
              마지막 갱신 {formatDateTime(data.fetchedAt)}
            </p>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {children({ data, times, axisFormat })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
