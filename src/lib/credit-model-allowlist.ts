/**
 * 상용(금액) 축 모델 허용 목록의 입력 파싱과 검증.
 *
 * 승인 화면, 관리자 한도 창, 사업 계정 화면 셋이 같은 값을 다루므로 규칙을 한 곳에
 * 둔다. 서버가 같은 규칙으로 다시 검증하고 422를 돌려주므로 여기서 막는 것은 왕복을
 * 아끼기 위한 것이지 마지막 방어선이 아니다.
 */

/** 목록에 넣을 수 있는 최대 개수. 서버와 같은 값이다. */
export const MAX_CREDIT_MODELS = 50

/** 자체 서빙 전용 접두. 이 목록은 상용 모델만 다루므로 넣으면 오해다. */
const RESERVED_PREFIXES = ['pickle-', 'pnu-']

const PATTERN = /^[a-z0-9][a-z0-9._:-]*(\/([a-z0-9][a-z0-9._:-]*|\*))?$/

/**
 * 줄바꿈이나 쉼표로 나눈 입력을 목록으로 만든다. 소문자로 내리고 중복을 없애되
 * 적은 순서는 유지한다 — 판정이 소문자 기준이라 대문자로 저장하면 아무것도 맞지
 * 않는다.
 */
export function parseCreditModels(text: string): string[] {
  const seen = new Set<string>()
  for (const raw of text.split(/[\n,]/)) {
    const value = raw.trim().toLowerCase()
    if (value) seen.add(value)
  }
  return [...seen]
}

/** 목록을 편집 가능한 텍스트로. 한 줄에 하나가 읽기 쉽다. */
export function formatCreditModels(models: readonly string[]): string {
  return models.join('\n')
}

/** 첫 번째 문제 하나를 한국어로. 없으면 null. */
export function creditModelsError(models: readonly string[]): string | null {
  if (models.length > MAX_CREDIT_MODELS) {
    return `모델은 최대 ${MAX_CREDIT_MODELS}개까지 허용할 수 있습니다.`
  }
  for (const model of models) {
    if (model === '*') {
      return "모든 모델을 허용하려면 목록을 비워 주세요. '*' 하나만 적을 수는 없습니다."
    }
    if (RESERVED_PREFIXES.some((prefix) => model.startsWith(prefix))) {
      return `${model}은(는) 자체 서빙 모델이라 이 목록의 대상이 아닙니다. 상용 모델 이름을 적어 주세요.`
    }
    if (!PATTERN.test(model)) {
      return `${model}은(는) 모델 이름 또는 벤더 프리픽스(예: openai/*) 형식이 아닙니다.`
    }
  }
  return null
}
