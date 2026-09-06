import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchAdminLlmAccountUsage } from '../../api/queries'
import { formatUsd } from '../../lib/openrouter-credits'
import { TimeSeriesChart } from '../metrics/TimeSeriesChart'
import { formatKstDay } from '../metrics/timeframe'
import {
  DataTable,
  EmptyState,
  LoadingBlock,
  MessageBar,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../ui'

const WINDOWS = [7, 30, 90] as const

function count(value: number): string {
  return `${Math.round(value).toLocaleString('ko-KR')}`
}

function tokens(value: number): string {
  return `${Math.round(value).toLocaleString('ko-KR')} 토큰`
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
export function AccountUsageSection({ accountId }: { accountId: string }) {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30)
  const usage = useQuery({
    queryKey: ['admin', 'llm-accounts', accountId, 'usage', { days }],
    queryFn: () => fetchAdminLlmAccountUsage(accountId, days),
    placeholderData: keepPreviousData,
  })
  const data = usage.data
  const times = data?.points.map((point) => Date.parse(`${point.day}T00:00:00+09:00`) / 1000) ?? []

  return (
    <section className="space-y-4 rounded-panel border border-stroke-subtle bg-surface-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* 캡션을 두지 않는다 — 아래 안내가 같은 말을 하고, 그것이 이 카드가
              말해야 하는 「청구가 아니라 귀속」의 유일한 자리다. */}
          <h2 className="type-section-title">쓰임새</h2>
        </div>
        <div className="flex gap-1" role="group" aria-label="조회 기간">
          {WINDOWS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
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
        </div>
      </div>

      {usage.isPending && <LoadingBlock label="계정 사용량 불러오는 중" />}
      {usage.isError && !data && <MessageBar variant="danger">{usage.error.message}</MessageBar>}

      {data && (
        <>
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

          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Tile
              label="기간 비용"
              value={data.attributedCostUsd == null ? '—' : formatUsd(data.attributedCostUsd)}
              hint={
                data.attributedCostUsd == null
                  ? '금액이 붙은 요청 없음'
                  : `${count(data.pricedRequests)}건 기준`
              }
            />
            <Tile label="요청" value={`${count(data.requests)}건`} />
            {/* 「연결된 키」를 여기서 다시 말하지 않는다 — 위 목록이 이미 그
                수를 갖고 있고, 두 자리가 다른 출처를 쓰면 한 화면에서 서로 다른
                숫자가 뜬다. 「금액 미보고」 타일도 두지 않는다: 기간 비용 옆의
                「N건 기준」이 이미 무엇이 덮이는지 말한다. */}
            <Tile label="쓰인 키" value={`${count(data.keysUsed)}개`} />
          </dl>

          {data.requests === 0 ? (
            /* 위 타일이 이미 「연결된 키 N개」를 말하므로 그 수를 문장으로 다시
               말하지 않는다. 남길 것은 읽는 사람이 다음에 할 수 있는 것뿐이다. */
            <EmptyState
              title={
                data.keysLinked === 0
                  ? '아직 이 계정으로 발급된 키가 없습니다'
                  : '고른 기간에 호출이 없습니다'
              }
              description={
                data.keysLinked === 0 ? undefined : '기간을 늘려 보세요.'
              }
              className="min-h-40"
            />
          ) : (
            <>
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
                      data: data.points.map((point) => point.requests),
                    },
                  ]}
                  format={(value) => `${count(value)}건`}
                  formatTime={formatKstDay}
                  splitBase="integer"
                />
              </div>

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
                      <TD>{key.keyName}</TD>
                      <TD>{count(key.requests)}건</TD>
                      <TD>{tokens(key.inputTokens + key.outputTokens)}</TD>
                      <TD>
                        {key.attributedCostUsd == null
                          ? '—'
                          : formatUsd(key.attributedCostUsd)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </DataTable>
            </>
          )}
        </>
      )}
    </section>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-stroke-subtle p-3">
      <dt className="type-caption text-foreground-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-foreground-primary">{value}</dd>
      {hint && <dd className="type-caption mt-1 text-foreground-muted">{hint}</dd>}
    </div>
  )
}
