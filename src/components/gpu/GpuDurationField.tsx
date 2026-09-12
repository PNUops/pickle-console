import { FormField, Input, Select } from '../ui'
import type { GpuDurationUnit } from '../../lib/gpu-duration'

export function GpuDurationField({ label, value, unit, onValueChange, onUnitChange, error }: {
  label: string
  value: string
  unit: GpuDurationUnit
  onValueChange: (value: string) => void
  onUnitChange: (unit: GpuDurationUnit) => void
  error?: string
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-3">
      <FormField label={label} required error={error}>
        <Input type="number" min={1} step={1} value={value} onChange={(event) => onValueChange(event.target.value)} />
      </FormField>
      <FormField label="기간 단위">
        <Select value={unit} onChange={(event) => onUnitChange(event.target.value === 'days' ? 'days' : 'hours')}>
          <option value="hours">시간</option>
          <option value="days">일</option>
        </Select>
      </FormField>
    </div>
  )
}
