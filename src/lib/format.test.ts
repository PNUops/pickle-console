import { describe, expect, test } from 'vitest'
import { formatDday } from './format'

const BASE = new Date(2026, 6, 13) // 2026-07-13 (local)

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
