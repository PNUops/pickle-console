import { describe, expect, test } from 'vitest'
import type { LlmKeyUsagePoint } from '../../api/queries'
import {
  estimatedShare,
  formatRequests,
  formatShare,
  formatTokens,
  usageSeries,
  usageSummary,
  usageTimes,
  usageTotals,
} from './usage-series'

function point(day: string, values: Partial<LlmKeyUsagePoint> = {}): LlmKeyUsagePoint {
  return {
    day,
    requests: 0,
    succeeded: 0,
    rateLimited: 0,
    failed: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedRequests: 0,
    ...values,
  }
}

describe('usageSeries — 0인 날과 자료가 없는 날', () => {
  test('호출이 없던 날은 0으로 남는다 (빈 구간이 아니다)', () => {
    // 차트는 null을 빈 구간으로 그린다. 여기서 null이 새면 "요청이 없던 날"이
    // "보고가 안 온 날"로 뒤집혀 읽힌다.
    const series = usageSeries(
      [point('2026-08-09', { requests: 40 }), point('2026-08-10'), point('2026-08-11', { requests: 12 })],
      (p) => p.requests,
    )
    expect(series).toEqual([40, 0, 12])
    expect(series.some((value) => value == null)).toBe(false)
  })

  test('점 수만큼 길이가 맞아야 축과 어긋나지 않는다', () => {
    expect(usageSeries([], (p) => p.requests)).toEqual([])
  })
})

describe('usageTimes', () => {
  test('KST 달력일을 그날 00시(KST)의 epoch 초로 옮긴다', () => {
    expect(usageTimes([point('2026-08-10')])).toEqual([
      Date.parse('2026-08-10T00:00:00+09:00') / 1000,
    ])
  })
})

describe('usageTotals', () => {
  test('구간의 모든 축을 각각 합한다', () => {
    const totals = usageTotals([
      point('2026-08-10', {
        requests: 10,
        succeeded: 8,
        rateLimited: 1,
        failed: 1,
        inputTokens: 100,
        outputTokens: 40,
        estimatedRequests: 2,
      }),
      point('2026-08-11', { requests: 5, succeeded: 5, inputTokens: 50, outputTokens: 20 }),
    ])
    expect(totals).toEqual({
      requests: 15,
      succeeded: 13,
      rateLimited: 1,
      failed: 1,
      inputTokens: 150,
      outputTokens: 60,
      estimatedRequests: 2,
    })
  })

  test('빈 구간은 0으로 합해진다', () => {
    expect(usageTotals([]).requests).toBe(0)
  })
})

describe('usageSummary', () => {
  test('요청이 아예 없던 구간은 0회라고 세지 않고 없었다고 말한다', () => {
    expect(usageSummary([point('2026-08-10'), point('2026-08-11')], 30)).toBe(
      '최근 30일 동안 이 키로 들어온 요청이 없습니다.',
    )
    expect(usageSummary([], 7)).toBe('최근 7일 동안 이 키로 들어온 요청이 없습니다.')
  })

  test('요청·토큰 합과 가장 많이 쓴 날을 한 문장으로 말한다', () => {
    expect(
      usageSummary(
        [
          point('2026-08-09', { requests: 1200, inputTokens: 900_000, outputTokens: 300_000 }),
          point('2026-08-10'),
          point('2026-08-11', { requests: 300, inputTokens: 20_000, outputTokens: 8_000 }),
        ],
        30,
      ),
    ).toBe(
      '최근 30일 동안 요청 1,500회, 토큰 1,228,000개를 썼습니다. 가장 많이 쓴 날은 2026-08-09(1,200회)입니다.',
    )
  })
})

describe('추정 비율', () => {
  test('추정이 섞인 만큼을 비율로 돌려준다', () => {
    expect(
      estimatedShare(usageTotals([point('2026-08-11', { requests: 200, estimatedRequests: 50 })])),
    ).toBe(25)
  })

  test('요청이 없으면 0으로 나누지 않는다', () => {
    expect(estimatedShare(usageTotals([]))).toBe(0)
  })

  test('아주 작은 비율을 0%로 뭉개지 않는다 — 추정이 있었다는 사실이 사라진다', () => {
    expect(formatShare(0.4)).toBe('1% 미만')
    expect(formatShare(0)).toBe('0%')
    expect(formatShare(25)).toBe('25%')
  })
})

describe('값 표기', () => {
  test('천 단위를 끊어 읽기 쉽게 한다', () => {
    expect(formatRequests(1500)).toBe('1,500회')
    expect(formatTokens(1_228_000)).toBe('1,228,000토큰')
  })
})
