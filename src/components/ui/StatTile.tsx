import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/cn'
import { Card } from './Card'

export interface StatTileProps {
  label: string
  value: ReactNode
  /** 값 아래의 보조 설명 (선택). */
  hint?: ReactNode
  /** 지정하면 타일 전체가 해당 경로 링크가 된다. */
  to?: string
  tone?: 'normal' | 'danger'
  className?: string
}

/** 대시보드 지표 타일 — 값·라벨·보조 설명, 선택적 링크와 위험 톤. */
export function StatTile({ label, value, hint, to, tone = 'normal', className }: StatTileProps) {
  const body = (
    <div className="px-5 py-4">
      <div className="text-xs font-medium text-neutral-500">{label}</div>
      <div
        className={cn(
          'mt-1 text-2xl font-bold',
          tone === 'danger' ? 'text-danger-600' : 'text-neutral-900',
        )}
      >
        {value}
      </div>
      {hint != null && <div className="mt-0.5 text-xs text-neutral-500">{hint}</div>}
    </div>
  )
  return (
    <Card className={cn(tone === 'danger' && 'border-danger-200', className)}>
      {to ? (
        <Link
          to={to}
          aria-label={label}
          className="block rounded-card hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-primary-600"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  )
}
