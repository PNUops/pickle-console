/**
 * Mirror the gateway's paid-model matching for unsaved policy previews.
 * Policy parity fixtures cover provider, alias, variant and router behavior.
 * Saved-key model lists are computed by the API rather than this preview helper.
 */

/** 앞뒤 공백 없이 소문자로. 판정은 양쪽 다 소문자 기준이다. */
function normalize(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Match one valid pattern against a model name.
 * Exact names and leading-star suffixes also compare against the variant-stripped name.
 * Trailing-star prefixes retain the separator recovery rule: `gpt-5-*` includes
 * `gpt-5`, but does not include `gpt-5:batch`; `gpt-5*` includes both.
 */
export function matchesCreditModel(pattern: string, name: string): boolean {
  const p = normalize(pattern)
  const n = normalize(name)
  if (!p || !n) return false
  // 적재 정규식이 이미 떨구는 모양이지만 여기서도 막는다. 패스스루가 `*` 라는
  // 이름의 모델을 합성할 수 있어서, 이 가드가 없으면 목록에 남아 있던 `*` 하나가
  // 그 모델을 잡는다.
  if (p === '*') return false

  const slash = p.indexOf('/')
  // Exact names also cover a rate variant of the same model.
  if (slash < 0) return p === n || p === n.split(':', 1)[0]

  const vendor = p.slice(0, slash)
  const seg = p.slice(slash + 1)
  const nameSlash = n.indexOf('/')
  if (nameSlash < 1) return false
  // A whole-provider wildcard includes aliases; a concrete provider retains its namespace.
  if (vendor !== '*' && n.slice(0, nameSlash) !== vendor) return false
  const rest = n.slice(nameSlash + 1)
  if (!rest) return false

  // 벤더 전체.
  if (seg === '*') return true

  if (seg.startsWith('*')) {
    const tail = seg.slice(1)
    if (!tail) return false
    if (rest.endsWith(tail)) return true
    const colon = rest.indexOf(':')
    const base = colon < 0 ? rest : rest.slice(0, colon)
    return base.endsWith(tail)
  }

  if (seg.endsWith('*')) {
    const stem = seg.slice(0, -1)
    // 별은 빈 문자열도 먹는다. 길이 조건을 걸면 `openai/gpt-5*` 가
    // `openai/gpt-5` 를 놓치는데, 구분자 규칙 때문에 더 좁아 보이는
    // `openai/gpt-5-*` 는 그것을 잡는다. 넓은 패턴이 덜 잡는 자리는 만들지 않는다.
    if (rest.startsWith(stem)) return true
    // `openai/gpt-5-*` 는 `openai/gpt-5` 도 잡는다. 구분자를 뗀 자기 이름이
    // 계열에서 빠지면 계열을 열어 준 사람이 뜻한 것과 다르다. 접두 관계가 아니라
    // 위의 규칙으로는 안 잡히므로 이 줄이 따로 필요하다.
    const last = stem.slice(-1)
    if ((last === '-' || last === '.' || last === ':') && rest === stem.slice(0, -1)) return true
    return false
  }

  return rest === seg || rest.split(':', 1)[0] === seg
}

/** 선택기가 모델 하나를 두고 함께 내미는 패턴. */
export interface CreditModelSuggestion {
  pattern: string
  /** 무엇을 여는 패턴인지 한 낱말로. */
  kind: '벤더 전체' | '계열' | '티어'
}

/**
 * 고른 모델 하나에서 그 계열과 티어의 와일드카드를 뽑는다.
 *
 * 이름 하나를 그대로 넣는 것과 계열을 여는 것은 예산에서 전혀 다른 일인데, 목록에
 * 이름만 쌓이면 그 차이가 안 보인다. 뽑은 패턴이 지금 몇 개를 잡는지는 부르는 쪽이
 * 카탈로그에 matchesCreditModel 을 걸어 센다.
 *
 * `:batch` 같은 변형 꼬리는 떼고 본다. 변형에서 계열을 뽑으면 `openai/gpt-5-pro:*`
 * 처럼 그 변형만 여는 패턴이 나와서, 고른 사람이 뜻한 계열과 다르다.
 */
export function suggestCreditModelPatterns(modelId: string): CreditModelSuggestion[] {
  const id = normalize(modelId)
  const slash = id.indexOf('/')
  // 벤더 없는 이름에는 계열이 없다. 자체 서빙 이름이 그 모양이고, 이 목록의
  // 대상도 아니다.
  if (slash < 0) return []
  const vendor = id.slice(0, slash)
  const colon = id.indexOf(':', slash)
  const seg = colon < 0 ? id.slice(slash + 1) : id.slice(slash + 1, colon)
  if (!vendor || !seg) return []

  const suggestions: CreditModelSuggestion[] = [{ pattern: `${vendor}/*`, kind: '벤더 전체' }]
  const parts = seg.split('-')
  if (parts.length > 1) {
    suggestions.push({ pattern: `${vendor}/${parts.slice(0, -1).join('-')}-*`, kind: '계열' })
    suggestions.push({ pattern: `${vendor}/*-${parts[parts.length - 1]}`, kind: '티어' })
  }
  return suggestions.filter((suggestion) => suggestion.pattern !== id)
}

/** 목록 중 하나라도 잡으면 참. 빈 목록은 아무것도 잡지 않는다. */
export function matchesAnyCreditModel(patterns: readonly string[], name: string): boolean {
  return patterns.some((pattern) => matchesCreditModel(pattern, name))
}

/** Router names choose the billed model after the fence, so any fence refuses them. */
export function isRouterModelName(name: string): boolean {
  return normalize(name).replace(/^~+/, '').startsWith('openrouter/')
}

/** Denials additionally cover the same name without its floating-alias marker. */
export function matchesDeniedCreditModel(pattern: string, name: string): boolean {
  const normalized = normalize(name)
  return matchesCreditModel(pattern, normalized) ||
    matchesCreditModel(pattern, normalized.replace(/^~+/, ''))
}

/** Apply the paid-model fence to validated lists; invalid editors must suppress their preview. */
export function isCreditModelUsable(
  name: string,
  allowed: readonly string[],
  denied: readonly string[],
): boolean {
  if ((allowed.length > 0 || denied.length > 0) && isRouterModelName(name)) return false
  if (denied.some((pattern) => matchesDeniedCreditModel(pattern, name))) return false
  if (allowed.length === 0) return true
  return matchesAnyCreditModel(allowed, name)
}
