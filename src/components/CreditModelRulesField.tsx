import { creditModelRulesError, parseCreditModelRules } from '../lib/credit-model-allowlist'
import { FormField, Textarea } from './ui'

export function CreditModelRulesField({
  value,
  onChange,
  error,
  label = '유료 모델 허용·차단',
  description,
}: {
  value: string
  onChange: (value: string) => void
  error?: string
  label?: string
  description?: string
}) {
  const liveError = creditModelRulesError(parseCreditModelRules(value))
  return (
    <FormField
      label={label}
      error={liveError ?? error}
      description={description ?? "한 줄에 하나씩, 허용은 +, 차단은 -를 붙입니다. 차단이 허용보다 우선하며 줄 순서와 무관합니다. + 규칙이 없으면 금액 한도 안에서 모든 유료 모델을 허용하고, - 규칙이 없으면 차단하지 않습니다. 자체 서빙 모델에는 적용되지 않습니다. 공급자 전체는 +openai/*, 모든 공급자의 pro 모델 차단은 -*/*-pro처럼 적습니다. 공급자 *는 ~별칭도 포함합니다. 특정 공급자의 허용은 ~별칭을 따로 적고, 차단은 별칭에도 적용됩니다."}
    >
      <Textarea
        rows={7}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={'+openai/*\n+anthropic/*\n+google/*\n-*/*-pro'}
      />
    </FormField>
  )
}
