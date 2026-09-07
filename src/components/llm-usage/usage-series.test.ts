import { describe, expect, test } from 'vitest'
import type { LlmKeyUsagePoint } from '../../api/queries'
import {
  estimatedShare,
  formatRequests,
  formatShare,
  formatTokens,
  hasUsage,
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
    cachedInputTokens: 0,
    reasoningTokens: 0,
    imageCount: 0,
    streamedRequests: 0,
    ...values,
  }
}

describe('usageSeries — 0인 날과 자료가 없는 날', () => {
  test('호출이 없던 날은 0으로 남는다 (빈 구간이 아니다)', () => {
    // 차트는 null을 빈 구간으로 그린다. 여기서 0이 null로 바뀌면 "요청이 없던 날"이
    // "보고가 안 온 날"로 뒤집혀 읽힌다.
    expect(
      usageSeries(
        [
          point('2026-08-09', { requests: 40 }),
          point('2026-08-10'),
          point('2026-08-11', { requests: 12 }),
        ],
        (p) => p.requests,
      ),
    ).toEqual([40, 0, 12])
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
        // 부분집합이라 각각 위 토큰 값보다 작다. 합계에 더하는 것이 아니라
        // 그 안에서 얼마인지를 말하므로, 아래 기대값의 입출력 합은 안 움직인다.
        cachedInputTokens: 30,
        reasoningTokens: 12,
        imageCount: 2,
        streamedRequests: 4,
      }),
      point('2026-08-11', { requests: 5, succeeded: 5, inputTokens: 50, outputTokens: 20 }),
    ])
    // toEqual 로 통째로 비교하는 것이 이 시험의 값이다 — 축이 하나 늘면
    // 여기서 걸리고, 합치는 것을 빠뜨린 축도 같이 걸린다.
    expect(totals).toEqual({
      requests: 15,
      succeeded: 13,
      rateLimited: 1,
      failed: 1,
      inputTokens: 150,
      outputTokens: 60,
      estimatedRequests: 2,
      cachedInputTokens: 30,
      reasoningTokens: 12,
      imageCount: 2,
      streamedRequests: 4,
    })
  })

  test('빈 구간은 0으로 합해진다', () => {
    expect(usageTotals([]).requests).toBe(0)
  })
})

describe('usageSummary', () => {
  test('요청이 아예 없던 구간은 0회라고 세지 않고 없었다고 말한다', () => {
    expect(usageSummary([point('2026-08-10'), point('2026-08-11')])).toBe(
      '최근 2일 동안 이 키로 들어온 요청이 없습니다.',
    )
  })

  test('가장 많이 쓴 날은 응답이 준 점에서 고른다', () => {
    // 화면이 고른 일수를 쓰면 기간을 바꾼 직후 새 라벨이 옛 자료 위에 얹혀,
    // 구간 밖의 날짜를 그 구간의 최댓값이라고 말하게 된다.
    expect(usageSummary([point('2026-08-11', { requests: 5 })])).toBe(
      '가장 많이 쓴 날은 2026-08-11(5회)입니다.',
    )
  })

  test('합계는 되풀이하지 않는다 — 타일이 이미 말한다', () => {
    expect(
      usageSummary([
        point('2026-08-09', { requests: 1200, inputTokens: 900_000, outputTokens: 300_000 }),
        point('2026-08-10'),
        point('2026-08-11', { requests: 300, inputTokens: 20_000, outputTokens: 8_000 }),
      ]),
    ).toBe('가장 많이 쓴 날은 2026-08-09(1,200회)입니다.')
  })
})

describe('hasUsage', () => {
  test('내내 아무 요청도 없었으면 그릴 것이 없다고 본다', () => {
    expect(hasUsage([point('2026-08-10'), point('2026-08-11')])).toBe(false)
    expect(hasUsage([])).toBe(false)
  })

  test('한 점에라도 요청이나 토큰이 있으면 그린다', () => {
    expect(hasUsage([point('2026-08-10'), point('2026-08-11', { requests: 1 })])).toBe(true)
  })
})

describe('추정 비율', () => {
  test('토큰을 만든 요청을 분모로 삼는다', () => {
    expect(
      estimatedShare(
        usageTotals([point('2026-08-11', { requests: 200, succeeded: 200, estimatedRequests: 50 })]),
      ),
    ).toBe(25)
  })

  test('거부·실패에 가려 추정 비율이 낮아 보이지 않는다', () => {
    // 한도에 걸린 950건은 토큰을 만들지 않는다. 전체로 나누면 90% 추정이 5%로 읽힌다.
    expect(
      estimatedShare(
        usageTotals([
          point('2026-08-11', {
            requests: 1000,
            succeeded: 50,
            rateLimited: 950,
            estimatedRequests: 45,
          }),
        ]),
      ),
    ).toBe(90)
  })

  test('정상 응답이 없으면 0으로 나누지 않는다', () => {
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
