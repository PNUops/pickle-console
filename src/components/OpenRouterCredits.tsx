import type {
  AdminLlmKeyDetail,
  AdminLlmKeySummary,
  OpenRouterAccountAllocation,
  OpenRouterAccountCredits,
  OpenRouterCreditsFreshness,
} from '../api/queries'
import { formatRelative } from '../lib/format'
import {
  type AllocationJudgement,
  type AllocationVerdict,
  evaluateAllocation,
  FORECAST_REASON_LABELS,
  FRESHNESS_LABELS,
  UNMANAGED_REASON_LABELS,
  VENDOR_ERROR_LABELS,
  formatUsd,
} from '../lib/openrouter-credits'
import { BudgetGauge } from './llm-usage/BudgetGauge'
import { Badge, DescriptionList, MessageBar, type BadgeVariant } from './ui'

const FRESHNESS_VARIANTS: Record<OpenRouterCreditsFreshness, BadgeVariant> = {
  FRESH: 'success',
  STALE: 'warning',
  UNKNOWN: 'neutral',
}

/**
 * 지금 얼마나 신선한지를 묻는 자리의 시각. 상대 표기 하나만 쓴다. 같은
 * 값을 절대 시각으로 한 번 더 그리거나 title 로 또 얹으면 한 사실이 화면
 * 한 줄에 세 번 나온다. 언제 있었는지를 기록하는 자리(감사, 활동 내역,
 * 생성·변경일)는 반대로 절대 시각만 쓴다.
 */
export function ObservationMoment({
  value,
  empty = '기록 없음',
}: {
  value: string | null | undefined
  empty?: string
}) {
  if (!value) return <span>{empty}</span>
  return <time dateTime={value}>{formatRelative(value)}</time>
}

export function CreditsFreshnessBadge({ freshness }: { freshness: OpenRouterCreditsFreshness }) {
  const label = FRESHNESS_LABELS[freshness]
  if (!label) return null
  return <Badge variant={FRESHNESS_VARIANTS[freshness]}>{label}</Badge>
}

export function AccountCreditsCompact({ credits }: { credits: OpenRouterAccountCredits }) {
  return (
    <div className="min-w-48 space-y-1.5 text-xs">
      <p className="font-semibold text-foreground-primary">잔액 {formatUsd(credits.balance)}</p>
      <p className="text-foreground-secondary">누적 사용 {formatUsd(credits.totalUsage)}</p>
      <CreditsFreshnessBadge freshness={credits.freshness} />
      <ObservationMoment value={credits.observedAt} empty="금액 관측 전" />
    </div>
  )
}

export function AccountCreditsSection({ credits }: { credits: OpenRouterAccountCredits }) {
  const errorLabel = credits.error ? VENDOR_ERROR_LABELS[credits.error] : null
  const keysErrorLabel = credits.keysError ? VENDOR_ERROR_LABELS[credits.keysError] : null
  return (
    <section className="space-y-4 rounded-panel border border-stroke-subtle bg-surface-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="type-section-title">잔액과 사용액</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            금액과 키 대사는 각각 따로 읽으므로 갱신 시각이 다를 수 있습니다.
          </p>
        </div>
        <CreditsFreshnessBadge freshness={credits.freshness} />
      </div>

      {credits.error && (
        <MessageBar variant="warning" title="최근 credits 확인 실패">
          {errorLabel}. 마지막 성공 값은 아래에 그대로 보존되어 있습니다.
        </MessageBar>
      )}
      <DescriptionList
        columns={3}
        items={[
          { term: '구매 credits 합계', description: formatUsd(credits.totalCredits) },
          { term: 'Account 누적 사용', description: formatUsd(credits.totalUsage) },
          { term: '잔액', description: formatUsd(credits.balance) },
          { term: '일평균 사용', description: formatUsd(credits.averageDailyUsage) },
          {
            term: '잔액 소진 예상',
            description: credits.depletionForecastAt ? (
              <ObservationMoment value={credits.depletionForecastAt} />
            ) : credits.forecastUnavailableReason ? (
              FORECAST_REASON_LABELS[credits.forecastUnavailableReason]
            ) : '계산 전',
          },
          {
            term: '예상 window 시작',
            description: <ObservationMoment value={credits.forecastWindowStartedAt} />,
          },
          { term: '금액 관측', description: <ObservationMoment value={credits.observedAt} /> },
          { term: 'Credits 마지막 성공', description: <ObservationMoment value={credits.lastSuccessAt} /> },
          { term: 'Credits 마지막 시도', description: <ObservationMoment value={credits.lastAttemptAt} /> },
        ]}
      />

      <div className="border-t border-stroke-subtle pt-4">
        <h3 className="mb-3 font-semibold text-foreground-primary">Pickle 밖에서 쓴 금액</h3>
        <DescriptionList
          columns={3}
          items={[
            { term: 'Account 사용 증가분', description: formatUsd(credits.accountUsageSinceBaseline) },
            { term: 'Pickle 관리 key 증가분', description: formatUsd(credits.managedUsageSinceBaseline) },
            {
              term: '미관리 지출',
              description: credits.unmanagedSpend != null
                ? formatUsd(credits.unmanagedSpend)
                : credits.unmanagedSpendUnavailableReason
                  ? UNMANAGED_REASON_LABELS[credits.unmanagedSpendUnavailableReason]
                  : '계산 전',
            },
            { term: '비교 기준 시점', description: <ObservationMoment value={credits.unmanagedBaselineAt} /> },
            { term: '계정 사용액 읽은 때', description: <ObservationMoment value={credits.pairedCreditsObservedAt} /> },
            { term: '키 사용액 읽은 때', description: <ObservationMoment value={credits.pairedKeysObservedAt} /> },
          ]}
        />
      </div>

      <div className="border-t border-stroke-subtle pt-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-foreground-primary">키 대사 상태</h3>
          <CreditsFreshnessBadge freshness={credits.keysFreshness} />
        </div>
        {credits.keysError && (
          <MessageBar variant="warning" title="최근 key 대사 실패">
            {keysErrorLabel}.
          </MessageBar>
        )}
        <DescriptionList
          columns={2}
          className="mt-3"
          items={[
            { term: 'Key 대사 마지막 성공', description: <ObservationMoment value={credits.keysLastSuccessAt} /> },
            { term: 'Key 대사 마지막 시도', description: <ObservationMoment value={credits.keysLastAttemptAt} /> },
          ]}
        />
      </div>
    </section>
  )
}

export function KeyCreditObservation({
  llmKey,
}: {
  llmKey: Pick<
    AdminLlmKeySummary | AdminLlmKeyDetail,
    'creditUsage' | 'creditLimitRemaining' | 'creditUsageAt'
  >
}) {
  if (llmKey.creditUsage == null && llmKey.creditLimitRemaining == null) {
    return <span className="text-foreground-muted">금액 관측 전</span>
  }
  return (
    <div className="min-w-40 text-xs">
      <span className="block">Limit window 사용 {formatUsd(llmKey.creditUsage)}</span>
      <span className="block text-foreground-muted">
        잔여 한도 {formatUsd(llmKey.creditLimitRemaining)}
      </span>
      <ObservationMoment value={llmKey.creditUsageAt} />
    </div>
  )
}

const ALLOCATION_NOTES: Record<AllocationVerdict, string | null> = {
  WITHIN: null,
  EXCEEDED: '남은 배정이 잔액을 넘습니다. 먼저 쓰는 사람이 잔액을 소진하면 나머지 키는 호출이 실패합니다.',
  NO_BALANCE: '잔액이 0입니다. 지금 이 계정의 키는 호출이 곧바로 실패합니다.',
  NEGATIVE_BALANCE: '이미 잔액을 넘겨 쓴 상태입니다. 충전 전에는 이 계정의 키가 동작하지 않습니다.',
  UNKNOWN: '잔액을 아직 관측하지 못해 초과 여부를 판단할 수 없습니다.',
}

/**
 * 사업 계정 하나가 얼마를 약속했고 그중 얼마가 아직 나갈 수 있는지.
 *
 * 잔액 옆에 두 수를 나란히 놓는다. **배정 합계**는 「얼마를 약속했나」이고
 * **남은 배정**은 「앞으로 얼마가 더 나갈 수 있나」다. 잔액은 이미 쓴 금액을 뺀
 * 값이므로 잔액과 견주는 쪽은 뒤쪽이고, 게이지도 그것으로 그린다.
 */
export function AccountAllocationSection({
  allocation,
  credits,
}: {
  allocation: OpenRouterAccountAllocation
  credits: OpenRouterAccountCredits
}) {
  const judgement = evaluateAllocation({ allocation, credits })
  const note = ALLOCATION_NOTES[judgement.state]
  return (
    <section className="space-y-4 rounded-panel border border-stroke-subtle bg-surface-card p-4">
      <h2 className="text-sm font-semibold text-foreground-primary">배정 현황</h2>
      <BudgetGauge
        label="남은 배정 대비 잔액"
        usedLabel={formatUsd(judgement.remaining)}
        limitLabel={judgement.balance == null ? null : formatUsd(judgement.balance)}
        ratio={
          judgement.balance == null || judgement.balance <= 0
            ? null
            : judgement.remaining / judgement.balance
        }
        note={judgement.balance == null || judgement.balance <= 0 ? (note ?? undefined) : undefined}
        freshness={
          credits.observedAt ? `잔액 관측 ${formatRelative(credits.observedAt)}` : undefined
        }
      />
      {judgement.balance != null && judgement.balance > 0 && note ? (
        <MessageBar variant="warning">{note}</MessageBar>
      ) : null}
      <DescriptionList
        items={[
          {
            term: '배정 합계',
            description: `${formatUsd(judgement.committed)} (키 ${allocation.committedKeyCount}개)`,
          },
          { term: '남은 배정', description: formatUsd(judgement.remaining) },
          { term: '사용액', description: formatUsd(allocation.committedUsage) },
          ...(judgement.windowCommitment > 0
            ? [
                {
                  term: '창마다 다시 채워지는 몫',
                  description: `${formatUsd(judgement.windowCommitment)}. 배정 합계에 포함되어 있고 리셋 창마다 한도가 되살아납니다.`,
                },
              ]
            : []),
          ...(allocation.awaitingProvisionKeyCount > 0
            ? [
                {
                  term: '발급 대기',
                  description: `${allocation.awaitingProvisionKeyCount}개. 승인은 났고 아직 발급되지 않았으며 배정 합계에는 이미 들어 있습니다.`,
                },
              ]
            : []),
          ...(allocation.usageUnreportedKeyCount > 0
            ? [
                {
                  term: '사용액 미보고',
                  description: `${allocation.usageUnreportedKeyCount}개. 그만큼의 남은 배정은 실측이 아니라 한도 전액으로 셉니다.`,
                },
              ]
            : []),
        ]}
      />
      {credits.unmanagedSpend != null ? (
        <p className="text-xs text-foreground-secondary">
          이 잔액에서는 Pickle이 발급하지 않은 키의 지출 {formatUsd(credits.unmanagedSpend)}도 함께
          빠져나갔습니다. 위 두 수에는 들어 있지 않습니다.
        </p>
      ) : null}
    </section>
  )
}

/**
 * 승인과 한도 변경이 함께 쓰는 초과 배정 경고.
 *
 * 막지 않는다. 대부분 한도를 다 쓰지 않으므로 의도적인 초과 배정은 정당한 운영
 * 판단이고, 여기서 하는 일은 승인자가 그 판단을 하고 있다는 것을 알게 하는 것뿐이다.
 * 잔액을 한 번도 관측하지 못한 계정은 경고가 아니라 안내다 — 우리 관측이 없는 것이지
 * 잔액이 없는 것이 아니고, 그 이유로 승인을 붙잡으면 방금 등록한 계정을 못 쓴다.
 */
export function AllocationWarning({
  judgement,
  pendingLabel,
}: {
  judgement: AllocationJudgement
  /** 지금 부여하려는 금액의 표기. 없으면 이번 분을 따로 적지 않는다. */
  pendingLabel?: string
}) {
  if (!judgement.warns) return null
  const note = ALLOCATION_NOTES[judgement.state]
  return (
    <MessageBar
      variant={judgement.state === 'UNKNOWN' ? 'info' : 'warning'}
      title={judgement.state === 'UNKNOWN' ? '잔액을 확인하지 못했습니다' : '초과 배정'}
    >
      <div className="space-y-1">
        <p>{note}</p>
        <ul className="space-y-0.5">
          <li>
            남은 배정 {formatUsd(judgement.remaining)}
            {pendingLabel ? ` + 이번 승인 ${pendingLabel}` : null}
            {' = '}
            {formatUsd(judgement.projected)}
          </li>
          <li>
            잔액 {formatUsd(judgement.balance)}
            {judgement.observedAt ? ` (${formatRelative(judgement.observedAt)} 관측)` : null}
          </li>
          {judgement.committed !== judgement.remaining ? (
            <li className="text-foreground-secondary">
              배정 합계는 {formatUsd(judgement.committed)}입니다.
            </li>
          ) : null}
          {judgement.windowCommitment > 0 ? (
            <li className="text-foreground-secondary">
              이 중 {formatUsd(judgement.windowCommitment)}는 리셋 창마다 다시 채워집니다.
            </li>
          ) : null}
        </ul>
      </div>
    </MessageBar>
  )
}
