import { Link } from 'react-router'
import type { OpenRouterAccount } from '../../api/queries'
import { accountKeysPath } from '../../lib/llm-exploration'
import { isExactTokenCount } from '../../lib/token-presentation'
import { ObservationMoment } from '../OpenRouterCredits'
import { MessageBar } from '../ui'

export function AccountKeyNavigation({ account }: { account: OpenRouterAccount }) {
  const navigation = account.keyNavigation
  if (!navigation || navigation.population !== 'CURRENT_READABLE_KEYS') return <MessageBar>현재 읽을 수 있는 키군 탐색 정보가 제공되지 않았습니다.</MessageBar>
  const rows = [
    ['linked', '연결된 키', 'ALL'],
    ['committed', '현재 금액 배정', 'COMMITTED'],
    ['awaitingProvision', '유료 모델 발급 대기', 'AWAITING_PROVISION'],
    ['usageUnreported', '현재창 사용액 미보고', 'USAGE_UNREPORTED'],
  ] as const
  return <section className="space-y-3 rounded-panel border border-stroke-subtle bg-surface-card p-4">
    <h2 className="type-section-title">읽을 수 있는 키군 탐색</h2>
    <p className="text-sm text-foreground-muted">현재 권한으로 읽는 키 행입니다. 계정 전체의 배정 합계나 승인 후 키 생성 대기 계획, 기간별 소비 키와는 모집단이 다릅니다.</p>
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{rows.map(([field, label, cohort]) => {
      const count = navigation[field]
      const available = count.state === 'AVAILABLE' && count.totalElements != null && isExactTokenCount(count.totalElements)
      return <div key={field}><dt className="text-sm text-foreground-muted">{label}</dt><dd>
        {available ? <Link className="font-semibold text-brand-foreground underline" to={accountKeysPath(account.id, account.orgId, cohort)}>
          {count.totalElements!.toLocaleString('ko-KR')}개 전체 탐색
        </Link> : '제공되지 않음'}
      </dd></div>
    })}</dl>
    <p className="text-xs text-foreground-muted"><ObservationMoment value={navigation.observedAt} /> 조회</p>
  </section>
}
