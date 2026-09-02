import type {
  OpenRouterAccountAllocation,
  OpenRouterAccountCredits,
  OpenRouterCreditsFreshness,
  OpenRouterForecastUnavailableReason,
  OpenRouterUnmanagedSpendUnavailableReason,
} from '../api/queries'

/**
 * 정상일 때는 딱지를 붙이지 않는다. 옆에 몇 분 전 갱신인지 이미 떠 있고,
 * 그 위에 갱신 주기를 한 번 더 적으면 읽는 사람이 셋을 대조해야 한다.
 */
export const FRESHNESS_LABELS: Partial<Record<OpenRouterCreditsFreshness, string>> = {
  STALE: '갱신 지연',
  UNKNOWN: '확인 전',
}

export const FORECAST_REASON_LABELS: Record<OpenRouterForecastUnavailableReason, string> = {
  INSUFFICIENT_HISTORY: '48시간 이상의 관측 이력이 아직 없습니다.',
  RESET_BOUNDARY: '최근 7일 사이에 사용액이 초기화되어 한 구간으로 계산할 수 없습니다.',
  NO_CONSUMPTION: '최근 관측 구간에 증가한 사용액이 없습니다.',
  OUT_OF_RANGE: '계산 결과가 표시할 수 있는 시각 범위를 벗어났습니다.',
}

export const UNMANAGED_REASON_LABELS: Record<OpenRouterUnmanagedSpendUnavailableReason, string> = {
  NO_BASELINE: '비교 기준이 되는 첫 관측이 아직 없습니다.',
  INCOMPLETE_PAIR: '계정 사용액과 키 사용액을 같은 시점에 함께 읽지 못했습니다.',
  RESET_BOUNDARY: '사용액이 초기화되어 기준 시점 이후의 차이를 이어 계산할 수 없습니다.',
}

export const VENDOR_ERROR_LABELS = {
  CREDENTIAL_ERROR: '관리용 키 인증 실패',
  THROTTLED: 'OpenRouter 요청 제한',
  VENDOR_UNAVAILABLE: 'OpenRouter 연결 실패',
  VENDOR_REJECTED: 'OpenRouter가 요청 거부',
} as const

/** USD meter는 1센트 미만 정밀도를 보존하고 음수도 0으로 보정하지 않는다. */
export function formatUsd(value: number | null | undefined): string {
  if (value == null) return '확인 전'
  const sign = value < 0 ? '-' : ''
  return `${sign}$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })}`
}

/**
 * 초과 배정 판정.
 *
 * 잔액과 견주는 쪽은 **배정 합계가 아니라 남은 배정**이다. 잔액은 이미 그 키들이
 * 쓴 금액을 뺀 값이므로, 쓴 금액이 포함된 합계를 거기에 비교하면 같은 지출을 두 번
 * 세고 아직 감당할 수 있는 계정을 초과로 읽는다. 배정 합계는 「얼마를 약속했나」를
 * 답하므로 화면에는 남기되 판정에는 쓰지 않는다.
 *
 * 서버가 판정하지 않는 이유는 지금 입력 중인 금액을 서버가 모르기 때문이다. 그래서
 * 판정은 화면이 하되 **이 함수 하나만** 한다 — 승인 폼, 확인 창, 한도 변경, 계정
 * 상세 넷이 각자 뺄셈을 하면 화면 수만큼 다른 답이 나온다.
 */
export type AllocationVerdict =
  | 'WITHIN'
  | 'EXCEEDED'
  | 'NO_BALANCE'
  | 'NEGATIVE_BALANCE'
  | 'UNKNOWN'

export interface AllocationJudgement {
  state: AllocationVerdict
  /** 경고를 띄울 상태인가. UNKNOWN은 경고가 아니라 안내다. */
  warns: boolean
  /** 확인을 받아야 하는가. 관측 실패로 승인을 막지는 않는다. */
  needsAcknowledgement: boolean
  committed: number
  remaining: number
  /** 남은 배정에 이번 부여액을 더한 값. 자기 한도를 빼는 것은 호출자 몫이다. */
  projected: number
  balance: number | null
  freshness: OpenRouterCreditsFreshness
  observedAt: string | null
  /** 창마다 다시 채워지는 몫. 0이면 전부 총액 캡이다. */
  windowCommitment: number
}

export function evaluateAllocation({
  allocation,
  credits,
  pendingAmount = 0,
  excludeAmount = 0,
}: {
  allocation: OpenRouterAccountAllocation
  credits: OpenRouterAccountCredits
  /** 지금 부여하려는 금액. 계정 상세처럼 부여가 없는 자리는 0. */
  pendingAmount?: number
  /**
   * 합계에서 빼야 할 이 키의 현재 한도. **그 키가 판정 대상 계정에 이미 연결된
   * 경우에만** 값을 넘긴다. 처음 연결되는 키는 합계에 없으므로 빼면 틀린다.
   */
  excludeAmount?: number
}): AllocationJudgement {
  const remaining = Math.max(allocation.remainingCommitment - excludeAmount, 0)
  const projected = remaining + pendingAmount
  const balance = credits.balance ?? null
  const state: AllocationVerdict =
    balance == null
      ? 'UNKNOWN'
      : balance < 0
        ? 'NEGATIVE_BALANCE'
        : balance === 0
          ? 'NO_BALANCE'
          : projected > balance
            ? 'EXCEEDED'
            : 'WITHIN'
  return {
    state,
    warns: state !== 'WITHIN',
    needsAcknowledgement: state !== 'WITHIN' && state !== 'UNKNOWN',
    committed: allocation.committedCreditLimit,
    remaining,
    projected,
    balance,
    freshness: credits.freshness,
    observedAt: credits.observedAt ?? null,
    windowCommitment:
      allocation.committedDaily + allocation.committedWeekly + allocation.committedMonthly,
  }
}
