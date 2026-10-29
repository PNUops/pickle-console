import { describe, expect, it } from 'vitest'
import { formatTokenCompact, formatTokenDecision, formatTokenExact, formatTokenScale, formatTokenStatisticCompact, unpricedTokenCount, UNKNOWN_TOKEN_VALUE } from './token-presentation'

describe('token presentation', () => {
  it.each([
    [0, '0'], [999, '999'], [1000, '1K'], [12500, '12.5K'],
    [999499, '999K'], [999500, '1M'], [1000000, '1M'],
    [5000001, '5M'], [999500000, '1B'], [1000000000, '1B'],
    [1234567890, '1.23B'],
  ])('abbreviates %s as %s without changing the source', (value, label) => {
    expect(formatTokenCompact(value)).toBe(label)
    expect(formatTokenExact(value)).toBe(`${value.toLocaleString('ko-KR')} 토큰`)
  })
  it.each([
    [12500, '1만 2500 토큰'], [5000000, '5백만 토큰'],
    [10000000, '1천만 토큰'], [25000000, '2천5백만 토큰'],
    [123456789, '1억 2345만 6789 토큰'],
    [Number.MAX_SAFE_INTEGER, '9007조 1992억 5474만 991 토큰'],
  ])('keeps every Korean group in %s', (value, label) => {
    expect(formatTokenScale(value)).toBe(label)
    expect(label).not.toContain(',')
  })
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('does not invent an exact value for %s', (value) => {
    expect(formatTokenCompact(value)).toBe(UNKNOWN_TOKEN_VALUE)
    expect(formatTokenExact(value)).toBe(UNKNOWN_TOKEN_VALUE)
    expect(formatTokenDecision(value)).toBe(UNKNOWN_TOKEN_VALUE)
  })
  it('keeps two distinct raw decisions despite the same abbreviation', () => {
    expect(formatTokenCompact(5000000)).toBe(formatTokenCompact(5000001))
    expect(formatTokenDecision(5000000)).not.toBe(formatTokenDecision(5000001))
  })
  it('does not claim exactness after an overflowing intermediate is subtracted', () => {
    expect(unpricedTokenCount(Number.MAX_SAFE_INTEGER, 2, Number.MAX_SAFE_INTEGER, 0)).toBeNaN()
    expect(unpricedTokenCount(5000000, 1, 3000000, 1)).toBe(2000000)
  })
})

describe('token statistics presentation', () => {
  it.each([
    [0, '0'], [0.125, '0.125'], [999.49, '999'], [999.5, '1K'],
    [999.95, '1K'], [1000.01, '1K'], [2500.5, '2.5K'], [12500.5, '12.5K'],
    [999499.5, '999K'], [999500.5, '1M'], [1000000.5, '1M'],
    [999500000.5, '1B'], [1000000000.5, '1B'], [1e-7, '1e-7'],
    [Number.MIN_VALUE, '5e-324'],
  ])('abbreviates finite fractional statistic %s as %s', (value, label) => {
    expect(formatTokenStatisticCompact(value)).toBe(label)
  })
  it.each([-1, -Number.MIN_VALUE, NaN, Infinity, -Infinity])('rejects invalid statistic %s', (value) => {
    expect(formatTokenStatisticCompact(value)).toBe(UNKNOWN_TOKEN_VALUE)
  })
  it('accepts finite statistical magnitude without weakening exact-count admission', () => {
    const value = Number.MAX_SAFE_INTEGER + 1
    expect(formatTokenStatisticCompact(value)).not.toBe(UNKNOWN_TOKEN_VALUE)
    expect(formatTokenCompact(value)).toBe(UNKNOWN_TOKEN_VALUE)
    expect(formatTokenCompact(2500.5)).toBe(UNKNOWN_TOKEN_VALUE)
    expect(formatTokenExact(2500.5)).toBe(UNKNOWN_TOKEN_VALUE)
    expect(formatTokenStatisticCompact(Number.MAX_VALUE)).not.toMatch(/Infinity|NaN/)
  })
})
