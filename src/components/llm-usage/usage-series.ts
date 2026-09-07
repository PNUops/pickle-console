import type { LlmKeyUsagePoint } from '../../api/queries'
import { toEpochSeconds } from '../metrics/timeframe'

/** 조회 기간 선택지 — 계약이 허용하는 1~90일 안에서. 기본 30일. */
export const USAGE_DAY_OPTIONS = [7, 30, 90]
export const DEFAULT_USAGE_DAYS = 30

/** 일 단위 집계의 날짜(YYYY-MM-DD, KST 달력일) → x축 값(epoch 초). */
export function usageTimes(points: LlmKeyUsagePoint[]): number[] {
  return points.map((point) => toEpochSeconds(`${point.day}T00:00:00+09:00`))
}

/**
 * 한 축의 값들.
 *
 * 계약이 호출 없는 날도 0으로 채워 주므로 빠진 날이란 없다 — 계열에 null이
 * 섞이면 차트가 그날을 빈 구간으로 그려 "보고가 안 왔다"로 읽히므로, 이 함수는
 * 숫자만 내보낸다(값의 타입도 그것을 보장한다).
 */
export function usageSeries(
  points: LlmKeyUsagePoint[],
  pick: (point: LlmKeyUsagePoint) => number,
): number[] {
  return points.map(pick)
}

export interface UsageTotals {
  requests: number
  succeeded: number
  rateLimited: number
  failed: number
  inputTokens: number
  outputTokens: number
  estimatedRequests: number
  cachedInputTokens: number
  reasoningTokens: number
  imageCount: number
  streamedRequests: number
}

const ZERO: UsageTotals = {
  requests: 0,
  succeeded: 0,
  rateLimited: 0,
  failed: 0,
  inputTokens: 0,
  outputTokens: 0,
  estimatedRequests: 0,
  cachedInputTokens: 0,
  reasoningTokens: 0,
  imageCount: 0,
  streamedRequests: 0,
}

export function usageTotals(points: LlmKeyUsagePoint[]): UsageTotals {
  return points.reduce<UsageTotals>(
    (sum, point) => ({
      requests: sum.requests + point.requests,
      succeeded: sum.succeeded + point.succeeded,
      rateLimited: sum.rateLimited + point.rateLimited,
      failed: sum.failed + point.failed,
      inputTokens: sum.inputTokens + point.inputTokens,
      outputTokens: sum.outputTokens + point.outputTokens,
      estimatedRequests: sum.estimatedRequests + point.estimatedRequests,
      // 캐시와 사고 토큰은 입력·출력의 부분집합이다. 여기서 따로 더하는 것은
      // 합계를 늘리기 위해서가 아니라 그 안에서 얼마인지를 말하기 위해서다.
      cachedInputTokens: sum.cachedInputTokens + point.cachedInputTokens,
      reasoningTokens: sum.reasoningTokens + point.reasoningTokens,
      imageCount: sum.imageCount + point.imageCount,
      streamedRequests: sum.streamedRequests + point.streamedRequests,
    }),
    ZERO,
  )
}

/**
 * 구간에 그릴 것이 있는지.
 *
 * 발급만 되고 한 번도 쓰이지 않은 키에 0으로 눕는 선 세 개를 그리는 것은 위
 * 문장이 이미 말한 것을 되풀이할 뿐이다 — 할당 추이 카드가 같은 이유로 같은
 * 판단을 한다.
 */
export function hasUsage(points: LlmKeyUsagePoint[]): boolean {
  return points.some(
    (point) => point.requests > 0 || point.inputTokens > 0 || point.outputTokens > 0,
  )
}

/** 천 단위 구분 — 축 라벨과 문장이 같은 표기를 쓰도록 한 곳에 둔다. */
function group(value: number): string {
  return Math.round(value).toLocaleString('ko-KR')
}

export function formatRequests(value: number): string {
  return `${group(value)}회`
}

export function formatTokens(value: number): string {
  return `${group(value)}토큰`
}

/**
 * 구간 요약 한 문장 — 숫자 나열보다 먼저 읽히는 것.
 *
 * 구간 길이는 응답이 준 점 수에서 읽는다. 화면이 고른 일수를 쓰면 기간을 바꾼
 * 직후 새 라벨이 옛 자료 위에 얹혀, 구간 밖의 날짜를 "가장 많이 쓴 날"로
 * 가리키게 된다.
 *
 * 합계는 말하지 않는다. 바로 아래 타일이 요청 수와 토큰 합을 그대로 보여 주므로,
 * 이 문장이 할 일은 타일에 없는 것 하나를 짚는 것뿐이다.
 */
export function usageSummary(points: LlmKeyUsagePoint[]): string {
  const days = points.length
  if (days === 0) return '조회할 구간이 없습니다.'
  const totals = usageTotals(points)
  if (totals.requests === 0) {
    return `최근 ${days}일 동안 이 키로 들어온 요청이 없습니다.`
  }
  const busiest = points.reduce((top, point) => (point.requests > top.requests ? point : top))
  return `가장 많이 쓴 날은 ${busiest.day}(${group(busiest.requests)}회)입니다.`
}

/**
 * 토큰 합계 중 추정이 차지하는 비율(0~100).
 *
 * 분모는 전체 요청이 아니라 정상 응답한 요청이다 — 한도에 걸려 거부됐거나 실패한
 * 요청은 토큰을 만들지 않으므로, 전체로 나누면 한도에 걸리는 키일수록 추정 비율이
 * 실제보다 낮게 나온다(거부 950건에 가려 90% 추정이 5%로 읽힌다).
 */
export function estimatedShare(totals: UsageTotals): number {
  if (totals.succeeded === 0) return 0
  return Math.min(100, (totals.estimatedRequests / totals.succeeded) * 100)
}

/** 비율 표기 — 0.4%처럼 작은 값도 0%로 뭉개지 않는다. */
export function formatShare(percent: number): string {
  if (percent > 0 && percent < 1) return '1% 미만'
  return `${Math.round(percent)}%`
}
