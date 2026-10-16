import { describe, expect, test } from 'vitest'
import type { ModelPriceTier, ModelPricing } from '../api/queries'
import {
  axisLabel,
  axisPriceText,
  extraAxes,
  hasPriceDetail,
  priceDetailSummary,
  tierCondition,
  usd,
} from './model-pricing'

const band = (overrides: Partial<ModelPriceTier>): ModelPriceTier => ({
  minPromptTokens: null,
  utcDays: [],
  utcStartMinute: null,
  utcEndMinute: null,
  otherConditions: [],
  axes: [],
  ...overrides,
})

describe('model pricing text', () => {
  test('keeps small fees exact instead of rounding them away', () => {
    expect(usd(0.0025)).toBe('$0.0025')
    expect(usd(0.0625)).toBe('$0.0625')
    expect(usd(3.75)).toBe('$3.75')
    expect(usd(1200)).toBe('$1,200')
    expect(usd(0)).toBe('무료')
  })

  test('states each unit, and says when the unit is not known', () => {
    expect(axisPriceText({ axis: 'web_search', unit: 'PER_CALL', price: 0.01 })).toBe(
      '$0.01 / 회',
    )
    expect(axisPriceText({ axis: 'x', unit: 'UNKNOWN', price: 0.05 })).toBe('$0.05 (단위 미상)')
  })

  test('an axis without a label is shown under its vendor name', () => {
    expect(axisLabel('video_second')).toBe('video_second')
    expect(axisLabel('input_cache_write_1h')).toBe('캐시 쓰기(1시간)')
  })

  test('counts only charging axes beyond input and output', () => {
    const pricing: ModelPricing = {
      axes: [
        { axis: 'prompt', unit: 'PER_MILLION_TOKENS', price: 1 },
        { axis: 'completion', unit: 'PER_MILLION_TOKENS', price: 2 },
        { axis: 'input_cache_read', unit: 'PER_MILLION_TOKENS', price: 0 },
        { axis: 'web_search', unit: 'PER_CALL', price: 0.01 },
      ],
      tiers: [],
    }
    expect(extraAxes(pricing).map((axis) => axis.axis)).toEqual(['web_search'])
    expect(priceDetailSummary(pricing)).toBe('외 1개 축')
    expect(hasPriceDetail({ ...pricing, axes: pricing.axes.slice(0, 3) })).toBe(false)
    expect(priceDetailSummary({ axes: pricing.axes.slice(0, 3), tiers: [] })).toBeNull()
    expect(priceDetailSummary(null)).toBe('다른 가격 축 확인 전')
  })

  test('phrases each kind of band condition', () => {
    expect(tierCondition(band({ minPromptTokens: 200000 }))).toBe('입력 200,000 토큰 초과')
    expect(
      tierCondition(band({ utcDays: ['monday', 'friday'], utcStartMinute: 60, utcEndMinute: 240 })),
    ).toBe('월·금, UTC 01:00~04:00')
    expect(tierCondition(band({ utcStartMinute: 600, utcEndMinute: 1440 }))).toBe(
      'UTC 10:00~24:00',
    )
    // A condition the server could not read is named, so the band does not
    // pass for one that applies everywhere.
    expect(tierCondition(band({ otherConditions: ['region'] }))).toBe(
      '확인하지 못한 조건 region',
    )
    expect(tierCondition(band({}))).toBe('조건 미상')
  })
})
