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
 * 구간 안에서 값이 실제로 어떻게 움직였는지 — 양 끝만 견주면 올랐다 되돌아온
 * 구간이 "변화가 없습니다"로 뒤집혀 읽힌다. 승인을 판단하는 사람이 가장 먼저
 * 읽는 문장이라 그 뒤집힘이 그대로 판단이 된다.
 */
function describeMovement(
  lead: string,
  values: number[],
  format: (value: number) => string,
): string | null {
  const first = values[0]
  const last = values[values.length - 1]
  const peak = Math.max(...values)
  const trough = Math.min(...values)

  if (last !== first) {
    const direction = last > first ? '늘었습니다' : '줄었습니다'
    const extremes: string[] = []
    if (trough < Math.min(first, last)) extremes.push(`최소 ${format(trough)}`)
    if (peak > Math.max(first, last)) extremes.push(`최대 ${format(peak)}`)
    const tail = extremes.length > 0 ? `(기간 중 ${extremes.join(', ')})` : ''
    return `${lead} ${format(first)}에서 ${format(last)}로 ${direction}${tail}.`
  }
  if (peak !== trough) {
    return `${lead} ${format(trough)}에서 ${format(peak)} 사이를 오간 뒤 ${format(last)}로 돌아왔습니다.`
  }
  return null
}

/** vCPU 문장에 쓰는 값 표기 — 축 라벨(formatVcpu)과 달리 문장에서는 '개'로 센다. */
function vcpuCount(value: number): string {
  return `${value}개`
}

/**
 * 구간 전체를 견줘 평문 한두 문장으로 요약한다 — 기관 대시보드의 독자는 지표를
 * 읽는 사람이 아니라 승인·정리를 판단하는 사람이라, 숫자 나열 대신 문장을 먼저 준다.
 */
/**
 * 구간 내내 아무것도 할당돼 있지 않았는지 — 자원을 아직 받지 않은 기관(신설 기관이
 * 그렇다)에서는 0으로 눕는 선을 그리는 것보다 문장 하나가 정확하다.
 */
export function hasAllocation(points: CapacityTrendPoint[]): boolean {
  return points.some(
    (point) => point.vcpu > 0 || point.memoryMb > 0 || point.diskGb > 0 || point.vmCount > 0,
  )
}

export function allocationSummary(points: CapacityTrendPoint[]): string {
  if (points.length === 0) return `최근 ${TREND_DAYS}일 동안 기록된 할당 변화가 없습니다.`
  if (!hasAllocation(points)) return `최근 ${TREND_DAYS}일 동안 할당된 자원이 없습니다.`
  const sentences: string[] = []
  const vcpu = describeMovement(
    `최근 ${TREND_DAYS}일 동안 할당 vCPU가`,
    points.map((point) => point.vcpu),
    vcpuCount,
  )
  if (vcpu != null) sentences.push(vcpu)
  const memory = describeMovement(
    sentences.length === 0 ? `최근 ${TREND_DAYS}일 동안 할당 메모리가` : '메모리는',
    points.map((point) => point.memoryMb),
    formatMemory,
  )
  if (memory != null) sentences.push(memory)
  if (sentences.length === 0) return `최근 ${TREND_DAYS}일 동안 할당량 변화가 없습니다.`
  return sentences.join(' ')
}
