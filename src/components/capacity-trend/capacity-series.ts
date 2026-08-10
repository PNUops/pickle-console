import type { CapacityTrendPoint } from '../../api/queries'
import { formatMemory } from '../../lib/format'
import { toEpochSeconds } from '../metrics/timeframe'

/** 기관 대시보드 할당 추이 카드가 보여 주는 기간 — 계절 단위 변화를 보기 좋은 길이. */
export const TREND_DAYS = 90

/** 계약의 메모리·디스크 단위(MB·GB)를 바이트로 올려 공용 바이트 포매터를 쓴다. */
export const BYTES_PER_MB = 1024 * 1024
export const BYTES_PER_GB = 1024 * 1024 * 1024

/** 일 단위 스냅샷의 날짜(YYYY-MM-DD, KST 달력일) → x축 값(epoch 초). */
export function trendTimes(points: CapacityTrendPoint[]): number[] {
  return points.map((point) => toEpochSeconds(`${point.day}T00:00:00+09:00`))
}

/** 현재 용량처럼 구간 내내 같은 값인 기준선. */
export function constantSeries(length: number, value: number): number[] {
  return Array.from({ length }, () => value)
}

/** vCPU 축·툴팁 라벨 — 눈금이 정수가 아닐 수 있어 소수 한 자리까지 허용한다. */
export function formatVcpu(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} vCPU`
}

/** VM 대수 라벨. */
export function formatVmCount(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}대`
}

/**
 * 첫날과 마지막 날을 견줘 평문 한두 문장으로 요약한다 — 기관 대시보드의 독자는
 * 지표를 읽는 사람이 아니라 승인·정리를 판단하는 사람이라, 숫자 나열 대신 문장을
 * 먼저 준다.
 */
export function allocationSummary(points: CapacityTrendPoint[]): string {
  if (points.length === 0) return `최근 ${TREND_DAYS}일 동안 기록된 할당 변화가 없습니다.`
  const first = points[0]
  const last = points[points.length - 1]
  const sentences: string[] = []
  if (last.vcpu !== first.vcpu) {
    const direction = last.vcpu > first.vcpu ? '늘었습니다' : '줄었습니다'
    sentences.push(
      `최근 ${TREND_DAYS}일 동안 할당 vCPU가 ${first.vcpu}개에서 ${last.vcpu}개로 ${direction}.`,
    )
  }
  if (last.memoryMb !== first.memoryMb) {
    const direction = last.memoryMb > first.memoryMb ? '늘었습니다' : '줄었습니다'
    const lead =
      sentences.length === 0 ? `최근 ${TREND_DAYS}일 동안 할당 메모리가` : '메모리는'
    sentences.push(
      `${lead} ${formatMemory(first.memoryMb)}에서 ${formatMemory(last.memoryMb)}로 ${direction}.`,
    )
  }
  if (sentences.length === 0) return `최근 ${TREND_DAYS}일 동안 할당량 변화가 없습니다.`
  return sentences.join(' ')
}
