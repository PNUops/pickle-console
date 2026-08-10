import { describe, expect, test } from 'vitest'
import { pickSeries } from './metric-series'
import {
  formatKstClock,
  formatKstDay,
  timeframeAxisFormat,
  toEpochSeconds,
} from './timeframe'

interface Point {
  time: string
  cpu?: number | null
  memBytes?: number | null
}

const POINTS: Point[] = [
  { time: '2026-08-10T12:00:00+09:00', cpu: 0.25, memBytes: 1024 },
  { time: '2026-08-10T12:01:00+09:00', cpu: null, memBytes: null },
  { time: '2026-08-10T12:02:00+09:00', cpu: 0, memBytes: 2048 },
  { time: '2026-08-10T12:03:00+09:00', memBytes: 4096 },
]

describe('pickSeries', () => {
  test('계약 단위를 화면 단위로 옮긴다', () => {
    expect(pickSeries(POINTS, 'cpu', 100)).toEqual([25, null, 0, null])
  })

  test('값이 없는 점은 0이 아니라 빈 값으로 남는다', () => {
    // 0은 "쓰지 않았다", null은 "알 수 없다" — 그림에서 구별되어야 한다.
    const values = pickSeries(POINTS, 'cpu')
    expect(values[1]).toBeNull()
    expect(values[2]).toBe(0)
    // 키 자체가 빠진 점(미보고)도 빈 값이다.
    expect(values[3]).toBeNull()
  })

  test('배율을 주지 않으면 값을 그대로 쓰고 길이는 점 수와 같다', () => {
    expect(pickSeries(POINTS, 'memBytes')).toEqual([1024, null, 2048, 4096])
    expect(pickSeries([], 'cpu')).toEqual([])
  })
})

describe('시각 축 라벨', () => {
  test('ISO 시각을 uPlot의 x 단위(epoch 초)로 옮긴다', () => {
    expect(toEpochSeconds('2026-08-10T12:00:00+09:00')).toBe(
      Date.parse('2026-08-10T12:00:00+09:00') / 1000,
    )
  })

  test('라벨은 브라우저 시간대와 무관하게 KST로 읽는다', () => {
    const at = toEpochSeconds('2026-08-10T12:34:00+09:00')
    expect(formatKstClock(at)).toBe('12:34')
    expect(formatKstDay(at)).toBe('08-10')
  })

  test('하루 이내 구간은 시:분, 그보다 길면 월-일로 끊는다', () => {
    expect(timeframeAxisFormat('HOUR')).toBe(formatKstClock)
    expect(timeframeAxisFormat('DAY')).toBe(formatKstClock)
    expect(timeframeAxisFormat('WEEK')).toBe(formatKstDay)
    expect(timeframeAxisFormat('MONTH')).toBe(formatKstDay)
    expect(timeframeAxisFormat('YEAR')).toBe(formatKstDay)
  })
})
