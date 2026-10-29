import { appendCreditModelRule, parseCreditModelRules } from '../lib/credit-model-allowlist'
import { useModelCatalogue } from '../lib/use-model-catalogue'
import { CreditModelPicker } from './CreditModelPicker'
import { CreditModelPreview } from './CreditModelPreview'
import { CreditModelRulesField } from './CreditModelRulesField'
import { ModelCatalogueStatus } from './ModelCatalogueStatus'

type PolicySnapshot = { allowed: readonly string[]; denied: readonly string[] }

function policyText(policy: PolicySnapshot) {
  return `허용: ${policy.allowed.length ? policy.allowed.join(', ') : '패턴 제한 없음'} / 차단: ${policy.denied.length ? policy.denied.join(', ') : '없음'}`
}

/** Compose the existing pattern editor, catalogue picker and draft matcher. */
export function CreditModelPolicyEditor({
  value, onChange, error, label, baseline, baselineLabel = '조회한 현재 정책',
}: {
  value: string
  onChange: (value: string) => void
  error?: string
  label?: string
  baseline?: PolicySnapshot
  baselineLabel?: string
}) {
  const state = useModelCatalogue()
  const parsed = parseCreditModelRules(value)
  const catalogue = state.canRead ? state.query.data : undefined
  return <div className="min-w-0 space-y-3">
    <CreditModelRulesField value={value} onChange={onChange} error={error} label={label} />
    {baseline && <div aria-label="모델 정책 변경안 비교" className="space-y-1 break-words rounded border border-line p-3 text-sm">
      <p>{baselineLabel}: {policyText(baseline)}</p>
      <p>작성 중인 변경안: {parsed.errors.length ? '입력 오류를 먼저 고쳐 주세요.' : policyText(parsed)}</p>
      <p className="text-xs text-foreground-muted">조회한 값과 입력안을 비교합니다. 저장 시점의 서버 변경 충돌 검사나 적용 완료 결과를 뜻하지 않습니다.</p>
    </div>}
    <ModelCatalogueStatus state={state} />
    {state.canRead && <>
      <CreditModelPicker catalogue={catalogue} failed={state.query.isError} allowed={parsed.allowed} denied={parsed.denied}
        onAdd={(pattern, list) => onChange(appendCreditModelRule(value, pattern, list))} />
      <CreditModelPreview catalogue={catalogue} failed={state.query.isError} allowed={parsed.allowed} denied={parsed.denied} invalid={parsed.errors.length > 0} />
    </>}
  </div>
}
