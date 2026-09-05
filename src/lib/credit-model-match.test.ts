import { describe, expect, test } from 'vitest'
import {
  isCreditModelUsable,
  matchesCreditModel,
  suggestCreditModelPatterns,
} from './credit-model-match'

/**
 * 아래 표는 게이트웨이와 공유하는 판정 계약을 그대로 옮긴 것이다. 한 줄을 고치려면
 * 정본 표를 먼저 고치고 양쪽을 함께 옮겨야 한다. 여기만 고치면 화면이 세는 수와
 * 실제로 통과하는 요청이 갈라진다.
 */
const CASES: [pattern: string, name: string, matches: boolean, why: string][] = [
  ['openai/gpt-4o-mini', 'openai/gpt-4o-mini', true, '정확'],
  ['openai/gpt-4o-mini', 'openai/gpt-4o', false, '정확'],
  ['openai/*', 'openai/gpt-4o', true, '벤더 전체'],
  ['openai/*', 'openai-mirror/gpt-4o', false, '벤더 경계'],
  ['openai/*', 'openai/', false, 'rest 가 빔'],
  ['openai/gpt-5-*', 'openai/gpt-5-pro', true, '끝-별 접두'],
  ['openai/gpt-5-*', 'openai/gpt-5', true, '끝-별, 구분자 뗀 자기 이름'],
  ['openai/gpt-5-*', 'openai/gpt-5:batch', false, '접두도 자기 이름도 아님'],
  ['openai/gpt-5*', 'openai/gpt-5:batch', true, '구분자 없는 끝-별'],
  ['openai/gpt-5-*', 'openai/gpt-4o', false, '접두 불일치'],
  ['openai/*-pro', 'openai/gpt-5-pro', true, '시작-별'],
  ['openai/*-pro', 'openai/gpt-5-pro:batch', true, '변형 인식'],
  ['openai/*-pro', 'openai/gpt-5-pro:free', true, '변형 인식'],
  ['openai/*-pro', 'openai/gpt-5-nano', false, '꼬리 불일치'],
  ['openai/*-pro', 'openai/pro', false, '시작-별은 자기 이름을 안 잡음'],
  ['openai/*-pro', 'anthropic/claude-opus-pro', false, '벤더 불일치'],
  ['openai/gpt-5*', 'openai/gpt-5', true, '별이 빈 문자열을 먹는다'],
  ['*', '*', false, '이름이 * 인 모델이 합성돼도 막는다'],
  ['pickle-general', 'pickle-general', true, '벤더 없는 이름'],
]

describe('matchesCreditModel', () => {
  test.each(CASES)('%s 는 %s 를 %s (%s)', (pattern, name, matches) => {
    expect(matchesCreditModel(pattern, name)).toBe(matches)
  })

  test('대문자로 적어도 같은 답을 낸다', () => {
    expect(matchesCreditModel('OpenAI/*', 'openai/GPT-4o')).toBe(true)
  })
})

describe('isCreditModelUsable', () => {
  const name = 'openai/gpt-5-pro'

  test('두 목록이 비면 제한이 없다', () => {
    expect(isCreditModelUsable(name, [], [])).toBe(true)
  })

  test('허용만 있으면 허용에 맞아야 통과한다', () => {
    expect(isCreditModelUsable(name, ['openai/*'], [])).toBe(true)
    expect(isCreditModelUsable(name, ['anthropic/*'], [])).toBe(false)
  })

  test('차단만 있으면 차단에 안 맞아야 통과한다', () => {
    expect(isCreditModelUsable(name, [], ['anthropic/*'])).toBe(true)
    expect(isCreditModelUsable(name, [], ['openai/*-pro'])).toBe(false)
  })

  test('차단이 허용을 이긴다', () => {
    expect(isCreditModelUsable(name, ['openai/*'], ['openai/*-pro'])).toBe(false)
    expect(isCreditModelUsable('openai/gpt-5-nano', ['openai/*'], ['openai/*-pro'])).toBe(true)
  })

  // 변형까지 걷어내지 못하면 반값 변형이 차단을 그대로 통과한다. 승인자는 비싼
  // 모델을 막았다고 믿는데 열려 있는 자리다.
  test('차단이 변형까지 걷어낸다', () => {
    expect(isCreditModelUsable('openai/gpt-5-pro:batch', ['openai/*'], ['openai/*-pro'])).toBe(
      false,
    )
  })
})

describe('suggestCreditModelPatterns', () => {
  test('벤더 전체와 계열과 티어를 뽑는다', () => {
    expect(suggestCreditModelPatterns('openai/gpt-5-pro')).toEqual([
      { pattern: 'openai/*', kind: '벤더 전체' },
      { pattern: 'openai/gpt-5-*', kind: '계열' },
      { pattern: 'openai/*-pro', kind: '티어' },
    ])
  })

  // 변형에서 계열을 뽑으면 그 변형만 여는 패턴이 나와서 고른 사람이 뜻한 계열과 다르다.
  test('변형 꼬리를 떼고 뽑는다', () => {
    expect(suggestCreditModelPatterns('openai/gpt-5-pro:batch')).toEqual(
      suggestCreditModelPatterns('openai/gpt-5-pro'),
    )
  })

  test('벤더 없는 이름과 구분자 없는 이름은 계열이 없다', () => {
    expect(suggestCreditModelPatterns('pickle-general')).toEqual([])
    expect(suggestCreditModelPatterns('openai/o1')).toEqual([
      { pattern: 'openai/*', kind: '벤더 전체' },
    ])
  })

  // 제안 옆에 붙는 개수가 이 셈이다. 변형 인식이 빠지면 반값 변형이 빠진 수를
  // 보여 주고, 승인자는 자기가 무엇을 여는지 모른 채 고른다.
  test('뽑은 패턴이 잡는 개수를 변형까지 세어 낸다', () => {
    const catalogue = [
      'openai/gpt-5-pro',
      'openai/gpt-5-pro:batch',
      'openai/gpt-5-nano',
      'openai/gpt-5',
      'anthropic/claude-opus-pro',
    ]
    const count = (pattern: string) =>
      catalogue.filter((name) => matchesCreditModel(pattern, name)).length
    const [vendor, family, tier] = suggestCreditModelPatterns('openai/gpt-5-pro')
    expect(count(vendor.pattern)).toBe(4)
    expect(count(family.pattern)).toBe(4)
    expect(count(tier.pattern)).toBe(2)
  })
})
