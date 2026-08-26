import { Link } from 'react-router'
import pnuLogo from '../assets/pnu-logo.png'
import pnuLogoWhite from '../assets/pnu-logo-white.png'
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
      {/* 엠블럼은 배경이 투명하므로 클리핑이 필요 없고, 다크 배경에서는 흰 단색 버전을 쓴다 */}
      <img
        src={tone === 'inverse' ? pnuLogoWhite : pnuLogo}
        alt=""
        aria-hidden="true"
        className="h-7 w-auto shrink-0"
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
