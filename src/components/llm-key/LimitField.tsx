import { FormField, Input } from '../ui'
import { TokenInputHint } from '../TokenValue'

/** One integer limit of an LLM key. Empty means the default the description names. */
export function LimitField({
  label,
  min,
  value,
  onChange,
  error,
  tokens = false,
}: {
  label: string
  min: 0 | 1
  value: string
  onChange: (value: string) => void
  error?: string
  tokens?: boolean
}) {
  return (
    <FormField
      label={label}
      error={error}
      description={min === 0 ? '0이면 자체 서빙 모델을 사용할 수 없고, 비우면 무제한이에요.' : '비우면 서비스 기본값을 따라요.'}
    >
      <Input
        type="number"
        min={min}
        aria-invalid={error != null}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {tokens && <TokenInputHint value={value} />}
    </FormField>
  )
}
