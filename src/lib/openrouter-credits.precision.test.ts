import { expect, test } from 'vitest'
import { formatUsd } from './openrouter-credits'

test.each([
  [1.23456789e-6, '$0.00000123'],
  [-1.23456789e-6, '-$0.00000123'],
  [5e-8, '$0.00000005'],
  [-5e-8, '-$0.00000005'],
  [1.23456789e-9, '$1.23456789e-9'],
  [-1.23456789e-9, '-$1.23456789e-9'],
])('currency display uses eight decimals without discarding nonzero subprecision values (%s)', (value, expected) => {
  expect(formatUsd(value as number)).toBe(expected)
})

test.each([5e-8, -5e-8, Number.MIN_VALUE, -Number.MIN_VALUE])(
  'a finite nonzero reported amount keeps its nonzero value and sign (%s)',
  (value) => {
    const formatted = formatUsd(value)
    expect(formatted).not.toMatch(/^-?\$0(?:\.0+)?$/)
    expect(formatted.startsWith('-')).toBe(value < 0)
    expect(formatted).not.toBe('확인 전')
  },
)

test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
  'an invalid reported amount is unknown instead of an observed currency value (%s)',
  (value) => {
    expect(formatUsd(value)).toBe('확인 전')
  },
)
