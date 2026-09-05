/**
 * 유료 모델 패턴이 어떤 모델 이름을 잡는지 판정한다.
 *
 * **판정 규칙의 정본은 요청을 실제로 막는 게이트웨이와 공유하며, 이 파일의 테스트가
 * 옮겨 담은 케이스 표가 그 계약이다.** 화면은 그 규칙을 다시 설계하지 않고 같은 답을
 * 낼 뿐이다. 한쪽이 갈라지면 화면이 "쓸 수 있다"고 센 모델을 게이트웨이가 거절하고,
 * 미리보기는 승인자를 속인다. 규칙을 고쳐야 하면 표를 먼저 고치고 양쪽을 함께 옮긴다.
 *
 * 문법 검증(무엇을 적을 수 있는가)은 credit-model-allowlist.ts 가 맡는다. 여기 오는
 * 패턴은 그 검사를 통과한 것으로 본다.
 *
 * **이 파일이 답하는 것은 저장 전 조합뿐이다.** 아직 키가 없는 화면에서 지금 타이핑한
 * 두 목록이 무엇을 잡는지를 말한다. 이미 저장된 키가 무엇을 부를 수 있는지는 서버가
 * 답하므로 그것을 여기서 다시 계산하지 마라. 두 답이 갈리면 서버가 맞다.
 */

/** 앞뒤 공백 없이 소문자로. 판정은 양쪽 다 소문자 기준이다. */
function normalize(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * 패턴 하나가 모델 이름 하나를 잡는가.
 *
 * 시작-별에만 변형 인식이 있다. `:batch`(반값)와 `:free` 는 같은 모델의 변형이지
 * 다른 모델이 아니라서, 없으면 `openai/*-pro` 가 `openai/gpt-5-pro` 는 잡고
 * `openai/gpt-5-pro:batch` 는 놓친다. 끝-별은 이미 접두로 그 꼬리까지 잡으므로
 * 같은 처리가 필요 없고, 반대로 시작-별에 끝-별의 "구분자 뗀 자기 이름"을 넣지는
 * 않는다. `openai/*-pro` 가 `openai/pro` 를 잡을 근거가 없다.
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
  // 벤더 없는 이름은 정확히 같을 때만 잡는다.
  if (slash < 0) return p === n

  const vendor = p.slice(0, slash)
  const seg = p.slice(slash + 1)
  const prefix = `${vendor}/`
  // 벤더 경계. `openai/*` 가 `openai-mirror/gpt-4o` 를 잡으면 안 된다.
  if (!n.startsWith(prefix)) return false
  const rest = n.slice(prefix.length)
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

  return rest === seg
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

/**
 * 두 목록을 함께 본 결론. 차단이 허용을 이긴다.
 *
 * 각 목록은 비어 있으면 그 축에 제약이 없다는 뜻이라 세 번째 상태가 생기지 않는다.
 * 둘 다 비면 금액 한도 안에서 전부 쓸 수 있다.
 *
 * 못 알아볼 항목이 섞여 있으면 이 함수를 부르지 말고 화면이 판정 자체를 접어야
 * 한다. 항목만 건너뛰면 두 목록이 반대 방향으로 거짓말한다. 허용은 목록이 줄어
 * 무제한 쪽으로 기울고, 차단은 목록이 줄어 막던 것이 열린다.
 */
export function isCreditModelUsable(
  name: string,
  allowed: readonly string[],
  denied: readonly string[],
): boolean {
  if (matchesAnyCreditModel(denied, name)) return false
  if (allowed.length === 0) return true
  return matchesAnyCreditModel(allowed, name)
}
