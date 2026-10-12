import type { ModelPriceAxis, ModelPriceTier, ModelPricing } from '../api/queries'

/**
 * Labels for the vendor's price axes. An axis missing here is still shown,
 * under its vendor name: the server sends axes it has no name for so that a
 * new charge reaches the approver instead of disappearing.
 */
const AXIS_LABELS: Record<string, string> = {
  prompt: '입력',
  completion: '출력',
  input_cache_read: '캐시 읽기',
  input_cache_write: '캐시 쓰기',
  input_cache_write_1h: '캐시 쓰기(1시간)',
  internal_reasoning: '추론',
  image: '이미지 입력',
  image_output: '이미지 출력',
  audio: '오디오 입력',
  input_audio_cache: '오디오 캐시 읽기',
  audio_output: '오디오 출력',
  web_search: '웹 검색',
  request: '요청',
}

const DAY_LABELS: Record<string, string> = {
  monday: '월',
  tuesday: '화',
  wednesday: '수',
  thursday: '목',
  friday: '금',
  saturday: '토',
  sunday: '일',
}

/** The two axes every row already shows on its summary line. */
const SUMMARY_AXES = new Set(['prompt', 'completion'])

export function axisLabel(axis: string): string {
  return AXIS_LABELS[axis] ?? axis
}

/**
 * A dollar amount in the detail view. Unlike the summary line this keeps
 * small values exact: a web search at $0.0025 rounded to three places reads
 * as $0.003, and a per-request fee is exactly where a misread costs most.
 */
export function usd(value: number): string {
  if (value === 0) return '무료'
  if (value >= 100) return `$${Math.round(value).toLocaleString('en-US')}`
  if (value >= 1) return `$${Number(value.toFixed(2))}`
  return `$${Number(value.toPrecision(3))}`
}

export function axisPriceText(axis: ModelPriceAxis): string {
  if (axis.unit === 'PER_MILLION_TOKENS') return `${usd(axis.price)} / 1M`
  if (axis.unit === 'PER_CALL') return `${usd(axis.price)} / 회`
  return `${usd(axis.price)} (단위 미상)`
}

/**
 * Axes beyond input and output that charge something. A zero axis is left
 * out: the operator chose to show what costs money, and a list of free axes
 * would bury the ones that do not.
 */
export function extraAxes(pricing: ModelPricing | null | undefined): ModelPriceAxis[] {
  if (!pricing) return []
  return pricing.axes.filter((axis) => !SUMMARY_AXES.has(axis.axis) && axis.price > 0)
}

/** Whether the row has anything to unfold. */
export function hasPriceDetail(pricing: ModelPricing | null | undefined): boolean {
  return extraAxes(pricing).length > 0 || (pricing?.tiers.length ?? 0) > 0
}

/**
 * The suffix on the summary line that says the detail exists. A missing
 * pricing object is a row the server has not refreshed yet, which is not the
 * same as a model with nothing else to charge, so it says so.
 */
export function priceDetailSummary(pricing: ModelPricing | null | undefined): string | null {
  if (!pricing) return '다른 가격 축 확인 전'
  const parts: string[] = []
  const extra = extraAxes(pricing).length
  if (extra > 0) parts.push(`외 ${extra}개 축`)
  const tiers = pricing.tiers.length
  if (tiers > 0) parts.push(`구간 가격 ${tiers}개`)
  return parts.length > 0 ? parts.join(', ') : null
}

function clock(minute: number): string {
  const h = Math.floor(minute / 60)
  const m = minute % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** When a band applies, as one phrase. */
export function tierCondition(tier: ModelPriceTier): string {
  const parts: string[] = []
  if (tier.minPromptTokens != null) {
    parts.push(`입력 ${tier.minPromptTokens.toLocaleString('ko-KR')} 토큰 초과`)
  }
  if (tier.utcDays.length > 0) {
    parts.push(tier.utcDays.map((day) => DAY_LABELS[day] ?? day).join('·'))
  }
  if (tier.utcStartMinute != null || tier.utcEndMinute != null) {
    parts.push(`UTC ${clock(tier.utcStartMinute ?? 0)}~${clock(tier.utcEndMinute ?? 1440)}`)
  }
  if (tier.otherConditions.length > 0) {
    parts.push(`확인하지 못한 조건 ${tier.otherConditions.join(', ')}`)
  }
  return parts.length > 0 ? parts.join(', ') : '조건 미상'
}

export function tierPrices(tier: ModelPriceTier): string {
  return tier.axes.map((axis) => `${axisLabel(axis.axis)} ${axisPriceText(axis)}`).join(', ')
}
