import type { LlmAccountImpactProjection } from '../../api/queries'
import { formatDateTimeSeconds } from '../../lib/format'
import { formatUsd } from '../../lib/openrouter-credits'
import { isExactTokenCount, UNKNOWN_TOKEN_VALUE } from '../../lib/token-presentation'
import { DescriptionList, MessageBar } from '../ui'

function count(value: number) { return isExactTokenCount(value) ? value.toLocaleString('ko-KR') : UNKNOWN_TOKEN_VALUE }
const FRESHNESS = { FRESH: '최근 관측', STALE: '관측 지연', UNKNOWN: '미확인' }

/** Render the server snapshot only. This component never computes a replacement budget. */
export function AccountImpactView({ projection }: { projection: LlmAccountImpactProjection | null | undefined }) {
  if (!projection || projection.state === 'NOT_PROVIDED') return <MessageBar>계정별 배정 영향이 제공되지 않습니다. 대상별 저장 권한과 입력 검증은 별도로 적용됩니다.</MessageBar>
  if (projection.state === 'NOT_APPLICABLE') return null
  if (!projection.accounts) return <MessageBar variant="warning">계정별 변경 전후 값을 확인하지 못했습니다.</MessageBar>
  return <section className="space-y-3" aria-label="계정별 배정 영향">
    <h3 className="font-semibold">계정별 배정 영향</h3>
    <p className="text-xs text-foreground-muted">{formatDateTimeSeconds(projection.observedAt)} 서버 캐시 기준입니다. 잔액 예약·실측 상한·공급자 적용 완료를 뜻하지 않습니다.</p>
    {projection.accounts.map((account) => <section key={account.accountId} className="space-y-3 rounded-panel border border-stroke-subtle p-3">
      <h4 className="font-semibold">{account.accountName} · 변경 대상 {count(account.changedKeys)}개</h4>
      <DescriptionList columns={2} items={[
        { term: '명목 배정 합계', description: `${formatUsd(account.before.committedCreditLimit)} → ${formatUsd(account.after.committedCreditLimit)}` },
        { term: '캐시 기준 남은 배정', description: `${formatUsd(account.before.remainingCommitment)} → ${formatUsd(account.after.remainingCommitment)}` },
        { term: '관측 잔액', description: formatUsd(account.balance) },
        { term: '잔액 관측', description: account.balanceObservedAt ? formatDateTimeSeconds(account.balanceObservedAt) : '미보고' },
        { term: '잔액 마지막 성공', description: account.quality.creditsLastSuccessAt ? formatDateTimeSeconds(account.quality.creditsLastSuccessAt) : '미보고' },
        { term: '잔액 마지막 시도', description: account.quality.creditsLastAttemptAt ? formatDateTimeSeconds(account.quality.creditsLastAttemptAt) : '미보고' },
        { term: '계정 잔액 / 키 대사 상태', description: `${FRESHNESS[account.quality.creditsFreshness]} / ${FRESHNESS[account.quality.keyMetersFreshness]}` },
        { term: '키 대사 마지막 성공', description: account.quality.keyMetersLastSuccessAt ? formatDateTimeSeconds(account.quality.keyMetersLastSuccessAt) : '미보고' },
        { term: '키 대사 마지막 시도', description: account.quality.keyMetersLastAttemptAt ? formatDateTimeSeconds(account.quality.keyMetersLastAttemptAt) : '미보고' },
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
      {account.overAllocated === true && <MessageBar variant="warning" title="초과 배정">변경 후 캐시 기준 남은 배정이 관측 잔액을 넘습니다. 다른 키가 먼저 쓰면 나중 요청이 거절될 수 있습니다.</MessageBar>}
      {account.overAllocated == null && <MessageBar>현재 자료로 변경 후 배정과 잔액을 비교할 수 없습니다.</MessageBar>}
      {(account.quality.beforeUsageUnreportedKeys > 0 || account.quality.afterUsageUnreportedKeys > 0) && <MessageBar>미보고 키에는 해당 한도 전액을 대입했습니다. 계정 전체의 실측 또는 보장된 상한이 아닙니다.</MessageBar>}
      {account.quality.periodBasisMismatch && <MessageBar variant="warning">리셋 주기가 바뀌어 옛 창의 사용액으로 새 창의 남은 배정을 계산하지 않습니다.</MessageBar>}
      {account.quality.vendorWindowAlignmentUnconfirmed && <p className="text-xs text-foreground-muted">공급자 리셋 창의 정렬은 미확인입니다. 다음 대사 전에는 남은 배정이 작게 보일 수 있습니다.</p>}
      {account.balanceError && <MessageBar variant="warning">잔액의 최근 확인이 실패했습니다. 마지막 성공 관측값을 표시합니다.</MessageBar>}
      {account.quality.keyMetersError && <MessageBar variant="warning">키 대사의 최근 확인이 실패했습니다. 신선도와 마지막 성공 시각은 별도로 확인해 주세요.</MessageBar>}
    </section>)}
  </section>
}
