import type { components } from '../api/schema'
import { Checkbox, Input, Textarea } from './ui'

type SettingValueType = components['schemas']['SettingView']['valueType']

/**
 * 편집용 초안 값 — BOOLEAN은 boolean, 나머지는 입력 문자열로 다루고
 * 제출 시 `parseSettingValue`로 계약 타입에 맞게 변환·검증한다.
 */
export type SettingDraft = boolean | string

/** 현재 설정 값 → 편집 초안. */
export function draftOf(valueType: SettingValueType, value: unknown): SettingDraft {
  if (valueType === 'BOOLEAN') return value === true
  if (valueType === 'JSON') return JSON.stringify(value, null, 2)
  return value == null ? '' : String(value)
}

/** 편집 초안 → 제출 값. 실패 시 한국어 메시지를 돌려준다 (클라이언트 검증). */
export function parseSettingValue(
  valueType: SettingValueType,
  draft: SettingDraft,
): { ok: true; value: unknown } | { ok: false; message: string } {
  switch (valueType) {
    case 'BOOLEAN':
      return { ok: true, value: draft === true }
    case 'INTEGER': {
      const text = String(draft).trim()
      if (!/^-?\d+$/.test(text)) return { ok: false, message: '정수를 입력해 주세요.' }
      return { ok: true, value: Number(text) }
    }
    case 'NUMBER': {
      const num = Number(String(draft).trim())
      if (String(draft).trim() === '' || Number.isNaN(num)) {
        return { ok: false, message: '숫자를 입력해 주세요.' }
      }
      return { ok: true, value: num }
    }
    case 'STRING':
      return { ok: true, value: String(draft) }
    case 'JSON':
      try {
        return { ok: true, value: JSON.parse(String(draft)) }
      } catch {
        return { ok: false, message: '올바른 JSON 형식이 아닙니다.' }
      }
  }
}

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
