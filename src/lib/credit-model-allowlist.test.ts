import { describe, expect, test } from 'vitest'
import { creditModelsError, parseCreditModels } from './credit-model-allowlist'

// 같은 규칙이 여러 곳에 복사돼 있다. 이 파일은 콘솔 사본이 나머지와 어긋나지
// 않는지를 지킨다. 어긋나면 화면은 통과시키고 서버가 422 를 돌려주거나, 반대로
// 화면이 저장 가능한 값을 막는다.
describe('creditModelsError', () => {
  test('벤더 부동 별칭을 받는다', () => {
    for (const model of [
      '~anthropic/claude-sonnet-latest',
      '~openai/*',
      'openai/gpt-4o-mini',
      'anthropic/*',
    ]) {
      expect(creditModelsError([model], 'ALLOW')).toBeNull()
    }
  })

  // 이번에 열린 두 모양. 어느 쪽이든 별은 모델 세그먼트에만 하나 온다.
  test('앞뒤 와일드카드를 받는다', () => {
    for (const model of [
      'openai/gpt-5-*',
      'openai/gpt-5*',
      'openai/*-pro',
      'openai/*pro',
      '~anthropic/claude-*',
    ]) {
      expect(creditModelsError([model], 'ALLOW')).toBeNull()
      expect(creditModelsError([model], 'DENY')).toBeNull()
    }
  })

  test('별이 둘이거나 벤더에 붙거나 꼬리가 없으면 거부한다', () => {
    for (const model of ['openai*', 'openai/*gpt*', 'openai/**', 'openai/*-', 'openai/*.', '*/gpt-4o']) {
      expect(creditModelsError([model], 'ALLOW')).not.toBeNull()
    }
  })

  test('물결 하나만으로는 이름이 되지 않는다', () => {
    for (const model of ['~', '~*', '~/gpt-4o', '~/*', '*', '~~openai/gpt-4o']) {
      expect(creditModelsError([model], 'ALLOW')).not.toBeNull()
    }
  })

  // 전부 여는 것과 전부 막는 것은 다른 방법으로 하는 일이라 안내가 갈린다.
  test("'*' 하나는 목록에 따라 다른 안내를 낸다", () => {
    expect(creditModelsError(['*'], 'ALLOW')).toContain('목록을 비워')
    expect(creditModelsError(['*'], 'DENY')).toContain('금액 한도를 0')
  })

  // 선행 물결을 떼고 보지 않으면 자체 서빙 이름이 한 글자 차이로 들어온다.
  test('자체 서빙 이름은 물결을 붙여도 거부한다', () => {
    for (const model of ['pickle-general', 'pnu-general', '~pickle-general', '~pnu-general']) {
      expect(creditModelsError([model], 'DENY')).toContain('자체 서빙')
    }
  })

  test('개수와 길이 상한을 지킨다', () => {
    const many = Array.from({ length: 51 }, (_, i) => `openai/model-${i}`)
    expect(creditModelsError(many, 'ALLOW')).toContain('최대 50개')
    expect(creditModelsError([`openai/${'a'.repeat(201)}`], 'ALLOW')).toContain('너무 깁니다')
  })
})

describe('parseCreditModels', () => {
  test('물결을 지우지 않고 소문자로 내린다', () => {
    expect(parseCreditModels('~Anthropic/Claude-Sonnet-Latest\nOpenAI/*')).toEqual([
      '~anthropic/claude-sonnet-latest',
      'openai/*',
    ])
  })
})
