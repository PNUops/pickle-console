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
 * **null을 만들지 않는다.** 계약이 호출 없는 날도 0으로 채워 주므로 빠진 날이란
 * 없고, 여기서 null을 흘리면 차트가 그날을 빈 구간으로 그려 "보고가 안 왔다"로
 * 읽힌다. 0인 날과 자료가 없는 날은 화면에서 서로 다른 그림이어야 한다.
 */
export function usageSeries(
  points: LlmKeyUsagePoint[],
  pick: (point: LlmKeyUsagePoint) => number,
): number[] {
  return points.map((point) => pick(point) ?? 0)
}

export interface UsageTotals {
  requests: number
  succeeded: number
  rateLimited: number
  failed: number
  inputTokens: number
  outputTokens: number
  estimatedRequests: number
}

const ZERO: UsageTotals = {
  requests: 0,
  succeeded: 0,
  rateLimited: 0,
  failed: 0,
  inputTokens: 0,
  outputTokens: 0,
  estimatedRequests: 0,
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
    }),
    ZERO,
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
 * 요청이 아예 없던 구간을 "0회 보냈습니다"로 말하면 사실이지만 읽는 사람이 찾는
 * 답이 아니다. 그 경우에는 없었다고 말한다.
 */
export function usageSummary(points: LlmKeyUsagePoint[], days: number): string {
  const totals = usageTotals(points)
  if (points.length === 0 || totals.requests === 0) {
    return `최근 ${days}일 동안 이 키로 들어온 요청이 없습니다.`
  }
  const tokens = totals.inputTokens + totals.outputTokens
  const busiest = points.reduce((top, point) => (point.requests > top.requests ? point : top))
  return (
    `최근 ${days}일 동안 요청 ${group(totals.requests)}회, 토큰 ${group(tokens)}개를 썼습니다.` +
    ` 가장 많이 쓴 날은 ${busiest.day}(${group(busiest.requests)}회)입니다.`
  )
}

/**
 * 토큰 합계 중 추정이 차지하는 비율(0~100).
 *
 * 스트리밍 응답에서 업스트림이 사용량을 주지 않으면 게이트웨이가 추정하므로,
 * 이 값이 크면 토큰 합도 그만큼 추정이다 — 실측인 척하지 않기 위한 근거.
 */
export function estimatedShare(totals: UsageTotals): number {
  if (totals.requests === 0) return 0
  return (totals.estimatedRequests / totals.requests) * 100
}

/** 비율 표기 — 0.4%처럼 작은 값도 0%로 뭉개지 않는다. */
export function formatShare(percent: number): string {
  if (percent > 0 && percent < 1) return '1% 미만'
  return `${Math.round(percent)}%`
}
