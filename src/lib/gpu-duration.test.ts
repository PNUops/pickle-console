import { describe, expect, test } from 'vitest'
import { gpuDurationHours, gpuDurationLabel } from './gpu-duration'

describe('GPU duration input', () => {
  test('requires an explicit positive whole duration', () => {
    for (const raw of ['', ' ', '0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992']) {
      expect(gpuDurationHours(raw, 'hours')).toBeNull()
    }
  })
  test('converts days to hours without a policy default', () => {
    expect(gpuDurationHours('2', 'days')).toBe(48)
    expect(gpuDurationHours('7', 'hours')).toBe(7)
    expect(gpuDurationLabel(48)).toBe('2일')
    expect(gpuDurationLabel(7)).toBe('7시간')
  })
})
