import { FormField, Input } from '../ui'

/** One integer limit of an LLM key. Empty means the default the description names. */
export function LimitField({
  label,
  min,
  value,
  onChange,
  error,
}: {
  label: string
  min: 0 | 1
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  return (
    <FormField
      label={label}
      error={error}
      description={min === 0 ? '0이면 토큰 축을 닫고, 비우면 무제한입니다.' : '비우면 서비스 기본값을 따릅니다.'}
    >
      <Input
        type="number"
        min={min}
        aria-invalid={error != null}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  )
}
