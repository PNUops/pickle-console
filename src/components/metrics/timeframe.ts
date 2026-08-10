import type { MetricsTimeframe } from '../../api/queries'

/** 계약의 구간 값과 화면 라벨 — 배열 순서가 표시 순서다. */
export const TIMEFRAMES: { value: MetricsTimeframe; label: string }[] = [
  { value: 'HOUR', label: '1시간' },
  { value: 'DAY', label: '1일' },
  { value: 'WEEK', label: '1주' },
  { value: 'MONTH', label: '1개월' },
  { value: 'YEAR', label: '1년' },
]

/**
 * 구간별 x축·툴팁 시각 라벨 (KST 고정 — 계약의 시각 의미가 KST다).
 * 하루 이내는 시:분, 그보다 길면 월-일까지만 보여 축이 붐비지 않게 한다.
 */
const kstClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const kstDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
})

/** 시:분 (KST) — 시간·일 구간 축 라벨. */
export function formatKstClock(seconds: number): string {
  return kstClock.format(new Date(seconds * 1000))
}

/** 월-일 (KST) — 주 이상 구간과 일 단위 추이 축 라벨. */
export function formatKstDay(seconds: number): string {
  return kstDay.format(new Date(seconds * 1000))
}

export function timeframeAxisFormat(
  timeframe: MetricsTimeframe,
): (seconds: number) => string {
  return timeframe === 'HOUR' || timeframe === 'DAY' ? formatKstClock : formatKstDay
}

/** ISO 시각 → epoch 초 (uPlot의 x축 단위). */
export function toEpochSeconds(iso: string): number {
  return Math.round(new Date(iso).getTime() / 1000)
}
