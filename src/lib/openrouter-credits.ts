import type {
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
