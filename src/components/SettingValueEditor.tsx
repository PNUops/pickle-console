import type { components } from '../api/schema'
import type { SettingDraft } from '../lib/settings-value'
import { Checkbox, Input, Textarea } from './ui'

type SettingValueType = components['schemas']['SettingView']['valueType']

/** 운영 설정 값 편집 컨트롤 — valueType별 입력 위젯. */
export function SettingValueEditor({
  valueType,
  draft,
  onChange,
}: {
  valueType: SettingValueType
  draft: SettingDraft
  onChange: (draft: SettingDraft) => void
}) {
  switch (valueType) {
    case 'BOOLEAN':
      return (
        <Checkbox
          checked={draft === true}
          onChange={(event) => onChange(event.target.checked)}
          label={draft === true ? '활성' : '비활성'}
        />
      )
    case 'INTEGER':
    case 'NUMBER':
      return (
        <Input
          type="number"
          step={valueType === 'INTEGER' ? 1 : 'any'}
          value={String(draft)}
          onChange={(event) => onChange(event.target.value)}
          className="w-44"
        />
      )
    case 'STRING':
      return (
        <Input
          value={String(draft)}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    case 'JSON':
      return (
        <Textarea
          rows={5}
          className="font-mono text-xs"
          value={String(draft)}
          onChange={(event) => onChange(event.target.value)}
        />
      )
  }
}
