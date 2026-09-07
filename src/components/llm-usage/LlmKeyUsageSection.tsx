import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchAdminLlmKeyUsage,
  fetchLlmKeyUsage,
  type AdminLlmKeyUsage,
  type LlmApiKeyStatus,
  type LlmKeyBudget,
  type LlmKeyModelUsage,
  type LlmKeyUsageTrend,
} from '../../api/queries'
import { Alert, Card, CardContent, CardHeader, CardTitle, Spinner } from '../ui'
import { formatUsd } from '../../lib/openrouter-credits'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'
import { CHART_CATEGORICAL, CHART_SERIES_1, CHART_SERIES_2 } from '../metrics/chart-colors'
import { formatKstDay } from '../metrics/timeframe'
import { ObservationMoment } from '../OpenRouterCredits'
import { BudgetGauge } from './BudgetGauge'
import { DonutChart, type DonutSlice } from './DonutChart'
import { endpointKindLabel } from '../../lib/llm-endpoint-kinds'
import { KEY_USAGE_COPY, type UsageAudience } from './key-usage-copy'
import { UsageHeatmap } from './UsageHeatmap'
import {
  DEFAULT_USAGE_DAYS,
  USAGE_DAY_OPTIONS,
  estimatedShare,
  formatRequests,
  formatShare,
  formatTokens,
  hasUsage,
  usageSeries,
  usageSummary,
  usageTimes,
  usageTotals,
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
  audience = 'owner',
}: {
  keyId: string
  status: LlmApiKeyStatus
  /**
   * 누가 읽는가. 숫자는 갈리지 않고 **문장 둘만** 갈린다 — 무엇이 갈리는지는
   * `key-usage-copy.ts`가 갖는다.
   */
  audience?: UsageAudience
}) {
  const [days, setDays] = useState(DEFAULT_USAGE_DAYS)
  const copy = KEY_USAGE_COPY[audience]
  const admin = audience === 'admin'
  // 발급 전 키로는 어떤 요청도 인증되지 않았으므로 물어볼 것이 없다. 0으로 눕는
  // 선 세 개보다 왜 비었는지 말하는 편이 정확하다.
  const unissued = status === 'PENDING'
  // 쿼리 키가 반드시 다르다. 같으면 관리 범위로 받은 응답이 소유자 캐시에 얹히고,
  // 그 반대도 생긴다.
  const usage = useQuery({
    queryKey: admin
      ? ['admin', 'llm-keys', keyId, 'usage', { days }]
      : ['llm-keys', keyId, 'usage', { days }],
    queryFn: async (): Promise<{
      trend: LlmKeyUsageTrend
      extra: AdminLlmKeyUsage | null
    }> => {
      if (!admin) return { trend: await fetchLlmKeyUsage(keyId, days), extra: null }
      const response = await fetchAdminLlmKeyUsage(keyId, days)
      return { trend: response.trend, extra: response }
    },
    placeholderData: keepPreviousData,
    enabled: !unissued,
  })

  const data = usage.data?.trend
  const extra = usage.data?.extra ?? null
  const points = data?.points ?? []
  const times = usageTimes(points)
  const totals = usageTotals(points)
  const estimated = estimatedShare(totals)
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
            {/* The gateway reports in batches, so the numbers end here rather
                than now. One moment, relative only: the reader asks "is this
                current?", and the day the chart ends is already on its axis. */}
            {data?.reportedUntil && (
              <p className="text-xs text-neutral-500">
                <ObservationMoment value={data.reportedUntil} /> 보고
              </p>
            )}
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
            발급 전에는 이 키로 인증되는 요청이 없으므로 사용 기록도 없습니다.{' '}
            {copy.unissuedHint}
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

            {data && (
              <>
                <p className="text-sm text-neutral-600">{usageSummary(points)}</p>
                <p className="text-xs text-neutral-500">
                  {data.from} ~ {data.to}
                </p>

                {/* 합계는 타일이, 가장 많이 쓴 날은 위 문장이 말한다. 추정 비율은
                    합계 카드에 붙여 둔다: 가장 먼저 읽히는 숫자가 실측인 척하면 안 된다. */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <StatTile label="총 요청" value={formatRequests(totals.requests)} />
                  <StatTile label="정상 응답" value={formatRequests(totals.succeeded)} />
                  <StatTile
                    label="한도 거부"
                    value={formatRequests(totals.rateLimited)}
                    tone={totals.rateLimited > 0 ? 'danger' : 'normal'}
                  />
                  <StatTile label="실패" value={formatRequests(totals.failed)} />
                  <StatTile label="입력 토큰" value={formatTokens(totals.inputTokens)} />
                  <StatTile label="출력 토큰" value={formatTokens(totals.outputTokens)} />
                  <StatTile
                    label="합계 토큰"
                    value={formatTokens(totals.inputTokens + totals.outputTokens)}
                    hint={
                      totals.estimatedRequests > 0
                        ? `토큰 만든 요청의 ${formatShare(estimated)}가 추정`
                        : undefined
                    }
                  />
                  <StatTile
                    label="응답 시간 중앙값"
                    value={data.latency ? `${formatMs(data.latency.p50Ms)}` : '—'}
                    hint={data.latency ? `p99 ${formatMs(data.latency.p99Ms)}` : '정상 응답 없음'}
                  />
                  {/* 이미지를 한 번도 만들지 않은 키에 0 타일을 세우지 않는다.
                      대부분의 키가 그렇고, 0은 여기서 아무것도 말하지 않는다. */}
                  {totals.imageCount > 0 && (
                    <StatTile label="받은 이미지" value={formatRequests(totals.imageCount)} />
                  )}
                </div>

                <BudgetSection budget={data.budget} />

                {/* 한도에 걸린 요청만은 사용자가 할 수 있는 일이 있는 실패다 —
                    다른 실패와 같은 자리에 묻지 않고 먼저 꺼내 말한다. */}
                {totals.rateLimited > 0 && (
                  <Alert variant="warning" title="한도에 걸려 거부된 요청이 있습니다">
                    {data.from} ~ {data.to} 사이에 {formatRequests(totals.rateLimited)}가 한도에
                    걸려 거부됐습니다. {copy.rateLimitedAction}
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
                    />
                    {/* 위 차트에 계열을 더 얹지 않고 차트를 하나 더 만든다 —
                        캐시와 사고 토큰은 입력·출력의 **부분집합**이라 같은 축에
                        나란히 두면 합계로 읽힌다. */}
                    {(totals.cachedInputTokens > 0 || totals.reasoningTokens > 0) && (
                      <TimeSeriesChart
                        title="캐시·사고 토큰"
                        times={times}
                        series={[
                          {
                            label: '캐시된 입력',
                            data: usageSeries(points, (point) => point.cachedInputTokens),
                          },
                          {
                            label: '사고',
                            data: usageSeries(points, (point) => point.reasoningTokens),
                          },
                        ]}
                        format={formatTokens}
                        formatTime={formatKstDay}
                        splitBase="integer"
                      />
                    )}
                  </div>
                )}

                {data.models.length > 0 && (
                  <section className="space-y-4" aria-label="모델별 사용">
                    <h3 className="text-sm font-semibold text-neutral-700">모델별 사용</h3>
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                      <DonutChart
                        title="모델별 요청 비중"
                        slices={topSlices(data.models, (model) => model.requests)}
                        format={formatRequests}
                      />
                      <DonutChart
                        title="모델별 토큰 비중"
                        slices={topSlices(
                          data.models,
                          (model) => model.inputTokens + model.outputTokens,
                        )}
                        format={formatTokens}
                      />
                    </div>
                    <ModelTable models={data.models} />
                  </section>
                )}

                {data.errorTypes.length > 0 && (
                  <section className="space-y-2" aria-label="오류 종류">
                    <h3 className="text-sm font-semibold text-neutral-700">실패한 요청</h3>
                    <ul className="space-y-1 text-sm text-neutral-700">
                      {data.errorTypes.map((error) => (
                        <li key={error.errorType ?? 'unknown'} className="flex justify-between">
                          <span>{errorLabel(error.errorType)}</span>
                          <span className="text-neutral-500">
                            {formatRequests(error.requests)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {data.hourly.length > 0 && (
                  <section className="space-y-2" aria-label="시간대별 사용">
                    <h3 className="text-sm font-semibold text-neutral-700">
                      언제 많이 쓰는가 (KST)
                    </h3>
                    <UsageHeatmap cells={data.hourly} />
                  </section>
                )}

                {/* 여기부터는 관리자만 본다. 키 소유자는 모델별 금액까지만 보고
                    일별 금액도 경로별 분해도 보지 않는다 — 그 경계가 응답 모양에
                    이미 들어 있어서, 이 블록들이 `trend` 밖에 있다. */}
                {extra && <AdminOnlyBreakdowns extra={extra} />}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * 관리자만 보는 셋. 소유자 응답에는 아예 실리지 않는다.
 *
 * 일별 금액이 여기 있고 위의 토큰 차트 옆에 없는 것이 경계 그 자체다 — 소유자는
 * 모델별 금액까지만 보고 일별 금액은 보지 않으며, 일별 금액을 나르지 않는 응답이라야
 * 화면이 실수로 그릴 수 없다.
 */
function AdminOnlyBreakdowns({ extra }: { extra: AdminLlmKeyUsage }) {
  // 「그릴 값이 있는가」를 값에게 직접 묻는다. 건수를 물으면 가격 붙은 요청은 있는데
  // 금액이 전부 null 인 응답에서 빈 캔버스가 선다.
  const priced = extra.costPoints.some((point) => point.attributedCostUsd != null)
  return (
    <>
      {/* 제목을 밖에 한 번 더 쓰지 않는다 — 차트가 자기 제목을 이미 갖는다.
          위의 다른 차트들도 같은 이유로 감싸는 제목이 없다. */}
      {priced && (
        // 축을 이 계열 자신의 날짜에서 만든다. 종전에는 `trend.points` 에서 온 축에
        // `costPoints` 의 값을 얹었는데, 둘이 같은 창을 같은 순서로 채운다는 것은
        // 서버 사정이지 화면이 아는 사실이 아니다. 어긋나면 값이 엉뚱한 날짜에 찍히고
        // 목이 한쪽에서 다른 쪽을 파생시키므로 시험이 그것을 못 본다.
        <section className="space-y-2">
          <TimeSeriesChart
            title="일별 금액"
            times={extra.costPoints.map(
              (point) => Date.parse(`${point.day}T00:00:00+09:00`) / 1000,
            )}
            series={[
              {
                label: '금액',
                // 가격이 붙지 않은 날은 0이 아니라 공백이다. 0으로 그리면 그 날
                // 공짜로 썼다는, 서버가 하지 않은 주장을 선이 대신 한다.
                data: extra.costPoints.map((point) => point.attributedCostUsd ?? null),
              },
            ]}
            format={(value) => formatUsd(value)}
            formatTime={formatKstDay}
          />
        </section>
      )}

      {extra.endpointKinds.length > 0 && (
        <section className="space-y-2" aria-label="호출 종류별 사용">
          <h3 className="text-sm font-semibold text-neutral-700">호출 종류별</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                  <th scope="col" className="py-2 pr-3 font-normal">호출 종류</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">요청</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">토큰</th>
                  <th scope="col" className="py-2 text-right font-normal">금액</th>
                </tr>
              </thead>
              <tbody>
                {extra.endpointKinds.map((kind) => (
                  <tr key={kind.endpoint ?? 'unknown'} className="border-b border-neutral-100">
                    <td className="py-2 pr-3 text-neutral-700">
                      {endpointKindLabel(kind.endpoint)}
                    </td>
                    <td className="py-2 pr-3 text-right text-neutral-600">
                      {formatRequests(kind.requests)}
                    </td>
                    <td className="py-2 pr-3 text-right text-neutral-600">
                      {formatTokens(kind.inputTokens + kind.outputTokens)}
                    </td>
                    <td className="py-2 text-right text-neutral-600">
                      {kind.attributedCostUsd == null ? '—' : formatUsd(kind.attributedCostUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 빈 목록을 「대체가 없었다」로 쓰지 않는다. 응답 최상위 `model`만 다시 쓰는
          구조라 라우터가 더 깊은 자리에 진짜 모델을 넣으면 여기 안 잡힌다. */}
      {extra.servedModels.length > 0 && (
        <section className="space-y-2" aria-label="다른 모델로 응답한 사례">
          <h3 className="text-sm font-semibold text-neutral-700">요청과 다른 모델로 응답</h3>
          <ul className="space-y-1 text-sm text-neutral-700">
            {extra.servedModels.map((served) => (
              <li key={served.servedModelName} className="flex justify-between">
                <span>{served.servedModelName}</span>
                <span className="text-neutral-500">{formatRequests(served.requests)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** 숫자 하나를 크게 — 문장으로만 있던 합계를 눈이 먼저 잡도록. */
function StatTile({
  label,
  value,
  hint,
  tone = 'normal',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'normal' | 'danger'
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={
          'mt-1 text-lg font-semibold ' +
          (tone === 'danger' ? 'text-danger-600' : 'text-neutral-900')
        }
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
    </div>
  )
}

/**
 * The two budget axes.
 *
 * One is counted here and the other is enforced by the vendor. Only the money
 * gauge carries an observation time, because the token side's batching delay
 * is stated once by the report moment in the card header; putting two numbers
 * side by side and saying nothing makes them read as the same moment.
 *
 * The vendor is not named on this screen. An administrator has to find that
 * account and revoke a key in it, so their screens say who it is; a student
 * cannot act on the name and it is not theirs to know. The comment keeps the
 * fact that the code needs and the screen does not.
 */
function BudgetSection({ budget }: { budget: LlmKeyBudget }) {
  const tokenLimit = budget.dailyTokens
  const creditLimit = Number(budget.creditLimit)
  const creditUsage = budget.creditUsage == null ? null : Number(budget.creditUsage)
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="예산 소진율">
      <BudgetGauge
        label="오늘 토큰 사용"
        usedLabel={formatTokens(budget.todayTokens)}
        limitLabel={tokenLimit != null && tokenLimit > 0 ? formatTokens(tokenLimit) : null}
        ratio={tokenLimit != null && tokenLimit > 0 ? budget.todayTokens / tokenLimit : null}
        note={
          tokenLimit == null
            ? '일일 토큰 한도가 없습니다.'
            : tokenLimit === 0
              ? '토큰 한도가 0이라 자체 서빙 모델을 쓸 수 없습니다.'
              : budget.quotaExhausted
                ? '오늘 한도에 도달해 자체 서빙 모델 요청이 거절되고 있습니다. 자정(KST)에 초기화됩니다.'
                : undefined
        }
      />
      <BudgetGauge
        label="금액 사용"
        usedLabel={creditUsage == null ? null : formatUsd(creditUsage)}
        limitLabel={creditLimit > 0 ? formatUsd(creditLimit) : null}
        ratio={creditUsage != null && creditLimit > 0 ? creditUsage / creditLimit : null}
        note={
          creditLimit === 0
            ? '금액 한도가 없어 유료 모델을 쓸 수 없습니다.'
            : budget.creditDepletionForecast
              ? `이 속도면 ${budget.creditDepletionForecast}에 한도에 도달합니다.`
              : creditUsage == null
                ? undefined
                : '소진 예상을 내기에는 아직 사용 이력이 짧습니다.'
        }
        freshness={
          budget.creditUsageAt ? (
            <>
              <ObservationMoment value={budget.creditUsageAt} /> 관측
            </>
          ) : undefined
        }
      />
    </section>
  )
}

/** 모델 x (요청·토큰·평균 지연·실패율). */
/**
 * 키 소유자에게는 금액이 여기에만 있다.
 *
 * 관리자 화면에는 아래 `AdminOnlyBreakdowns` 가 일별 금액과 경로별 금액을 더 얹으므로
 * 이 문장은 소유자 쪽에만 참이다. 처음 이 주석을 쓸 때는 그 구역이 없었고, 생긴 뒤에
 * 고치지 않아 다음 편집자에게 거짓 면허를 줄 뻔했다.
 *
 * 합계 타일을 만들지 않는 것은 화면 규약의 결론이다. 「한도 창 사용」 게이지 옆에
 * 다른 창의 달러가 나란히 서면 둘의 차이를 설명하는 문단이 필요해지고, 그 문단이
 * 필요하다는 것 자체가 두 숫자를 한 자리에 둔 것이 틀렸다는 뜻이다.
 *
 * 값이 없는 것과 0인 것을 가른다. 자체 서빙 모델에는 금액이라는 것이 아예 없어서
 * `$0.00`으로 적으면 「공짜로 썼다」는 없는 주장을 하게 된다. 열 전체가 비면 열을
 * 세우지 않는다.
 */
/**
 * 한 모델이 한 행이거나 두 행이다. **관리자 화면의 모델별 분해와 같은 규칙이다** — 같은
 * 사실이 보는 화면에 따라 다르게 읽히면 안 된다(운영자 2026-09-07).
 *
 * 종전에는 「87회 · $0.079494」로 적었는데 그 금액이 18건분이었고 화면이 그 말을 하지
 * 않았다. 운영자가 그 표를 보고 「이 모델은 다 금액 있는 데이터만 있는 건가」라고 물은 것이
 * 그 표기가 틀렸다는 증거다.
 *
 * 가르는 기준은 가격이지 예산 축이 아니다. 두 행이 그 모델의 요청을 남김없이 갈라야 하고,
 * 축으로 자르면 자체 서빙과 한도 거부와 축이 기록되기 전의 요청이 어느 쪽에도 안 들어간다.
 * 대가는 아래 행이 순수한 유료 트래픽이 아니라는 것이고, 그래서 그 행은 「금액이 붙지
 * 않았다」까지만 주장한다.
 */
function modelRows(model: LlmKeyModelUsage, showCost: boolean) {
  const name = modelLabel(model.modelName)
  const unpriced = model.requests - model.pricedRequests
  const whole = {
    key: model.modelName ?? 'unknown',
    name,
    requests: model.requests,
    tokens: model.inputTokens + model.outputTokens,
    amount: model.attributedCostUsd == null ? '—' : formatUsd(model.attributedCostUsd),
    avgLatencyMs: model.avgLatencyMs,
    failed: model.failed,
  }
  // 금액 열을 안 세우는 화면에서는 나눌 이유가 없다. 나머지 열은 같은 값을 두 줄로
  // 쪼개기만 하므로, 읽는 사람에게 아무것도 더 말하지 않고 표만 길어진다.
  if (!showCost || model.pricedRequests === 0 || unpriced <= 0) return [whole]
  return [
    {
      ...whole,
      key: `${whole.key}:priced`,
      requests: model.pricedRequests,
      tokens: model.pricedInputTokens + model.pricedOutputTokens,
      avgLatencyMs: model.pricedAvgLatencyMs,
      failed: model.pricedFailed,
    },
    {
      ...whole,
      key: `${whole.key}:unpriced`,
      requests: unpriced,
      tokens: model.inputTokens + model.outputTokens
        - model.pricedInputTokens - model.pricedOutputTokens,
      // 자체 서빙 행의 「—」와 다른 말이라야 한다. 저쪽은 금액이라는 것이 없고
      // 이쪽은 있어야 하는데 모른다.
      amount: '정보 없음',
      avgLatencyMs: model.unpricedAvgLatencyMs,
      failed: model.failed - model.pricedFailed,
    },
  ]
}

function ModelTable({ models }: { models: LlmKeyModelUsage[] }) {
  const showCost = models.some((model) => model.attributedCostUsd != null)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
            <th scope="col" className="py-2 pr-3 font-normal">
              모델
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">
              요청
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">
              토큰
            </th>
            {showCost && (
              <th scope="col" className="py-2 pr-3 text-right font-normal">
                금액
              </th>
            )}
            <th scope="col" className="py-2 pr-3 text-right font-normal">
              평균 응답
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              실패율
            </th>
          </tr>
        </thead>
        <tbody>
          {models.flatMap((model) => modelRows(model, showCost)).map((row) => (
            <tr key={row.key} className="border-b border-neutral-100">
              <td className="py-2 pr-3 text-neutral-700">{row.name}</td>
              <td className="py-2 pr-3 text-right text-neutral-600">
                {formatRequests(row.requests)}
              </td>
              <td className="py-2 pr-3 text-right text-neutral-600">
                {formatTokens(row.tokens)}
              </td>
              {showCost && (
                <td className="py-2 pr-3 text-right text-neutral-600">{row.amount}</td>
              )}
              <td className="py-2 pr-3 text-right text-neutral-600">
                {formatMs(row.avgLatencyMs)}
              </td>
              <td className="py-2 text-right text-neutral-600">
                {row.requests === 0
                  ? '—'
                  : formatShare((row.failed / row.requests) * 100)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * 도넛에 올릴 조각 — 상위 넷과 나머지를 묶은 '기타'.
 *
 * 검증을 통과한 범주 색이 넷이라 조각도 넷에서 끊는다. 색을 더 만들면 사람 눈에
 * 같은 색 둘이 생기고, 그러면 비중을 잘못 읽는다.
 */
function topSlices(
  models: LlmKeyModelUsage[],
  pick: (model: LlmKeyModelUsage) => number,
): DonutSlice[] {
  const sorted = models
    .map((model) => ({ label: modelLabel(model.modelName), value: pick(model) }))
    .filter((slice) => slice.value > 0)
    .sort((a, b) => b.value - a.value)
  if (sorted.length <= CHART_CATEGORICAL.length) return sorted
  const rest = sorted
    .slice(CHART_CATEGORICAL.length)
    .reduce((sum, slice) => sum + slice.value, 0)
  return [
    ...sorted.slice(0, CHART_CATEGORICAL.length),
    {
      label: `기타 ${sorted.length - CHART_CATEGORICAL.length}종`,
      value: rest,
      residual: true,
    },
  ]
}

function modelLabel(name: string | null | undefined): string {
  return name ?? '모델 미상'
}

function errorLabel(errorType: string | null | undefined): string {
  return errorType ?? '기타'
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}초`
  return `${Math.round(ms)}ms`
}
