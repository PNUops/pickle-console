import { describe, expect, test } from 'vitest'
import {
  isCreditModelUsable,
  matchesCreditModel,
  suggestCreditModelPatterns,
} from './credit-model-match'

/**
 * 아래 표는 요청을 실제로 막는 게이트웨이의 케이스 표를 그대로 옮긴 30행이다.
 * 게이트웨이가 정본이므로 한 줄을 고치려면 그쪽을 먼저 고치고 여기로 옮긴다.
 * 여기만 고치면 화면이 세는 수와 실제로 통과하는 요청이 갈라진다.
 *
 * 표 사이를 대조하는 검사는 없다. 사람이 옮기는 것이 전부이고, 낡은 표의 모든
 * 케이스는 계속 초록이라 빠진 줄은 실패로 나타나지 않는다. 그래서 행을 줄이지
 * 않는 것이 이 파일에서 제일 중요한 규율이다.
 */
const CASES: [pattern: string, name: string, matches: boolean, why: string][] = [
  ['openai/gpt-4o-mini', 'openai/gpt-4o-mini', true, '정확'],
  ['openai/gpt-4o-mini', 'openai/gpt-4o', false, '정확'],
  ['openai/*', 'openai/gpt-4o', true, '벤더 전체'],
  ['openai/*', 'openai/a/b', true, '벤더 뒤는 통째로 모델 이름이다'],
  ['openai/gpt-5-*', 'openai/gpt-5-pro', true, '끝-별 접두'],
  ['openai/gpt-5-*', 'openai/gpt-5', true, '끝-별, 구분자 뗀 자기 이름'],
  ['openai/gpt-5-*', 'openai/gpt-5:batch', false, '접두도 자기 이름도 아님'],
  ['openai/gpt-5*', 'openai/gpt-5:batch', true, '구분자 없는 끝-별'],
  ['openai/gpt-5*', 'openai/gpt-5', true, '별이 빈 문자열을 먹는다'],
  ['openai/gpt-5-*', 'openai/gpt-4o', false, '접두 불일치'],
  ['openai/*-pro', 'openai/gpt-5-pro', true, '시작-별'],
  ['openai/*-pro', 'openai/gpt-5-pro:batch', true, '변형 인식'],
  ['openai/*-pro', 'openai/gpt-5-pro:free', true, '변형 인식'],
  ['openai/*-pro', 'openai/gpt-5-nano', false, '꼬리 불일치'],
  ['openai/*-pro', 'openai/pro', false, '시작-별은 자기 이름을 안 잡음'],
  ['openai/*-pro', 'anthropic/claude-opus-pro', false, '벤더 불일치'],
  ['pickle-general', 'pickle-general', true, '벤더 없는 이름'],
  ['openai/*', 'anthropic/claude', false, '다른 벤더'],
  ['openai/*', 'openai-mirror/gpt-4o', false, '이름이 같게 시작하는 벤더는 남이다'],
  ['openai/*', 'openai/', false, 'rest 가 빔'],
  ['*', 'openai/gpt-4o', false, '전부는 빈 목록으로 적는다'],
  ['*', '*', false, '이름이 * 인 모델이 합성돼도 막는다'],
  ['', 'openai/gpt-4o', false, '빈 패턴'],
  ['some-model', 'some-model', true, '벤더 없는 이름은 정확히 같을 때만'],
  [
    '~anthropic/claude-sonnet-latest',
    '~anthropic/claude-sonnet-latest',
    true,
    '별칭도 이름으로 적을 수 있다',
  ],
  ['~anthropic/*', '~anthropic/claude-sonnet-latest', true, '별칭 이름공간 전체'],
  ['anthropic/*', '~anthropic/claude-sonnet-latest', false, '벤더를 열어도 별칭은 안 열린다'],
  ['~anthropic/*', 'anthropic/claude-sonnet-4', false, '별칭을 열어도 벤더는 안 열린다'],
  ['~', '~anthropic/claude', false, '물결은 그 자체로 이름이 아니다'],
  ['~/*', '~anthropic/claude', false, '물결은 벤더 이름의 일부이지 벤더가 아니다'],
]

describe('matchesCreditModel', () => {
  test.each(CASES)('[%s] [%s] %s (%s)', (pattern, name, matches) => {
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
