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
 * Match the API and database grammar. Provider wildcards occupy the whole segment;
 * model wildcards remain limited to a single leading or trailing star.
 * A concrete provider may start with the floating-alias marker, but `~*` is invalid.
 */
const PATTERN = /^(?:~?[a-z0-9][a-z0-9._:-]*(?:\/([a-z0-9][a-z0-9._:-]*\*?|\*[a-z0-9._:-]*[a-z0-9]|\*))?|\*\/([a-z0-9][a-z0-9._:-]*\*?|\*[a-z0-9._:-]*[a-z0-9]|\*))$/

const ENCODER = new TextEncoder()

export interface CreditModelRuleError {
  line: number
  message: string
}

export interface CreditModelRules {
  allowed: string[]
  denied: string[]
  errors: CreditModelRuleError[]
}

/** Parse signed lines without dropping invalid input from the editor's raw text. */
export function parseCreditModelRules(text: string): CreditModelRules {
  const allowed = new Set<string>()
  const denied = new Set<string>()
  const errors: CreditModelRuleError[] = []
  text.split(/\r?\n/).forEach((raw, index) => {
    const value = raw.trim()
    if (!value) return
    const line = index + 1
    if (value[0] !== '+' && value[0] !== '-') {
      errors.push({ line, message: "허용은 '+', 차단은 '-'로 시작해 주세요." })
      return
    }
    const model = value.slice(1).trim().toLowerCase()
    if (!model) {
      errors.push({ line, message: '부호 뒤에 모델 이름이나 패턴을 적어 주세요.' })
      return
    }
    const kind = value[0] === '+' ? 'ALLOW' : 'DENY'
    const error = creditModelsError([model], kind)
    if (error) {
      errors.push({ line, message: error })
      return
    }
    const list = kind === 'ALLOW' ? allowed : denied
    if (!list.has(model) && list.size >= MAX_CREDIT_MODELS) {
      errors.push({ line, message: `${kind === 'ALLOW' ? '허용' : '차단'} 모델은 최대 ${MAX_CREDIT_MODELS}개까지 적을 수 있습니다.` })
      return
    }
    list.add(model)
  })
  return { allowed: [...allowed], denied: [...denied], errors }
}

/** Stored arrays have no cross-list ordering; format allows first for a stable round trip. */
export function formatCreditModelRules(allowed: readonly string[], denied: readonly string[]): string {
  return [...allowed.map((model) => `+${model}`), ...denied.map((model) => `-${model}`)].join('\n')
}

export function creditModelRulesError(rules: CreditModelRules): string | undefined {
  return rules.errors.length ? rules.errors.map(({ line, message }) => `${line}행: ${message}`).join(' ') : undefined
}

/** API validation can target a list or one indexed entry within that list. */
export function creditModelFieldErrors(
  errors: Record<string, string>,
  allowedField: string,
  deniedField: string,
): string | undefined {
  const roots = [allowedField, deniedField]
  const messages = Object.entries(errors)
    .filter(([field]) => roots.some((root) => field === root || field.startsWith(`${root}[`)))
    .map(([, message]) => message)
  return [...new Set(messages)].join(' ') || undefined
}

/** Append a picker choice without rewriting unfinished or invalid lines. */
export function appendCreditModelRule(text: string, pattern: string, kind: CreditModelListKind): string {
  const parsed = parseCreditModelRules(text)
  const model = pattern.trim().toLowerCase()
  if ((kind === 'ALLOW' ? parsed.allowed : parsed.denied).includes(model)) return text
  return `${text}${text && !text.endsWith('\n') ? '\n' : ''}${kind === 'ALLOW' ? '+' : '-'}${model}`
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
        ? "허용 범위를 제한하지 않으려면 + 항목을 모두 지워 주세요. '*' 하나만 적을 수는 없습니다."
        : "모든 모델을 막으려면 금액 한도를 0으로 두세요. '*' 하나만 적을 수는 없습니다."
    }
    const slash = model.indexOf('/')
    const provider = slash < 0 ? model : model.slice(0, slash)
    if (provider.includes('*') && provider !== '*') {
      return "공급자는 정확한 이름 또는 '*'만 사용할 수 있습니다. 예: openai/*, */*-pro"
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
