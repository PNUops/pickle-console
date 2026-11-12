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
      description={description ?? '한 줄에 하나씩 +허용, -차단을 적어요. 차단이 우선하며, 허용 규칙이 없으면 모든 유료 모델을 허용해요.'}
    >
      <Textarea
        rows={7}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  )
}
