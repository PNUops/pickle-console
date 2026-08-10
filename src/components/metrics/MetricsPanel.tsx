import { useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery, type QueryKey } from '@tanstack/react-query'
import type { MetricsTimeframe } from '../../api/queries'
import { Alert, Card, CardContent, CardHeader, CardTitle, Spinner } from '../ui'
import { formatDateTime } from '../../lib/format'
import {
  METRICS_POLL_MS,
  METRICS_RETRY_POLL_MS,
  isHypervisorUnreadable,
} from './metrics-state'
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
  /** 점은 있지만 구간 내내 잰 값이 하나도 없을 때 — 화면마다 이유가 다르다. */
  blankWindowMessage: string
  /** 자료를 받았어도 그릴 대상이 아닐 때의 안내 (아직 준비되지 않은 VM 등). */
  unavailableNotice?: (data: T) => ReactNode | null
  children: (view: MetricsView<T>) => ReactNode
}

/**
 * VM·노드 사용량 화면이 공유하는 껍데기 — 폴링 주기, 대기·오류·낡은 자료·빈 자료
 * 상태와 차트 격자를 한곳에서 처리한다. 각 화면은 차트 구성과 문구만 넘긴다.
 *
 * 값을 읽을 수 없는 상태(하이퍼바이저 무응답)는 장애 화면이 아니라 사실 안내로
 * 그리되, 대개 잠깐인 상태이므로 느슨한 주기로 계속 물어 스스로 되돌아온다.
 */
export function MetricsPanel<T extends MetricsPayload>({
  title,
  switcherLabel,
  queryKey,
  queryFn,
  pendingLabel,
  emptyMessage,
  blankWindowMessage,
  unavailableNotice,
  children,
}: MetricsPanelProps<T>) {
  const [timeframe, setTimeframe] = useState<MetricsTimeframe>('HOUR')
  const metrics = useQuery({
    queryKey: queryKey(timeframe),
    queryFn: () => queryFn(timeframe),
    // 구간을 바꾸는 동안 이전 그림을 유지한다 — 빈 화면으로 깜빡이지 않게.
    placeholderData: keepPreviousData,
    // 실패한 뒤에는 구간과 무관하게 느슨한 주기로 계속 물어본다 — 하이퍼바이저가
    // 돌아왔는지 알 방법이 그것뿐이다(창 포커스 재조회는 전역으로 꺼져 있고,
    // 다시 시도 버튼도 없다). 정상 상태의 30초 폴링보다 촘촘해지지는 않는다.
    refetchInterval: (query) => {
      if (query.state.error) return METRICS_RETRY_POLL_MS
      return timeframe === 'HOUR' ? METRICS_POLL_MS : false
    },
  })

  const data = metrics.data
  // 축 라벨은 화면에 그려진 자료의 구간을 따른다 — 구간을 바꾼 직후(또는 새 구간
  // 조회가 실패해 이전 자료가 남아 있을 때) 선택값을 따르면 라벨이 자료와 어긋난다.
  const axisFormat = timeframeAxisFormat(
    (data?.timeframe as MetricsTimeframe | undefined) ?? timeframe,
  )
  const times = data ? data.points.map((point) => toEpochSeconds(point.time)) : []
  const notice = data ? (unavailableNotice?.(data) ?? null) : null
  const blankWindow = data != null && data.points.length > 0 && hasNoMeasuredValue(data.points)

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
            그림이 있으면 안내와 함께 유지한다. 어느 쪽이든 조회는 계속되므로
            문구도 "다시 시도하는 중"이라고 밝힌다. */}
        {metrics.isError && !data && isHypervisorUnreadable(metrics.error) && (
          <p className="py-2 text-sm text-neutral-500">
            하이퍼바이저가 응답하지 않아 사용량을 표시할 수 없습니다. 다시 시도하는
            중입니다.
          </p>
        )}
        {metrics.isError && !data && !isHypervisorUnreadable(metrics.error) && (
          <Alert variant="danger">{metrics.error.message}</Alert>
        )}
        {metrics.isError && data && isHypervisorUnreadable(metrics.error) && (
          <p className="py-2 text-sm text-neutral-500">
            하이퍼바이저가 응답하지 않아 마지막 갱신 {formatDateTime(data.fetchedAt)}{' '}
            기준으로 표시합니다. 다시 시도하는 중입니다.
          </p>
        )}
        {metrics.isError && data && !isHypervisorUnreadable(metrics.error) && (
          <Alert variant="warning">
            사용량 데이터를 일시적으로 불러오지 못했습니다. 마지막 갱신{' '}
            {formatDateTime(data.fetchedAt)} 기준으로 표시하며 다시 시도하는 중입니다.
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
            {/* 구간 내내 잰 값이 없으면 차트는 빈 판이 된다 — 왜 비었는지 한 줄로
                밝힌다(상시 캡션이 아니라 그 상태일 때만). */}
            {blankWindow && (
              <p className="text-sm text-neutral-500">{blankWindowMessage}</p>
            )}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {children({ data, times, axisFormat })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * 구간 안에 잰 값이 하나도 없는가 — 시각 말고는 모든 자리가 비어 있는 응답이다
 * (내내 꺼져 있던 VM, 아무것도 답하지 않은 노드). 점은 있으므로 "자료 없음"으로는
 * 걸러지지 않고, 그대로 두면 빈 차트 넷만 남는다.
 */
function hasNoMeasuredValue(points: readonly { time: string }[]): boolean {
  return points.every((point) =>
    Object.entries(point).every(
      ([key, value]) => key === 'time' || typeof value !== 'number',
    ),
  )
}
