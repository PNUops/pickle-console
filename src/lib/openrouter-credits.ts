import type {
  OpenRouterCreditsFreshness,
  OpenRouterForecastUnavailableReason,
  OpenRouterUnmanagedSpendUnavailableReason,
} from '../api/queries'

export const FRESHNESS_LABELS: Record<OpenRouterCreditsFreshness, string> = {
  FRESH: '30분 안에 갱신됨',
  STALE: '갱신 지연',
  UNKNOWN: '확인 전',
}

export const FORECAST_REASON_LABELS: Record<OpenRouterForecastUnavailableReason, string> = {
  INSUFFICIENT_HISTORY: '48시간 이상의 관측 이력이 아직 없습니다.',
  RESET_BOUNDARY: '최근 7일 관측에 reset 경계가 있어 한 소비 구간으로 계산할 수 없습니다.',
  NO_CONSUMPTION: '최근 관측 구간에 증가한 사용액이 없습니다.',
  OUT_OF_RANGE: '계산 결과가 표시할 수 있는 시각 범위를 벗어났습니다.',
}

export const UNMANAGED_REASON_LABELS: Record<OpenRouterUnmanagedSpendUnavailableReason, string> = {
  NO_BASELINE: 'Paired baseline이 아직 만들어지지 않았습니다.',
  INCOMPLETE_PAIR: 'Account와 key 관측을 같은 window에서 완성하지 못했습니다.',
  RESET_BOUNDARY: '사용액 reset 경계가 있어 baseline 이후 차이를 이어 계산할 수 없습니다.',
}

export const VENDOR_ERROR_LABELS = {
  CREDENTIAL_ERROR: 'Credential 확인 실패',
  THROTTLED: 'Vendor 요청 제한',
  VENDOR_UNAVAILABLE: 'Vendor 연결 실패',
  VENDOR_REJECTED: 'Vendor 요청 거부',
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
