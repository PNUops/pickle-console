import { Link } from 'react-router'
import pnuEmblem from '../assets/pnu-emblem.png'
import { SERVICE_NAME } from '../lib/brand'
import { cn } from '../lib/cn'

export function Logo({
  to = '/',
  className,
  tone = 'default',
}: {
  to?: string
  className?: string
  /** default: 라이트 배경용(어두운 워드마크) / inverse: 다크 배경용(흰 워드마크) */
  tone?: 'default' | 'inverse'
}) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center gap-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2',
        tone === 'inverse'
          ? 'focus-visible:outline-primary-300'
          : 'focus-visible:outline-primary-600',
        className,
      )}
    >
      {/* 부산대 엠블럼 원본이 흰 바탕 정사각형이라 rounded-full 클리핑으로 원형만 남긴다 */}
      <img
        src={pnuEmblem}
        alt=""
        aria-hidden="true"
        className="size-7 shrink-0 rounded-full"
      />
      <span
        className={cn(
          'text-lg font-bold tracking-tight',
          tone === 'inverse' ? 'text-white' : 'text-neutral-900',
        )}
      >
        {SERVICE_NAME}
      </span>
    </Link>
  )
}
