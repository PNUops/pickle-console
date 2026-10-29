import { TokenValue } from '../TokenValue'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchAdminLlmAccountUsage } from '../../api/queries'
import { requestReaderKey } from '../../api/request-review'
import { useAuth } from '../../auth/auth-context'
import { formatDateTimeSeconds } from '../../lib/format'
import { formatUsd } from '../../lib/openrouter-credits'
import { isExactTokenCount, UNKNOWN_TOKEN_VALUE, unpricedTokenCount } from '../../lib/token-presentation'
import { useAdminScope } from '../../lib/use-admin-scope'
import { CONSUMER_SORTS, CONSUMER_SORT_LABELS, usageDays, responseUsageDays, explorationPageSize } from '../../lib/llm-exploration'
import { listPage, withListReturn } from '../../lib/list-url'
import { useListUrl } from '../../lib/use-list-url'
import { adminPaths } from '../../lib/paths'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'
import { formatKstDay } from '../metrics/timeframe'
import {
  Button,
  DataTable,
  DescriptionList,
  EmptyState,
  LoadingBlock,
  MessageBar,
  Pagination,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../ui'

const WINDOWS = [7, 30, 90] as const

function count(value: number, unit = ''): string {
  return isExactTokenCount(value) ? `${value.toLocaleString('ko-KR')}${unit}` : UNKNOWN_TOKEN_VALUE
}

/**
 * 이 계정이 무엇에 얼마를 썼는지.
 *
 * **잔액과 누적 사용, 배정 합계, 남은 배정은 여기서 다시 말하지 않는다.** 위아래
 * 구역이 이미 답하고 있고, 같은 사실을 두 자리에서 말하면 어느 쪽이 최신인지를
 * 읽는 사람이 판단해야 한다.
 *
 * 배치는 잔액과 사용액 다음, 배정 현황 앞이다. 읽는 순서가 「지금 얼마 남았나 →
 * 무엇에 나갔나 → 앞으로 얼마가 더 나갈 수 있나」가 되고, 시간축을 가진 것은 가운데
 * 하나뿐이라 세 구역의 경계가 말이 아니라 형태로 갈린다.
 *
 * 토큰 합계를 넣지 않는다. 사업 계정의 단위는 돈이고, 토큰을 넣으면 어휘가 갈라
 * 놓은 두 축이 한 카드에서 다시 섞인다. 키별 표에만 남기는 것은 그 표가 「어느 키가
 * 무엇을 했나」를 답하는 자리이기 때문이다.
 */
export function AccountUsageSection({ accountId, orgId }: { accountId: string; orgId?: string }) {
  const [params, change] = useListUrl()
  const location = useLocation()
  const days = usageDays(params.get('days'))
  const page = listPage(params.get('page'))
  const size = explorationPageSize(params.get('size'))
  const invalidSize = size == null
  const sort = CONSUMER_SORTS.find((value) => value === params.get('sort')) ?? 'REPORTED_COST_DESC'
  const invalidSort = params.has('sort') && !CONSUMER_SORTS.includes(params.get('sort') as typeof sort)
  const rawDays = params.get('days')
  const invalidDays = rawDays != null && (!/^\d+$/.test(rawDays) || Number(rawDays) < 1 || Number(rawDays) > 90)
  const { user } = useAuth()
  const scope = useAdminScope()
  const reader = requestReaderKey(user)
  const visibility = JSON.stringify([accountId, scope.activeOrgId ?? null, reader])
  const identity = JSON.stringify([visibility, days, page, sort, size])
  const load = async () => ({
    identity,
    visibility,
    value: await fetchAdminLlmAccountUsage(accountId, days, { page, size: size ?? 20, sort }),
    fetchedAt: new Date().toISOString(),
  })
  const lastSuccess = useRef<Awaited<ReturnType<typeof load>> | null>(null)
  const usage = useQuery({
    queryKey: ['admin', 'llm-accounts', accountId, 'usage', { days, page, sort, size, reader, orgId: scope.activeOrgId ?? null }],
    queryFn: load,
    enabled: scope.ready && !invalidSort && !invalidDays && !invalidSize,
    placeholderData: (previous) => previous?.visibility === visibility ? previous : undefined,
  })
  useEffect(() => {
    if (usage.data?.visibility === visibility && !usage.isPlaceholderData) lastSuccess.current = usage.data
  }, [usage.data, usage.isPlaceholderData, visibility])
  const result = usage.data?.visibility === visibility ? usage.data
    : lastSuccess.current?.visibility === visibility ? lastSuccess.current : undefined
  const data = scope.ready && !invalidSort && !invalidDays && !invalidSize ? result?.value : undefined
  const responseDays = data ? responseUsageDays(data.from, data.to) : null
  const previousWindow = !!data && (result?.identity !== identity || usage.isPlaceholderData || responseDays !== days || data.page !== page || data.size !== size || data.sort !== sort)
  const returnTo = `${location.pathname}${location.search}`
  const times = data?.points.map((point) => Date.parse(`${point.day}T00:00:00+09:00`) / 1000) ?? []

  return (
    <section className="space-y-4 rounded-panel border border-stroke-subtle bg-surface-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* 캡션을 두지 않는다 — 아래 안내가 같은 말을 하고, 그것이 이 카드가
              말해야 하는 「청구가 아니라 귀속」의 유일한 자리다. */}
          <h2 className="type-section-title">쓰임새</h2>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="조회 기간">
          {WINDOWS.map((option) => (
            <button
              key={option}
              type="button"
              disabled={!scope.ready}
              onClick={() => change({ days: option }, true)}
              aria-pressed={days === option}
              className={
                days === option
                  ? 'rounded-md bg-brand-background px-3 py-1 text-sm font-medium text-brand-foreground cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-foreground'
                  : 'rounded-md px-3 py-1 text-sm text-foreground-muted hover:text-foreground-primary cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-foreground'
              }
            >
              {option}일
            </button>
          ))}
          <Button size="sm" variant="secondary" onClick={() => { void usage.refetch() }}
            disabled={!scope.ready || usage.isFetching || invalidSort || invalidDays || invalidSize}>다시 조회</Button>
        </div>
      </div>

      <Select aria-label="계정 소비 키 정렬" value={sort} onChange={(event) => change({ sort: event.target.value }, true)}>
        <option value="REPORTED_COST_DESC">보고 금액 많은 순</option><option value="REQUESTS_DESC">요청 많은 순</option><option value="TOKENS_DESC">토큰 많은 순</option>
      </Select>
      <Button variant="secondary" onClick={() => change({ sort: undefined, page: undefined, size: undefined })}>소비 키 정렬·페이지 초기화</Button>
      {invalidSize && <MessageBar variant="danger">페이지 크기는 1~100이어야 합니다.</MessageBar>}
      {invalidSort && <MessageBar variant="danger">소비 키 정렬 조건이 올바르지 않습니다.</MessageBar>}
      {invalidDays && <MessageBar variant="danger">조회 일수는 1~90일이어야 합니다. 기간을 다시 선택해 주세요.</MessageBar>}

      {usage.isPending && !data && <LoadingBlock label="계정 사용량 불러오는 중" />}
      {usage.isFetching && data && <MessageBar>새 조회 결과를 기다리고 있습니다. 마지막 성공 응답의 기간을 표시합니다.</MessageBar>}
      {usage.isError && <MessageBar variant="danger">
        <p>{usage.error.message}</p>
        <p>{data ? '마지막 성공 결과는 아래에 표시한 응답 기간의 값입니다.' : '성공한 조회 결과가 없습니다.'}</p>
      </MessageBar>}

      {data && (
        <>
          {previousWindow && <MessageBar variant="warning">이전 조회 결과입니다. 선택한 기간의 새 결과로 해석하지 마세요.</MessageBar>}
          <DescriptionList columns={2} items={[
            { term: '실제 응답 기간', description: `${data.from} ~ ${data.to} (KST, 양 끝 날짜 포함)` },
            { term: '요청한 기간', description: `${days}일` },
            { term: '콘솔 마지막 GET 성공', description: result?.fetchedAt ? formatDateTimeSeconds(result.fetchedAt) : '기록 없음' },
            { term: '응답 생성', description: data.generatedAt ? formatDateTimeSeconds(data.generatedAt) : '미보고' },
            { term: '집계 기준', description: data.source === 'DAILY_ROLLUP_ATTRIBUTION_CURRENT_ACCOUNT_BINDING' ? '현재 연결된 키의 일별 귀속 기록' : '집계 기준 미확인' },
            { term: '소비 키 전체 / 응답 페이지', description: `${count(data.totalKeyElements, '개')} / ${count(data.page + 1)} (${CONSUMER_SORT_LABELS[data.sort] ?? '정렬 미확인'})` },
          ]} />
          {/* 이 카드가 말하는 금액이 무엇이 아닌지를 먼저 말한다. 위 구역의
              잔액과 나란히 서 있으므로, 말하지 않으면 두 숫자가 같은 것을
              뜻한다고 읽힌다. **쓴 것이 없으면 말하지 않는다** — 구별할 숫자가
              아직 없는데 구별을 설명하는 문장이 서면 그것도 되풀이다. */}
          {data.requests > 0 && (
          <MessageBar>
            공급자가 청구한 금액이 아니라 <strong>요청마다 알려 준 금액을 이 계정의 키로
            귀속한 값</strong>입니다. 키가 확인되지 않은 요청은 어느 계정에도 속하지 않고,
            금액이 보고되지 않은 요청은 합계에서 빠집니다.
          </MessageBar>
          )}

          {/* 쓴 것이 없으면 **타일 줄까지 접는다.** 0으로 채운 타일 셋은
              「요청 0건」과 「금액이 붙은 요청 없음」과 「쓰인 키 0개」로 같은
              사실을 세 번 말하고, 그 옆의 문장이 네 번째가 된다. 없다는 말은
              한 자리에서 한 번이면 된다.

              「연결된 키」는 어느 쪽에도 두지 않는다 — 위 목록이 이미 그 수를
              갖고 있고, 두 자리가 다른 출처를 쓰면 한 화면에서 서로 다른 숫자가
              뜬다. */}
          {data.requests === 0 ? (
            <EmptyState
              title={
                data.keysLinked === 0
                  ? '이 계정에 연결된 키가 없습니다'
                  : '고른 기간에 이 계정으로 호출한 기록이 없습니다'
              }
              className="min-h-40"
            />
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <Tile
                  label="기간 비용"
                  value={
                    data.attributedCostUsd == null ? '—' : formatUsd(data.attributedCostUsd)
                  }
                  hint={
                    data.attributedCostUsd == null
                      ? '금액이 붙은 요청 없음'
                      : `${count(data.pricedRequests, '건')} 기준`
                  }
                />
                <Tile label="요청" value={count(data.requests, '건')} />
                <Tile label="쓰인 키" value={<a className="text-brand-foreground underline" href="#account-consumers"><span>{count(data.keysUsed, '개')}</span> 전체 탐색</a>} />
              </dl>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <TimeSeriesChart
                  title="일별 금액"
                  times={times}
                  series={[
                    {
                      label: '금액',
                      // 금액이 붙지 않은 날은 0이 아니라 null이다 — 0으로 그리면
                      // 그 날 공짜로 썼다는 없는 주장을 선이 대신 한다.
                      data: data.points.map((point) => point.attributedCostUsd ?? null),
                    },
                  ]}
                  format={(value) => formatUsd(value)}
                  formatTime={formatKstDay}
                />
                <TimeSeriesChart
                  title="일별 요청"
                  times={times}
                  series={[
                    {
                      label: '요청',
                      data: data.points.map((point) => isExactTokenCount(point.requests) ? point.requests : null),
                    },
                  ]}
                  format={(value) => count(value, '건')}
                  formatTime={formatKstDay}
                  splitBase="integer"
                />
              </div>

              <div id="account-consumers" className="space-y-3">
              <DataTable caption="키별 쓰임새" captionVisible>
                <THead>
                  <TR>
                    <TH>키</TH>
                    <TH>요청</TH>
                    <TH>토큰</TH>
                    <TH>금액</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.keys.map((key) => (
                    <TR key={key.keyId}>
                      <TD>{responseDays != null ? <Link className="text-brand-foreground underline" to={withListReturn(`${adminPaths.llmKeyDetail(key.keyId, orgId ?? scope.activeOrgId)}${(orgId ?? scope.activeOrgId) ? '&' : '?'}tab=usage&days=${responseDays}`, returnTo)}>{key.keyName}</Link> : <span>{key.keyName}</span>}</TD>
                      <TD>{count(key.requests, '건')}</TD>
                      <TD><TokenValue value={unpricedTokenCount(key.inputTokens, key.outputTokens, 0, 0)} /></TD>
                      <TD>
                        {key.attributedCostUsd == null
                          ? '—'
                          : formatUsd(key.attributedCostUsd)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </DataTable>
              <Pagination page={data.page} totalPages={data.totalKeyPages} onPageChange={(value) => change({ page: value })} />
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}

function Tile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-md border border-stroke-subtle p-3">
      <dt className="type-caption text-foreground-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-foreground-primary">{value}</dd>
      {hint && <dd className="type-caption mt-1 text-foreground-muted">{hint}</dd>}
    </div>
  )
}
