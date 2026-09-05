import type { AdminLlmKeyDetail } from '../api/queries'

/**
 * 기능 권한 축의 표시명과 그 값을 부르는 말.
 *
 * 유료 모델 목록 둘과 나란히 서지만 읽는 방향이 반대다. 두 목록은 비우면 제한이
 * 풀리고, 이 목록은 비우면 아무것도 열리지 않는다. 세 줄이 같은 화면에 붙어 있어서
 * 빈 값을 부르는 말이 화면마다 다르면 승인자가 셋을 같은 것으로 읽는다. 그래서 문구를
 * 여기 한 곳에 두고 승인 폼·한도 창·키 상세 셋이 같은 말을 쓴다.
 *
 * 어휘 자체는 여기 없다. 계약이 닫힌 집합을 실어 주므로 타입에서 받고, 계약이 늘면
 * 재생성만으로 따라간다. 계약이 나르는 것은 토큰뿐이라 한국어 표시명은 콘솔 것이다.
 */

/** 계약이 정한 값. 이 축을 다루는 모든 상태가 이 타입으로 선다. */
export type PassthroughEndpoint = AdminLlmKeyDetail['passthroughEndpoints'][number]

/**
 * 키가 계약 타입이라 이 표가 어휘의 유일한 사본이 된다. 계약에 값이 하나 늘면
 * 표시명이 빠졌다고 컴파일이 깨지고, 빠지면 남는 키가 있다고 깨진다.
 */
const LABELS: Record<PassthroughEndpoint, string> = {
  images: '이미지 생성',
  embeddings: '임베딩',
}

/** 체크박스가 서는 순서. 표시명 표가 그대로 순서다. */
export const PASSTHROUGH_ENDPOINTS = Object.keys(LABELS) as PassthroughEndpoint[]

/** 값 하나의 표시명. 표에 없는 값은 원문 그대로 — 감추면 부여된 것이 안 보인다. */
export function passthroughLabel(value: string): string {
  return LABELS[value as PassthroughEndpoint] ?? value
}

/** 부여된 기능을 읽는 말. 빈 값은 '제한 없음'이 아니라 '아무것도 못 쓴다'이다. */
export function passthroughText(endpoints: readonly string[]): string {
  if (endpoints.length === 0) {
    return `부여 안 됨. ${PASSTHROUGH_ENDPOINTS.map(passthroughLabel).join(' · ')} 모두 쓸 수 없습니다`
  }
  return endpoints.map(passthroughLabel).join(', ')
}

/**
 * 체크 하나를 켜고 끈다. 순서는 적은 순이 아니라 표시명 표의 순서다.
 *
 * 표에 없는 값은 지우지 않고 뒤에 남긴다. 타입상으로는 그런 값이 올 수 없지만
 * 타입이 말하는 것은 이 빌드가 생성된 계약이지 지금 붙어 있는 서버가 아니다.
 * 한도 교체는 전체 교체라, 배포가 엇갈린 잠깐 사이에 체크박스 없는 값이 조용히
 * 빠지면 아무도 건드리지 않은 부여가 저장 한 번에 사라진다.
 */
export function togglePassthrough(
  endpoints: readonly PassthroughEndpoint[],
  value: PassthroughEndpoint,
  checked: boolean,
): PassthroughEndpoint[] {
  const next = new Set<PassthroughEndpoint>(endpoints)
  if (checked) {
    next.add(value)
  } else {
    next.delete(value)
  }
  return [
    ...PASSTHROUGH_ENDPOINTS.filter((entry) => next.has(entry)),
    ...endpoints.filter((entry) => next.has(entry) && !(entry in LABELS)),
  ]
}
