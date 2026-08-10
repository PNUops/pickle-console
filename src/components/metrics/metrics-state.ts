import { ApiError } from '../../api/problem'

/**
 * 1시간 구간만 폴링한다 — 그보다 긴 구간은 한 점이 수 분~수 시간이라 자주 다시
 * 받아도 그림이 달라지지 않는다. (테스트에서는 빠르게 돌려 갱신을 관찰한다.)
 */
export const METRICS_POLL_MS = import.meta.env.MODE === 'test' ? 250 : 30_000

/**
 * 값을 읽지 못한 뒤의 조회 주기 — 정상 주기보다 물러서되 멈추지는 않는다.
 * 하이퍼바이저 무응답은 대개 잠깐이라(pveproxy 재시작·타임아웃) 폴링을 아예 끄면
 * 화면이 되돌아올 길이 새로고침뿐이다.
 */
export const METRICS_RETRY_POLL_MS = import.meta.env.MODE === 'test' ? 500 : 60_000

/**
 * 하이퍼바이저에 물어볼 수 없어 값을 모른다는 계약의 오류 코드(503). 장애 화면이
 * 아니라 "지금은 잴 수 없다"는 사실이므로 화면은 차분하게 알리되, 계약의 안내가
 * "잠시 후 다시 시도해 주세요"인 만큼 조회는 느슨한 주기로 이어 간다.
 */
export function isHypervisorUnreadable(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'METRICS_UNAVAILABLE'
}
