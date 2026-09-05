/**
 * 확장 기능 축의 어휘와 그 값을 부르는 말.
 *
 * 유료 모델 목록 둘과 나란히 서지만 읽는 방향이 반대다. 두 목록은 비우면 제한이
 * 풀리고, 이 목록은 비우면 아무것도 열리지 않는다. 세 줄이 같은 화면에 붙어 있어서
 * 빈 값을 부르는 말이 화면마다 다르면 승인자가 셋을 같은 것으로 읽는다. 그래서 문구를
 * 여기 한 곳에 두고 승인 폼·한도 창·키 상세 셋이 같은 말을 쓴다.
 *
 * 계약은 이 값을 `string[]` 으로만 싣는다. 닫힌 집합이 타입에 실려 오지 않으므로
 * 어휘는 여기 적어 두고, 모르는 토큰이 오면 원문을 그대로 보여 준다. 계약이 enum을
 * 싣게 되면 아래 상수를 계약 타입으로 갈아 끼우면 된다.
 */

/** 계약이 받는 값 전부. 승인 폼의 체크박스가 이 순서로 선다. */
export const PASSTHROUGH_ENDPOINTS = ['images', 'embeddings'] as const

const LABELS: Record<string, string> = {
  images: '이미지 생성',
  embeddings: '임베딩',
}

/** 값 하나의 표시명. 모르는 값은 원문 그대로 — 감추면 부여된 것이 안 보인다. */
export function passthroughLabel(value: string): string {
  return LABELS[value] ?? value
}

/** 부여된 기능을 읽는 말. 빈 값은 '제한 없음'이 아니라 '아무것도 못 쓴다'이다. */
export function passthroughText(endpoints: readonly string[]): string {
  if (endpoints.length === 0) {
    return `부여 안 됨. ${PASSTHROUGH_ENDPOINTS.map(passthroughLabel).join(' · ')} 모두 쓸 수 없습니다`
  }
  return endpoints.map(passthroughLabel).join(', ')
}

/**
 * 이 빌드가 모르는 값. 어휘가 계약이 아니라 여기 적혀 있으므로, 서버가 먼저 늘어나면
 * 체크박스가 없는 값을 폼이 들고 있게 된다. 폼은 그것을 지우지 않고 말해야 한다 —
 * 조용히 빠지면 아무도 건드리지 않은 부여가 저장 한 번에 사라진다.
 */
export function unknownPassthrough(endpoints: readonly string[]): string[] {
  const known: readonly string[] = PASSTHROUGH_ENDPOINTS
  return endpoints.filter((entry) => !known.includes(entry))
}

/** 체크 하나를 켜고 끈다. 모르는 값은 손대지 않고 뒤에 남긴다. */
export function togglePassthrough(
  endpoints: readonly string[],
  value: string,
  checked: boolean,
): string[] {
  const next = new Set(endpoints)
  if (checked) {
    next.add(value)
  } else {
    next.delete(value)
  }
  return [
    ...PASSTHROUGH_ENDPOINTS.filter((entry) => next.has(entry)),
    ...unknownPassthrough(endpoints).filter((entry) => next.has(entry)),
  ]
}
