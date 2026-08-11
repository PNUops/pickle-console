import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchLlmKeyUsage, type LlmApiKeyStatus } from '../../api/queries'
import { Alert, Card, CardContent, CardHeader, CardTitle, Spinner } from '../ui'
import { formatDateTime } from '../../lib/format'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'
import { CHART_SERIES_1, CHART_SERIES_2 } from '../metrics/chart-colors'
import { formatKstDay } from '../metrics/timeframe'
import {
  DEFAULT_USAGE_DAYS,
  USAGE_DAY_OPTIONS,
  estimatedShare,
  formatRequests,
  formatShare,
  formatTokens,
  hasUsage,
  reportingState,
  usageSeries,
  usageSummary,
  usageTimes,
  usageTotals,
  type ReportingState,
} from './usage-series'

/**
 * LLM API 키의 일별 사용량.
 *
 * RRD 시계열이 아니라 일 단위 집계라 모니터링 패널이 아니라 할당 추이 쪽 구조를
 * 따른다 — 일수를 받고, uPlot은 부르는 쪽에서 지연 로드한다(기본 내보내기).
 *
 * 화면에 적는 구간은 응답이 준 것만 쓴다. 고른 일수를 그대로 쓰면 기간을 바꾼
 * 직후 새 라벨이 옛 자료 위에 얹혀, 구간 밖의 날짜를 그 구간의 최댓값이라고
 * 말하게 된다(placeholderData가 옛 응답을 그대로 보여 주는 동안).
 */
export default function LlmKeyUsageSection({
  keyId,
  status,
}: {
  keyId: string
  status: LlmApiKeyStatus
}) {
  const [days, setDays] = useState(DEFAULT_USAGE_DAYS)
  // 발급 전 키로는 어떤 요청도 인증되지 않았으므로 물어볼 것이 없다. 0으로 눕는
  // 선 세 개보다 왜 비었는지 말하는 편이 정확하다.
  const unissued = status === 'PENDING'
  const usage = useQuery({
    queryKey: ['llm-keys', keyId, 'usage', { days }],
    queryFn: () => fetchLlmKeyUsage(keyId, days),
    placeholderData: keepPreviousData,
    enabled: !unissued,
  })

  const data = usage.data
  const points = data?.points ?? []
  const times = usageTimes(points)
  const totals = usageTotals(points)
  const estimated = estimatedShare(totals)
  const reporting = data ? reportingState(data.reportedUntil, data.to) : null
  // 옛 자료를 보여 주는 중이라는 사실을 숨기지 않는다 — 숫자가 아직 옛 구간의
  // 것이므로, 조용히 바뀌면 사용자는 새 구간을 읽었다고 믿는다.
  const refreshing = usage.isFetching && !usage.isPending

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>사용량</CardTitle>
        {!unissued && (
          <div className="flex items-center gap-3">
            {refreshing && <Spinner size="sm" label="사용량 갱신 중" />}
            <div role="group" aria-label="조회 기간" className="flex flex-wrap gap-1">
              {USAGE_DAY_OPTIONS.map((option) => {
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
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {unissued && (
          <Alert variant="info" title="아직 발급되지 않은 키입니다">
            발급 전에는 이 키로 인증되는 요청이 없으므로 사용 기록도 없습니다. 개요 탭에서
            키를 발급하면 그때부터 쌓입니다.
          </Alert>
        )}

        {!unissued && (
          <>
            {status === 'REVOKED' && (
              <p className="text-sm text-neutral-600">
                폐기된 키입니다. 아래는 폐기되기 전까지 남은 기록입니다.
              </p>
            )}

            {usage.isPending && (
              <div className="flex justify-center py-6">
                <Spinner label="사용량 불러오는 중" />
              </div>
            )}
            {usage.isError && !data && <Alert variant="danger">{usage.error.message}</Alert>}
            {usage.isError && data && (
              <Alert variant="warning">
                사용량을 일시적으로 불러오지 못했습니다. 이전에 받은 값을 표시합니다.
              </Alert>
            )}

            {data && reporting && (
              <>
                <p className="text-sm text-neutral-600">{usageSummary(points)}</p>
                <p className="text-xs text-neutral-500">
                  {data.from} ~ {data.to}
                </p>

                <ReportingNotice state={reporting} />

                {/* 한도에 걸린 요청만은 사용자가 할 수 있는 일이 있는 실패다 —
                    다른 실패와 같은 자리에 묻지 않고 먼저 꺼내 말한다. */}
                {totals.rateLimited > 0 && (
                  <Alert variant="warning" title="한도에 걸려 거부된 요청이 있습니다">
                    {data.from} ~ {data.to} 사이에 {formatRequests(totals.rateLimited)}가 한도에
                    걸려 거부됐습니다. 계속 거부된다면 한도 상향을 신청해 주세요.
                  </Alert>
                )}

                {hasUsage(points) && (
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <TimeSeriesChart
                      title="요청 수"
                      times={times}
                      series={[
                        {
                          label: '전체',
                          data: usageSeries(points, (point) => point.requests),
                        },
                        {
                          label: '정상 응답',
                          data: usageSeries(points, (point) => point.succeeded),
                        },
                      ]}
                      format={formatRequests}
                      formatTime={formatKstDay}
                      splitBase="integer"
                      caption={zeroDayCaption(reporting)}
                    />
                    <TimeSeriesChart
                      title="거부·실패"
                      times={times}
                      series={[
                        {
                          // 색을 따로 못박는다 — 두 실패는 뜻이 다르고, 계열
                          // 순서가 바뀌어도 한도 초과가 다른 색으로 새지 않아야 한다.
                          label: '한도 초과 거부',
                          color: CHART_SERIES_2,
                          data: usageSeries(points, (point) => point.rateLimited),
                        },
                        {
                          label: '그 밖의 실패',
                          color: CHART_SERIES_1,
                          data: usageSeries(points, (point) => point.failed),
                        },
                      ]}
                      format={formatRequests}
                      formatTime={formatKstDay}
                      splitBase="integer"
                      caption="한도 초과 거부는 한도를 올리면 사라지는 실패이고, 그 밖의 실패는 업스트림 오류·시간 초과 등 손댈 수 없는 실패입니다."
                    />
                    <TimeSeriesChart
                      title={
                        totals.estimatedRequests > 0 ? '토큰 사용량 (일부 추정)' : '토큰 사용량'
                      }
                      times={times}
                      series={[
                        {
                          label: '입력',
                          data: usageSeries(points, (point) => point.inputTokens),
                        },
                        {
                          label: '출력',
                          data: usageSeries(points, (point) => point.outputTokens),
                        },
                      ]}
                      format={formatTokens}
                      formatTime={formatKstDay}
                      splitBase="integer"
                      caption={
                        totals.estimatedRequests > 0 ? (
                          <>
                            토큰을 만든 요청 {formatRequests(totals.succeeded)} 중{' '}
                            {formatRequests(totals.estimatedRequests)}({formatShare(estimated)})은
                            업스트림이 사용량을 주지 않아 게이트웨이가 토큰 수를 추정했습니다.
                            토큰 합은 그만큼 추정값입니다.
                          </>
                        ) : (
                          '업스트림이 보고한 실측 토큰 수입니다.'
                        )
                      }
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * 바닥에 붙은 구간을 어떻게 읽어야 하는지.
 *
 * 보고가 구간 끝까지 닿았으면 0은 0이다. 보고가 끊긴 뒤의 0은 요청이 없었다는
 * 뜻이 아니므로 그렇다고 단언하면 안 된다.
 */
function zeroDayCaption(state: ReportingState): string {
  const base =
    '호출이 없던 날도 0으로 그립니다 — 바닥에 붙은 구간은 자료가 빠진 날이 아니라 요청이 없던 날입니다.'
  if (state.kind === 'stale') {
    return `${base} 다만 ${state.unreportedFrom}부터는 아직 보고가 오지 않아, 그 날짜의 0은 요청이 없었다는 뜻이 아닐 수 있습니다.`
  }
  return base
}

/**
 * 마지막 점이 왜 낮은지, 또는 뒤쪽 0을 왜 믿으면 안 되는지.
 *
 * 전송이 배치라 오늘 자 값은 아직 채워지는 중이다. 이 말을 하지 않으면 사용자는
 * 마지막 날이 낮은 것을 "사용량이 줄었다"로 읽는다. 반대로 보고가 며칠째 없는
 * 키에 같은 말을 붙이면, 진짜 0을 "곧 채워질 값"으로 읽게 만든다.
 */
function ReportingNotice({ state }: { state: ReportingState }) {
  if (state.kind === 'never') {
    return (
      <p className="text-xs text-neutral-500">
        게이트웨이가 이 키의 사용량을 아직 한 번도 보고하지 않았습니다. 사용한 적이 있다면
        다음 보고 때 반영됩니다.
      </p>
    )
  }
  if (state.kind === 'stale') {
    return (
      <p className="text-xs text-neutral-500">
        게이트웨이 마지막 보고 {formatDateTime(state.at)}. {state.unreportedFrom}부터는 아직
        보고가 오지 않았습니다 — 그 날짜의 0은 아직 모르는 값입니다.
      </p>
    )
  }
  return (
    <p className="text-xs text-neutral-500">
      게이트웨이 마지막 보고 {formatDateTime(state.at)}. 전송이 배치라 오늘 자 값은 아직
      채워지는 중이며, 마지막 날이 낮게 보이는 것은 정상입니다.
    </p>
  )
}
