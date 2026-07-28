import { describe, expect, test } from 'vitest'
import {
  passwordByteLength,
  passwordRuleError,
  passwordRuleStatus,
  passwordStrength,
  PASSWORD_MIN_LENGTH,
} from './validation'

describe('passwordRuleStatus — 서버 구조 규칙 미러', () => {
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

  test('이메일 로컬 파트가 4자 이상이고 포함되면 미충족', () => {
    expect(passwordRuleStatus('Example-4321!', 'example@pusan.ac.kr').noEmail).toBe(false)
    expect(passwordRuleStatus('other-4321!', 'example@pusan.ac.kr').noEmail).toBe(true)
    // 3자 로컬 파트는 검사하지 않는다.
    expect(passwordRuleStatus('abc-12345!', 'abc@pusan.ac.kr').noEmail).toBe(true)
    // 이메일을 넘기지 않으면 항상 충족.
    expect(passwordRuleStatus('example-4321!').noEmail).toBe(true)
  })
})

describe('passwordRuleError', () => {
  test('규칙을 모두 만족하면 null', () => {
    expect(passwordRuleError('bright-otter-42', 'example@pusan.ac.kr')).toBeNull()
  })

  test('길이 → 바이트 → 반복 → 연속 → 이메일 순으로 첫 위반을 알린다', () => {
    expect(passwordRuleError('short')).toBe('비밀번호는 8자 이상 72자 이하여야 합니다.')
    expect(passwordRuleError('가'.repeat(25))).toContain('72바이트')
    expect(passwordRuleError('ababababab')).toBe('같은 문자가 반복되는 비밀번호는 사용할 수 없습니다.')
    expect(passwordRuleError('abcdefgh')).toBe(
      '연속된 문자·숫자로만 이루어진 비밀번호는 사용할 수 없습니다.',
    )
    expect(passwordRuleError('example-4321!', 'example@pusan.ac.kr')).toBe(
      '이메일 주소가 포함된 비밀번호는 사용할 수 없습니다.',
    )
  })
})

describe('passwordStrength', () => {
  test('구조 규칙 위반이나 짧은 비밀번호는 0', () => {
    expect(passwordStrength('short')).toBe(0)
    expect(passwordStrength('ababababab')).toBe(0)
    expect(passwordStrength('abcdefgh')).toBe(0)
  })

  test('길이와 문자 종류가 늘수록 점수가 오른다', () => {
    expect(passwordStrength('otterlamp')).toBe(0) // 9자, 소문자 1종
    expect(passwordStrength('otterlamp429')).toBe(2) // 12자 + 2종
    expect(passwordStrength('Otter-Lamp-429-fig')).toBe(3) // 16자 이상 + 4종
  })
})
