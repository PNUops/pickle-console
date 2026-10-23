const UNITS = ['', 'K', 'M', 'B'] as const
export const UNKNOWN_TOKEN_VALUE = '정확값 확인 불가'

/** Only safe, nonnegative integers can be presented as exact token counts. */
export function isExactTokenCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

/** Display rounding never feeds an input, comparison, sum or quota decision. */
export function formatTokenCompact(value: number): string {
  if (!isExactTokenCount(value)) return UNKNOWN_TOKEN_VALUE
  let step = 0
  while (value >= 1000 ** (step + 1) && step < UNITS.length - 1) step += 1
  let rounded = Number((value / 1000 ** step).toPrecision(3))
  if (step === 0) return String(value)
  if (rounded >= 1000 && step < UNITS.length - 1) {
    step += 1
    rounded = Number((value / 1000 ** step).toPrecision(3))
  }
  return `${rounded.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 2 })}${UNITS[step]}`
}

function largeGroup(value: number): string {
  if (value % 100 !== 0) return String(value)
  const thousands = Math.floor(value / 1000)
  const hundreds = value % 1000 / 100
  return `${thousands ? `${thousands}천` : ''}${hundreds ? `${hundreds}백` : ''}`
}

/** Four-digit Korean groups retain all digits, without commas inside a group. */
export function formatTokenScale(value: number): string {
  if (!isExactTokenCount(value)) return UNKNOWN_TOKEN_VALUE
  if (value === 0) return '0 토큰'
  const groups: string[] = []
  let rest = value
  for (const unit of ['', '만', '억', '조']) {
    const group = rest % 10000
    if (group > 0) groups.unshift(`${unit ? largeGroup(group) : group}${unit}`)
    rest = Math.floor(rest / 10000)
  }
  return `${groups.join(' ')} 토큰`
}

export function formatTokenExact(value: number): string {
  return isExactTokenCount(value) ? `${value.toLocaleString('ko-KR')} 토큰` : UNKNOWN_TOKEN_VALUE
}

export function formatTokenDecision(value: number): string {
  if (!isExactTokenCount(value)) return UNKNOWN_TOKEN_VALUE
  return value < 1000 ? `${value} 토큰` : `${formatTokenCompact(value)} (${formatTokenScale(value)})`
}

/** Reject inexact intermediates even when later subtraction returns to range. */
export function unpricedTokenCount(input: number, output: number, pricedInput: number, pricedOutput: number): number {
  if (![input, output, pricedInput, pricedOutput].every(isExactTokenCount)) return Number.NaN
  const total = input + output
  const priced = pricedInput + pricedOutput
  const result = total - priced
  return isExactTokenCount(total) && isExactTokenCount(priced) && isExactTokenCount(result) ? result : Number.NaN
}
