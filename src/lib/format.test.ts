import { describe, expect, test } from 'vitest'
import { formatByteRate, formatBytes, formatDday, formatPercent } from './format'

// KST 달력일이 2026-07-13인 시점 — 러너 TZ와 무관하게 같은 결과가 나와야 한다.
const BASE = new Date('2026-07-13T12:00:00+09:00')

describe('formatDday', () => {
  test('남은 일수에 따라 D-n 라벨을 만든다', () => {
    expect(formatDday('2026-07-16', BASE)).toEqual({
      label: 'D-3',
      tone: 'danger',
      daysLeft: 3,
    })
    expect(formatDday('2026-07-20', BASE)).toEqual({
      label: 'D-7',
      tone: 'warning',
      daysLeft: 7,
    })
    expect(formatDday('2026-08-13', BASE)).toEqual({
      label: 'D-31',
      tone: 'neutral',
      daysLeft: 31,
    })
  })

  test('당일은 D-Day, 경과는 D+n(danger)', () => {
    expect(formatDday('2026-07-13', BASE)).toEqual({
      label: 'D-Day',
      tone: 'danger',
      daysLeft: 0,
    })
    expect(formatDday('2026-07-11', BASE)).toEqual({
      label: 'D+2',
      tone: 'danger',
      daysLeft: -2,
    })
  })
})

describe('formatBytes / formatByteRate', () => {
  test('이진 단위로 올리며 값 크기에 맞춰 자릿수를 줄인다', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.50 KiB')
    expect(formatBytes(24 * 1024 ** 3)).toBe('24.0 GiB')
    expect(formatBytes(900 * 1024 ** 3)).toBe('900 GiB')
    expect(formatBytes(0)).toBe('0 B')
  })

  test('전송 속도는 같은 라벨에 초당을 붙인다', () => {
    expect(formatByteRate(1_572_864)).toBe('1.50 MiB/s')
    expect(formatByteRate(0)).toBe('0 B/s')
  })
})

describe('formatPercent', () => {
  test('백분율은 소수 한 자리, 100% 이상은 정수로 적는다', () => {
    expect(formatPercent(42.35)).toBe('42.4%')
    expect(formatPercent(7)).toBe('7.0%')
    expect(formatPercent(100)).toBe('100%')
  })
})
