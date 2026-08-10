import { ApiError } from '../../api/problem'

/**
 * 1시간 구간만 폴링한다 — 그보다 긴 구간은 한 점이 수 분~수 시간이라 자주 다시
 * 받아도 그림이 달라지지 않는다. (테스트에서는 빠르게 돌려 갱신을 관찰한다.)
 */
export const METRICS_POLL_MS = import.meta.env.MODE === 'test' ? 250 : 30_000

/**
 * 하이퍼바이저에 물어볼 수 없어 값을 모른다는 계약의 오류 코드(503). 장애 화면이
 * 아니라 "지금은 잴 수 없다"는 사실이므로, 화면은 차분하게 알리고 조회를 되풀이하지
 * 않는다.
 */
export function isHypervisorUnreadable(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'METRICS_UNAVAILABLE'
}
