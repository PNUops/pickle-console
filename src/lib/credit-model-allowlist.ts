/**
 * 유료 모델 목록의 입력 파싱과 검증. 허용 목록과 차단 목록이 같은 문법을 쓴다.
 *
 * 승인 화면, 관리자 한도 창, 사업 계정 화면 셋이 같은 값을 다루므로 규칙을 한 곳에
 * 둔다. 서버가 같은 규칙으로 다시 검증하고 422를 돌려주므로 여기서 막는 것은 왕복을
 * 아끼기 위한 것이지 마지막 방어선이 아니다.
 *
 * 문법만 여기서 본다. 어떤 모델이 실제로 걸리는지는 credit-model-match.ts 가 정한다.
 */

/** 한 목록에 넣을 수 있는 최대 개수. 서버와 같은 값이다. */
export const MAX_CREDIT_MODELS = 50

/** 항목 하나의 최대 길이(UTF-8 바이트). 서버와 같은 값이다. */
export const MAX_CREDIT_MODEL_BYTES = 200

/** 두 목록 중 어느 쪽인지. 오류 문구가 갈리는 자리에만 쓴다. */
export type CreditModelListKind = 'ALLOW' | 'DENY'

/** 자체 서빙 전용 접두. 이 목록은 유료 모델만 다루므로 넣으면 오해다. */
const RESERVED_PREFIXES = ['pickle-', 'pnu-']

/**
 * 서버와 DB CHECK 의 규칙과 같은 모양이다. 모델 세그먼트가 받는 네 모양은 정확한
 * 이름, 끝-별, 시작-별, 벤더 전체(`*`)다.
 *
 * 슬래시 앞(벤더)에는 별이 오지 못한다. 벤더 접두가 서로 겹쳐서(`meta` 와
 * `meta-llama`) `openai*` 같은 패턴은 고른 사람이 뜻하지 않은 벤더까지 함께 연다.
 * 슬래시 자체는 선택이라 벤더 없는 이름도 받는다.
 *
 * 선행 `~` 는 벤더가 부동 별칭(`~anthropic/claude-sonnet-latest` 처럼 그 계열의
 * 최신 모델로 따라가는 이름)에 붙이는 표시라서 받는다. `~anthropic/*` 와
 * `anthropic/*` 는 서로를 덮지 않는다.
 */
const PATTERN = /^~?[a-z0-9][a-z0-9._:-]*(\/([a-z0-9][a-z0-9._:-]*\*?|\*[a-z0-9._:-]*[a-z0-9]|\*))?$/

const ENCODER = new TextEncoder()

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
export function creditModelsError(
  models: readonly string[],
  kind: CreditModelListKind,
): string | null {
  if (models.length > MAX_CREDIT_MODELS) {
    return `모델은 최대 ${MAX_CREDIT_MODELS}개까지 적을 수 있습니다.`
  }
  for (const model of models) {
    if (ENCODER.encode(model).length > MAX_CREDIT_MODEL_BYTES) {
      return `모델 이름이 너무 깁니다. ${MAX_CREDIT_MODEL_BYTES}바이트까지 적을 수 있습니다.`
    }
    if (model === '*') {
      return kind === 'ALLOW'
        ? "모든 모델을 허용하려면 목록을 비워 주세요. '*' 하나만 적을 수는 없습니다."
        : "모든 모델을 막으려면 금액 한도를 0으로 두세요. '*' 하나만 적을 수는 없습니다."
    }
    // 선행 `~` 를 떼고 본다. 안 그러면 `~pickle-general` 이 한 글자 차이로
    // 이 검사를 빠져나가 자체 서빙 이름이 유료 모델 목록에 들어온다.
    const bare = model.startsWith('~') ? model.slice(1) : model
    if (RESERVED_PREFIXES.some((prefix) => bare.startsWith(prefix))) {
      return `${model}은(는) 자체 서빙 모델이라 이 목록의 대상이 아닙니다. 유료 모델 이름을 적어 주세요.`
    }
    if (!PATTERN.test(model)) {
      return `${model}은(는) 모델 이름 또는 벤더 프리픽스(예: openai/*) 형식이 아닙니다.`
    }
  }
  return null
}
