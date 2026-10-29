import { useId, useState } from 'react'
import { formatTokenCompact, formatTokenDecision, formatTokenExact, isExactTokenCount } from '../lib/token-presentation'

/** Exact values remain available on touch screens and from the keyboard. */
export function TokenValue({ value, decision = false }: { value: number; decision?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const label = decision ? formatTokenDecision(value) : formatTokenCompact(value)
  if (!isExactTokenCount(value) || value < 1000) return <span>{label}</span>
  return <span className="inline-block max-w-full align-top whitespace-normal [overflow-wrap:anywhere]">
    <button type="button" aria-expanded={expanded} aria-controls={id}
      aria-label={`${label}, 정확값 ${expanded ? '닫기' : '보기'}`}
      onClick={() => setExpanded(!expanded)}
      className="cursor-pointer text-left underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus-ring">
      {label}
    </button>
    {expanded && <span id={id} className="mt-1 block text-xs font-normal text-foreground-muted">정확값 {formatTokenExact(value)}</span>}
  </span>
}

export function TokenLimit({ value, daily = false, decision = true }: { value: number | null | undefined; daily?: boolean; decision?: boolean }) {
  if (value === undefined) return <span>제공되지 않음</span>
  if (value === null) return <span>{daily ? '무제한' : '서비스 기본값'}</span>
  return <><TokenValue value={value} decision={decision} />{daily && value === 0 && ' (토큰 사용 불가)'}</>
}

export function TokenInputHint({ value }: { value: string }) {
  if (!value.trim() || !/^\d+$/.test(value.trim())) return null
  return <span className="mt-1 block text-xs text-foreground-muted [overflow-wrap:anywhere]">{formatTokenDecision(Number(value))}</span>
}
