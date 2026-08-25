import { describe, expect, test } from 'vitest'
import {
  passwordByteLength,
  passwordRuleError,
  passwordRuleStatus,
  passwordStrength,
  PASSWORD_MIN_LENGTH,
} from './validation'

describe('passwordRuleStatus — 서버 규칙 미러', () => {
  test('길이 경계: 7자는 미충족, 8자는 충족', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
    expect(passwordRuleStatus('ab3d5f7').length).toBe(false)
    expect(passwordRuleStatus('ab3d5f7g').length).toBe(true)
  })

  test('72자는 충족, 73자는 미충족', () => {
    const base = 'aB3'.repeat(24) // 72자
    expect(base).toHaveLength(72)
    expect(passwordRuleStatus(base).length).toBe(true)
    expect(passwordRuleStatus(base + 'x').length).toBe(false)
  })

  test('한글 25자는 글자 수는 통과하지만 UTF-8 72바이트를 넘겨 미충족', () => {
    const korean = '가'.repeat(25)
    expect(passwordByteLength(korean)).toBe(75)
    expect(passwordRuleStatus(korean).length).toBe(true)
    expect(passwordRuleStatus(korean).byteLimit).toBe(false)
    // 24자(72바이트)는 경계 안쪽.
    expect(passwordRuleStatus('가'.repeat(24)).byteLimit).toBe(true)
  })

  test('서로 다른 문자가 2종 이하이면 반복 규칙 미충족', () => {
    expect(passwordRuleStatus('ababababab').noRepetition).toBe(false)
    expect(passwordRuleStatus('aAaAaAaAaA').noRepetition).toBe(false) // 소문자화 후 1종
    expect(passwordRuleStatus('abcabcabc').noRepetition).toBe(true)
  })

  test('영숫자만 남긴 형태가 6자 이상이면서 전부 오름/내림차순이면 미충족', () => {
    expect(passwordRuleStatus('abcdef').noSequence).toBe(false)
    expect(passwordRuleStatus('a-b-c-d-e-f').noSequence).toBe(false) // 기호 제거 후 판정
    expect(passwordRuleStatus('987654').noSequence).toBe(false)
    expect(passwordRuleStatus('abcde').noSequence).toBe(true) // 5자는 검사 대상 아님
    expect(passwordRuleStatus('abcdeg').noSequence).toBe(true)
  })

  test('규칙은 이 네 가지가 전부다', () => {
    // 차단목록과 이메일 포함 검사가 폐기되면서 미러할 규칙이 줄었다. 목록이
    // 다시 늘어나면 서버와 어긋난 것이므로 여기서 먼저 걸린다.
    expect(Object.keys(passwordRuleStatus('bright-otter-42')).sort()).toEqual([
      'byteLimit',
      'length',
      'noRepetition',
      'noSequence',
    ])
  })
})

describe('passwordRuleError', () => {
  test('규칙을 모두 만족하면 null', () => {
    expect(passwordRuleError('bright-otter-42')).toBeNull()
  })

  test('이메일을 포함해도, 유출 코퍼스에 있어도 더는 막지 않는다', () => {
    expect(passwordRuleError('example-4321!')).toBeNull()
    expect(passwordRuleError('qwerty1234')).toBeNull()
  })

  test('길이 → 바이트 → 반복 → 연속 순으로 첫 위반을 알린다', () => {
    expect(passwordRuleError('short')).toBe('비밀번호는 8자 이상 72자 이하여야 합니다.')
    expect(passwordRuleError('가'.repeat(25))).toContain('72바이트')
    expect(passwordRuleError('ababababab')).toBe('같은 문자가 반복되는 비밀번호는 사용할 수 없습니다.')
    expect(passwordRuleError('abcdefgh')).toBe(
      '연속된 문자·숫자로만 이루어진 비밀번호는 사용할 수 없습니다.',
    )
  })
})

describe('passwordStrength', () => {
  test('구조 규칙 위반이나 짧은 비밀번호는 0', () => {
    expect(passwordStrength('short')).toBe(0)
    expect(passwordStrength('ababababab')).toBe(0)
    expect(passwordStrength('abcdefgh')).toBe(0)
  })

  test('길이가 점수를 끌고 문자 종류는 거들기만 한다', () => {
    expect(passwordStrength('otterlamp')).toBe(0) // 9자 — 길이 점수 없음
    expect(passwordStrength('otterlamp429')).toBe(1) // 12자, 2종
    expect(passwordStrength('Otter-Lamp-429-fig')).toBe(3) // 16자 이상 + 4종
  })

  test('12자 미만은 문자 종류가 아무리 많아도 강함이 될 수 없다', () => {
    expect(passwordStrength('Ab3!Cd5?')).toBe(1) // 8자, 4종
  })

  test('서로 다른 문자가 6종 미만이면 약함에 묶인다', () => {
    // 12자에 4종이라 예전 공식으로는 '강함'이었지만 실제로 쓰인 문자는 4개다.
    expect(passwordStrength('aaaAAA111!!!')).toBe(1)
  })
})
