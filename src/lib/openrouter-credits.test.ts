import { describe, expect, test } from 'vitest'

import type { OpenRouterAccountAllocation, OpenRouterAccountCredits } from '../api/queries'
import { evaluateAllocation, formatUsd } from './openrouter-credits'

function allocation(
  overrides: Partial<OpenRouterAccountAllocation> = {},
): OpenRouterAccountAllocation {
  return {
    committedCreditLimit: 0,
    committedTotalCap: 0,
    committedDaily: 0,
    committedWeekly: 0,
    committedMonthly: 0,
    committedKeyCount: 0,
    remainingCommitment: 0,
    committedUsage: 0,
    awaitingProvisionKeyCount: 0,
    usageUnreportedKeyCount: 0,
    ...overrides,
  }
}

function credits(balance: number | null): OpenRouterAccountCredits {
  return {
    totalCredits: balance,
    totalUsage: balance == null ? null : 0,
    balance,
    freshness: balance == null ? 'UNKNOWN' : 'FRESH',
    observedAt: balance == null ? null : '2026-09-02T09:00:00Z',
    lastSuccessAt: balance == null ? null : '2026-09-02T09:00:00Z',
    lastAttemptAt: null,
    error: null,
    averageDailyUsage: null,
    depletionForecastAt: null,
    forecastUnavailableReason: null,
    forecastWindowStartedAt: null,
    accountUsageSinceBaseline: null,
    managedUsageSinceBaseline: null,
    unmanagedSpend: null,
    unmanagedSpendUnavailableReason: null,
    unmanagedBaselineAt: null,
    pairedCreditsObservedAt: null,
    pairedKeysObservedAt: null,
    keysFreshness: 'UNKNOWN',
    keysLastSuccessAt: null,
    keysLastAttemptAt: null,
    keysError: null,
  }
}

describe('초과 배정 판정', () => {
  // 착수 근거가 된 사고. 잔액 100인 계정에 10씩 서른 명을 승인하면 늦게 쓰는
  // 사람이 못 쓴다. 아무도 아직 안 썼으므로 합계와 남은 배정이 같다.
  test('아무도 쓰지 않은 서른 개가 잔액을 넘으면 초과다', () => {
    const judgement = evaluateAllocation({
      allocation: allocation({
        committedCreditLimit: 290,
        committedTotalCap: 290,
        remainingCommitment: 290,
        committedKeyCount: 29,
      }),
      credits: credits(100),
      pendingAmount: 10,
    })

    expect(judgement.state).toBe('EXCEEDED')
    expect(judgement.warns).toBe(true)
    expect(judgement.needsAcknowledgement).toBe(true)
    expect(judgement.projected).toBe(300)
  })

  // 잔액은 이미 지출을 뺀 값이다. 합계를 비교하면 같은 돈을 두 번 센다.
  test('이미 쓴 금액을 두 번 세지 않는다', () => {
    const spent = {
      allocation: allocation({
        committedCreditLimit: 10,
        committedTotalCap: 10,
        remainingCommitment: 2,
        committedUsage: 8,
        committedKeyCount: 1,
      }),
      credits: credits(92),
    }

    // 합계 기준이면 10 + 90 = 100 > 92 로 초과라 말한다. 실제로 앞으로 빠져나갈
    // 수 있는 최대는 2 + 90 = 92 로 딱 맞는다.
    expect(evaluateAllocation({ ...spent, pendingAmount: 90 }).state).toBe('WITHIN')
    expect(evaluateAllocation({ ...spent, pendingAmount: 91 }).state).toBe('EXCEEDED')
  })

  test('잔액과 정확히 같으면 초과가 아니다', () => {
    const judgement = evaluateAllocation({
      allocation: allocation({ remainingCommitment: 50 }),
      credits: credits(100),
      pendingAmount: 50,
    })

    expect(judgement.state).toBe('WITHIN')
    expect(judgement.warns).toBe(false)
  })

  // 문의가 들어왔던 사고. 잔액이 0이면 발급해도 첫 호출이 실패한다.
  test('잔액 0은 초과와 다른 상태로 말한다', () => {
    const judgement = evaluateAllocation({
      allocation: allocation(),
      credits: credits(0),
      pendingAmount: 10,
    })

    expect(judgement.state).toBe('NO_BALANCE')
    expect(judgement.needsAcknowledgement).toBe(true)
  })

  // 음수 잔액은 「잔액 없음」이 아니라 이미 초과 지출된 상태다. 0으로 보정하지 않는다.
  test('음수 잔액은 잔액 없음과 구분한다', () => {
    const judgement = evaluateAllocation({
      allocation: allocation(),
      credits: credits(-1.25),
      pendingAmount: 0,
    })

    expect(judgement.state).toBe('NEGATIVE_BALANCE')
    expect(judgement.balance).toBe(-1.25)
  })

  // 방금 등록한 계정은 아직 폴링되지 않았다. 우리 관측 실패로 승인을 막지 않는다.
  test('잔액을 한 번도 관측하지 못했으면 안내만 하고 확인을 요구하지 않는다', () => {
    const judgement = evaluateAllocation({
      allocation: allocation({ remainingCommitment: 500 }),
      credits: credits(null),
      pendingAmount: 10,
    })

    expect(judgement.state).toBe('UNKNOWN')
    expect(judgement.warns).toBe(true)
    expect(judgement.needsAcknowledgement).toBe(false)
    expect(judgement.balance).toBeNull()
  })

  // 한도 변경은 자기 키의 현재 한도가 이미 합계 안에 있으므로 빼야 한다. 다만
  // 그 키가 판정 대상 계정에 이미 연결된 경우에만이다.
  test('연결된 키의 현재 한도는 빼고, 처음 연결되는 키는 빼지 않는다', () => {
    const account = {
      allocation: allocation({ committedCreditLimit: 100, remainingCommitment: 100 }),
      credits: credits(100),
    }

    // 한도 10인 키를 30으로 올린다. 늘어나는 몫은 20이다.
    expect(evaluateAllocation({ ...account, pendingAmount: 30, excludeAmount: 10 }).projected)
      .toBe(120)
    // 같은 30을 처음 연결하는 키에 주면 30이 통째로 늘어난다.
    expect(evaluateAllocation({ ...account, pendingAmount: 30 }).projected).toBe(130)
  })

  test('뺄 금액이 남은 배정보다 커도 음수로 내려가지 않는다', () => {
    const judgement = evaluateAllocation({
      allocation: allocation({ remainingCommitment: 5 }),
      credits: credits(100),
      pendingAmount: 0,
      excludeAmount: 20,
    })

    expect(judgement.remaining).toBe(0)
    expect(judgement.projected).toBe(0)
  })

  // 창 한도는 창마다 다시 채워지므로 화면이 따로 말해야 한다. 판정에는 들어간다.
  test('창마다 다시 채워지는 몫을 따로 돌려준다', () => {
    const judgement = evaluateAllocation({
      allocation: allocation({
        committedCreditLimit: 36,
        committedTotalCap: 10,
        committedDaily: 5,
        committedWeekly: 1,
        committedMonthly: 20,
        remainingCommitment: 36,
      }),
      credits: credits(100),
    })

    expect(judgement.windowCommitment).toBe(26)
    expect(judgement.committed).toBe(36)
  })

  // 30분 지난 잔액으로도 경고는 뜬다. 관측 지연이 결재 지연이 되면 안 된다.
  test('관측이 낡아도 판정은 하고 관측 시각을 함께 돌려준다', () => {
    const stale = { ...credits(10), freshness: 'STALE' as const }
    const judgement = evaluateAllocation({
      allocation: allocation({ remainingCommitment: 50 }),
      credits: stale,
      pendingAmount: 0,
    })

    expect(judgement.state).toBe('EXCEEDED')
    expect(judgement.freshness).toBe('STALE')
    expect(judgement.observedAt).toBe('2026-09-02T09:00:00Z')
  })
})

describe('formatUsd', () => {
  test('관측하지 못한 값과 0을 구분한다', () => {
    expect(formatUsd(null)).toBe('확인 전')
    expect(formatUsd(0)).toBe('$0.00')
  })

  test('음수를 0으로 보정하지 않는다', () => {
    expect(formatUsd(-1.25)).toBe('-$1.25')
  })
})
