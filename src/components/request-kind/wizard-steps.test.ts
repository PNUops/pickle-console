import { describe, expect, test } from 'vitest'
import {
  COMMON_FIELDS,
  fieldLabels,
  parseStepId,
  routeServerErrors,
  slotsFor,
  ALL_STEPS,
  type FieldSlot,
} from './wizard-steps'

const VM_FIELDS: Record<string, FieldSlot> = {
  ...COMMON_FIELDS,
  'vm.desiredSlug': { label: '호스트 이름', step: 'resource' },
  'vm.imageId': { label: 'OS', step: 'resource' },
  'vm.specReason': { label: '사양 사유', step: 'resource' },
}

describe('ALL_STEPS', () => {
  // 종류 고르기는 위저드 앞의 화면이므로, 진입 경로가 단계 수를 바꾸지 않는다.
  test('진입과 무관하게 세 단계다', () => {
    expect(ALL_STEPS).toEqual(['resource', 'request', 'review'])
  })
})

describe('parseStepId', () => {
  test('모르는 값과 접힌 단계는 첫 단계로 떨어진다', () => {
    const steps = ALL_STEPS
    expect(parseStepId('request', steps)).toBe('request')
    // 옛 링크의 서수도, 단계에서 빠진 종류 고르기도 모르는 값이다.
    expect(parseStepId('3', steps)).toBe('resource')
    expect(parseStepId('kind', steps)).toBe('resource')
    expect(parseStepId(null, steps)).toBe('resource')
  })
})

describe('routeServerErrors', () => {
  const steps = ALL_STEPS

  test('종류가 얹은 필드도 자기 단계로 되돌린다', () => {
    expect(routeServerErrors({ 'vm.desiredSlug': '이미 사용 중인 이름입니다.' }, VM_FIELDS, steps))
      .toBe('resource')
  })

  test('두 단계에 걸치면 앞선 단계로 되돌린다', () => {
    const routed = routeServerErrors(
      { purpose: '사용 목적을 입력해 주세요.', 'vm.imageId': 'OS를 선택해 주세요.' },
      VM_FIELDS,
      steps,
    )
    expect(routed).toBe('resource')
  })

  // 새 서버가 이 콘솔이 모르는 필드를 보내는 경우. 되돌릴 곳이 없으므로 요약이 든다.
  test('표에 없는 필드는 어느 단계도 가리키지 않는다', () => {
    expect(routeServerErrors({ 'vm.somethingNew': '알 수 없음' }, VM_FIELDS, steps)).toBeNull()
    expect(routeServerErrors({}, VM_FIELDS, steps)).toBeNull()
  })

  test('접힌 단계의 필드는 되돌릴 대상이 아니다', () => {
    expect(routeServerErrors({ type: '아직 신청할 수 없는 종류입니다.' }, VM_FIELDS, steps)).toBeNull()
  })
})

describe('slotsFor', () => {
  test('그 단계에 자리가 있는 필드만 돌려준다', () => {
    const slots = slotsFor('resource', VM_FIELDS)
    expect(slots).toContain('vm.desiredSlug')
    expect(slots).toContain('displayName')
    expect(slots).not.toContain('purpose')
  })
})

describe('fieldLabels', () => {
  test('원시 경로가 아니라 한국어 이름을 준다', () => {
    expect(fieldLabels(VM_FIELDS)['vm.desiredSlug']).toBe('호스트 이름')
  })
})
