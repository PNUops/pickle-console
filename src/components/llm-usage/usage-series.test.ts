import { describe, expect, test } from 'vitest'
import type { LlmKeyUsagePoint } from '../../api/queries'
import {
  estimatedShare,
  formatRequests,
  formatShare,
  formatTokens,
  hasUsage,
  reportingState,
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

describe('reportingState — 뒤쪽 0을 어떻게 읽어야 하는지', () => {
  test('보고가 한 번도 없었으면 never', () => {
    expect(reportingState(null, '2026-08-11')).toEqual({ kind: 'never' })
    expect(reportingState(undefined, '2026-08-11')).toEqual({ kind: 'never' })
  })

  test('보고가 구간 끝까지 닿았으면 마지막 점만 아직 채워지는 중이다', () => {
    expect(reportingState('2026-08-11T09:20:00+09:00', '2026-08-11')).toEqual({
      kind: 'current',
      at: '2026-08-11T09:20:00+09:00',
    })
  })

  test('며칠째 보고가 없으면 그 뒤 0은 아직 모르는 값이다', () => {
    // 놀고 있는 키에 "곧 채워집니다"를 붙이면 진짜 0을 미완성으로 읽게 만들고,
    // 보고가 끊긴 키에 "요청이 없던 날"을 붙이면 모르는 값을 단언하게 된다.
    expect(reportingState('2026-07-31T08:00:00+09:00', '2026-08-11')).toEqual({
      kind: 'stale',
      at: '2026-07-31T08:00:00+09:00',
      unreportedFrom: '2026-08-01',
    })
  })

  test('보고 시각은 KST 달력일로 견준다', () => {
    // 2026-08-11T00:30+09:00 = 2026-08-10T15:30Z — UTC로 자르면 하루가 밀린다.
    expect(reportingState('2026-08-11T00:30:00+09:00', '2026-08-11').kind).toBe('current')
  })
})

describe('값 표기', () => {
  test('천 단위를 끊어 읽기 쉽게 한다', () => {
    expect(formatRequests(1500)).toBe('1,500회')
    expect(formatTokens(1_228_000)).toBe('1,228,000토큰')
  })
})
