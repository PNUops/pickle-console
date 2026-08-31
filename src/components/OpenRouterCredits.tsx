import type {
  AdminLlmKeyDetail,
  AdminLlmKeySummary,
  OpenRouterAccountCredits,
  OpenRouterCreditsFreshness,
} from '../api/queries'
import { formatDateTime, formatRelative } from '../lib/format'
import {
  FORECAST_REASON_LABELS,
  FRESHNESS_LABELS,
  UNMANAGED_REASON_LABELS,
  VENDOR_ERROR_LABELS,
  formatUsd,
} from '../lib/openrouter-credits'
import { Badge, DescriptionList, MessageBar, type BadgeVariant } from './ui'

const FRESHNESS_VARIANTS: Record<OpenRouterCreditsFreshness, BadgeVariant> = {
  FRESH: 'success',
  STALE: 'warning',
  UNKNOWN: 'neutral',
}

export function ObservationMoment({
  value,
  empty = '기록 없음',
}: {
  value: string | null | undefined
  empty?: string
}) {
  if (!value) return <span>{empty}</span>
  return (
    <time dateTime={value} title={`${formatDateTime(value)} KST`}>
      <span>{formatRelative(value)}</span>
      <span className="block text-xs text-foreground-muted">{formatDateTime(value)} KST</span>
    </time>
  )
}

export function CreditsFreshnessBadge({ freshness }: { freshness: OpenRouterCreditsFreshness }) {
  return <Badge variant={FRESHNESS_VARIANTS[freshness]}>{FRESHNESS_LABELS[freshness]}</Badge>
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
          <h2 className="type-section-title">Credits 관측</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            화면은 DB cache만 읽습니다. 금액과 key 대사는 각 관측 시각을 기준으로 해석하세요.
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
        <h3 className="mb-3 font-semibold text-foreground-primary">Paired 미관리 지출</h3>
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
            { term: 'Baseline', description: <ObservationMoment value={credits.unmanagedBaselineAt} /> },
            { term: 'Paired credits 관측', description: <ObservationMoment value={credits.pairedCreditsObservedAt} /> },
            { term: 'Paired key 관측', description: <ObservationMoment value={credits.pairedKeysObservedAt} /> },
          ]}
        />
      </div>

      <div className="border-t border-stroke-subtle pt-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-foreground-primary">Key 대사 상태</h3>
          <CreditsFreshnessBadge freshness={credits.keysFreshness} />
        </div>
        {credits.keysError && (
          <MessageBar variant="warning" title="최근 key 대사 실패">
            {keysErrorLabel}. 마지막 성공 시각과 credits 관측은 서로 독립입니다.
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
