import type { LlmAccountImpactProjection } from '../../api/queries'
import { formatDateTimeSeconds } from '../../lib/format'
import { formatUsd } from '../../lib/openrouter-credits'
import { isExactTokenCount, UNKNOWN_TOKEN_VALUE } from '../../lib/token-presentation'
import { DescriptionList, MessageBar } from '../ui'

function count(value: number) { return isExactTokenCount(value) ? value.toLocaleString('ko-KR') : UNKNOWN_TOKEN_VALUE }
const FRESHNESS = { FRESH: '최근 관측', STALE: '관측 지연', UNKNOWN: '미확인' }

/** Render the server snapshot only. This component never computes a replacement budget. */
export function AccountImpactView({ projection }: { projection: LlmAccountImpactProjection | null | undefined }) {
  if (!projection || projection.state === 'NOT_PROVIDED') return <MessageBar>계정별 배정 영향이 제공되지 않았어요.</MessageBar>
  if (projection.state === 'NOT_APPLICABLE') return null
  if (!projection.accounts) return <MessageBar variant="warning">계정별 변경 전후 값을 확인하지 못했어요.</MessageBar>
  return <section className="space-y-3" aria-label="계정별 배정 영향">
    <h3 className="font-semibold">계정별 배정 영향</h3>
    <p className="text-xs text-foreground-muted">{formatDateTimeSeconds(projection.observedAt)} 기준</p>
    {projection.accounts.map((account) => <section key={account.accountId} className="space-y-3 rounded-panel border border-stroke-subtle p-3">
      <h4 className="font-semibold">{account.accountName} · 변경 대상 {count(account.changedKeys)}개</h4>
      <DescriptionList columns={2} items={[
        { term: '명목 배정 합계', description: `${formatUsd(account.before.committedCreditLimit)} → ${formatUsd(account.after.committedCreditLimit)}` },
        { term: '남은 배정(추정)', description: `${formatUsd(account.before.remainingCommitment)} → ${formatUsd(account.after.remainingCommitment)}` },
        { term: '관측 잔액', description: formatUsd(account.balance) },
        { term: '잔액 마지막 성공', description: account.quality.creditsLastSuccessAt ? formatDateTimeSeconds(account.quality.creditsLastSuccessAt) : '미보고' },
        { term: '계정 잔액 / 키 대사 상태', description: `${FRESHNESS[account.quality.creditsFreshness]} / ${FRESHNESS[account.quality.keyMetersFreshness]}` },
        { term: '키 대사 마지막 성공', description: account.quality.keyMetersLastSuccessAt ? formatDateTimeSeconds(account.quality.keyMetersLastSuccessAt) : '미보고' },
        { term: '발급 대기 키', description: `${count(account.quality.beforeAwaitingProvisionKeys)} → ${count(account.quality.afterAwaitingProvisionKeys)}` },
        { term: '사용액 미보고 키', description: `${count(account.quality.beforeUsageUnreportedKeys)} → ${count(account.quality.afterUsageUnreportedKeys)}` },
      ]} />
      <details><summary className="cursor-pointer text-sm">리셋 주기별 명목 배정 비교</summary>
        <DescriptionList columns={2} items={[
          { term: '총액', description: `${formatUsd(account.before.committedTotalCap)} → ${formatUsd(account.after.committedTotalCap)}` },
          { term: '매일', description: `${formatUsd(account.before.committedDaily)} → ${formatUsd(account.after.committedDaily)}` },
          { term: '매주', description: `${formatUsd(account.before.committedWeekly)} → ${formatUsd(account.after.committedWeekly)}` },
          { term: '매월', description: `${formatUsd(account.before.committedMonthly)} → ${formatUsd(account.after.committedMonthly)}` },
        ]} />
      </details>
      {account.overAllocated === true && <MessageBar variant="warning" title="초과 배정">변경 후 남은 배정이 잔액을 넘어요.</MessageBar>}
      {account.overAllocated == null && <MessageBar>현재 자료로 변경 후 배정과 잔액을 비교할 수 없어요.</MessageBar>}
      {account.quality.periodBasisMismatch && <MessageBar variant="warning">리셋 주기가 달라 남은 배정을 비교할 수 없어요.</MessageBar>}
      {account.balanceError && <MessageBar variant="warning">최근 잔액 확인에 실패했어요. 마지막 성공 관측값을 표시해요.</MessageBar>}
      {account.quality.keyMetersError && <MessageBar variant="warning">최근 키 대사에 실패했어요.</MessageBar>}
    </section>)}
  </section>
}
