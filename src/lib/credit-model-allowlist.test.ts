import { describe, expect, test } from 'vitest'
import { creditModelsError, parseCreditModels } from './credit-model-allowlist'

// 같은 규칙이 네 곳에 복사돼 있다. 이 파일은 콘솔 사본이 나머지 셋과 어긋나지
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
      expect(creditModelsError([model])).toBeNull()
    }
  })

  test('물결 하나만으로는 이름이 되지 않는다', () => {
    for (const model of ['~', '~*', '~/gpt-4o', '~/*', '*', '~~openai/gpt-4o']) {
      expect(creditModelsError([model])).not.toBeNull()
    }
  })

  // 선행 물결을 떼고 보지 않으면 자체 서빙 이름이 한 글자 차이로 들어온다.
  test('자체 서빙 이름은 물결을 붙여도 거부한다', () => {
    for (const model of ['pickle-general', 'pnu-general', '~pickle-general', '~pnu-general']) {
      expect(creditModelsError([model])).toContain('자체 서빙')
    }
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
