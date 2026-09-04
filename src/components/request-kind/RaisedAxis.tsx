import { Checkbox, FormField, Input, Textarea } from '../ui'

/**
 * 직접 입력에서 축 하나를 늘리는 줄.
 *
 * 기본값은 언제나 칸에 들어 있고 잠겨 있다. **바꿀 수 있는 것과 지금 값이 무엇인지가
 * 한 자리에서 보여야 한다**: 칸을 감춰 두면 아무것도 늘리지 않았을 때 이 신청이 어떤
 * 사양인지가 화면 어디에도 없다.
 *
 * 「변경」을 켜야 칸이 풀리고 그 축의 이유가 나온다. 체크와 값과 이유가 한 묶음인
 * 것이 요점이다. 사유가 축 밖에 하나만 있으면 메모리가 필요한 이유를 적고 vCPU까지
 * 함께 올릴 수 있고, 검토하는 쪽은 그 글로 어느 축이 근거를 가진 것인지 가릴 수 없다.
 */
export function RaisedAxis({
  label,
  unit,
  checked,
  onToggle,
  min,
  step = 1,
  decimals = 0,
  value,
  onValue,
  valueError,
  reason,
  onReason,
  reasonError,
  reasonPlaceholder,
}: {
  label: string
  unit: string
  checked: boolean
  onToggle: (on: boolean) => void
  min: number
  /** 입력 눈금. 메모리처럼 소수를 받는 축은 0.5로 준다. */
  step?: number
  /** 잠긴 채 보여 줄 때의 소수 자릿수. 소수를 받는 축임을 기본값으로 말해 준다. */
  decimals?: number
  value: number
  onValue: (value: number) => void
  valueError?: string
  reason: string
  onReason: (value: string) => void
  reasonError?: string
  reasonPlaceholder: string
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border-default p-4">
      <div className="flex items-end gap-4">
        <FormField
          label={`${label} (${unit})`}
          required={checked}
          error={valueError}
          className="flex-1"
        >
          <Input
            type="number"
            min={min}
            step={step}
            // 잠겨 있을 때만 자릿수를 맞춰 보여 준다. 켠 뒤에도 매 렌더에서 다시
            // 서식을 입히면 두 자리째를 치는 순간 앞자리가 잘려 나간다.
            value={checked ? value : value.toFixed(decimals)}
            disabled={!checked}
            onChange={(event) => onValue(Number(event.target.value))}
          />
        </FormField>
        <div className="pb-2">
          <Checkbox
            label="변경"
            // 세 축의 체크박스가 모두 「변경」이라, 읽어 주는 이름에는 어느 축인지 넣는다.
            aria-label={`${label} 변경`}
            checked={checked}
            onChange={(event) => onToggle(event.target.checked)}
          />
        </div>
      </div>
      {checked && (
        <FormField label="요청 사유" required error={reasonError}>
          <Textarea
            value={reason}
            onChange={(event) => onReason(event.target.value)}
            // 세 축의 칸이 모두 「요청 사유」라, 읽어 주는 이름에는 어느 축인지 넣는다.
            aria-label={`${label} 요청 사유`}
            maxLength={2000}
            rows={2}
            placeholder={reasonPlaceholder}
          />
        </FormField>
      )}
    </div>
  )
}
