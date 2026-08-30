import { Link } from 'react-router'
import pnuLogo from '../assets/pnu-logo.png'
import pnuLogoWhite from '../assets/pnu-logo-white.png'
import { BRAND_NAME, OFFICIAL_SERVICE_NAME } from '../lib/brand'
import { cn } from '../lib/cn'

export type LogoTone = 'default' | 'inverse'
export type PickleSymbolTone = LogoTone | 'monochrome'
export type LogoVariant = 'brand' | 'lockup' | 'symbol' | 'wordmark' | 'endorsement'

export interface PickleSymbolProps {
  className?: string
  decorative?: boolean
  tone?: PickleSymbolTone
}

/** 16px와 단색 출력에서도 형태가 남는 code-native Pickle P symbol. */
export function PickleSymbol({
  className,
  decorative = false,
  tone = 'default',
}: PickleSymbolProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : BRAND_NAME}
      className={cn(
        'shrink-0',
        tone === 'inverse'
          ? 'text-white'
          : tone === 'monochrome'
            ? 'text-current'
            : 'text-brand-fill',
        className,
      )}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5 2h7.4a6.6 6.6 0 0 1 0 13.2H9.4V22H5V2Zm4.4 4.2V11h2.7a2.4 2.4 0 1 0 0-4.8H9.4Z"
      />
    </svg>
  )
}

export interface LogoProps {
  to?: string
  className?: string
  tone?: LogoTone
  variant?: LogoVariant
  size?: 'sm' | 'md'
}

/** 일반 console은 단일 행, 대표 surface는 공식 명칭을 둔 2단 lockup을 쓴다. */
export function Logo({
  to = '/',
  className,
  tone = 'default',
  variant = 'brand',
  size = 'md',
}: LogoProps) {
  const showEmblem = variant === 'brand' || variant === 'lockup' || variant === 'endorsement'
  const showSymbol = variant === 'symbol'
  const showWordmark = variant !== 'symbol'
  const showStackedDescriptor = variant === 'lockup'
  const showInlineDescriptor = variant === 'endorsement'
  const accessibleName =
    showStackedDescriptor || showInlineDescriptor
      ? `${BRAND_NAME}, ${OFFICIAL_SERVICE_NAME}`
      : BRAND_NAME

  return (
    <Link
      to={to}
      aria-label={accessibleName}
      className={cn(
        'inline-flex min-w-0 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2',
        showStackedDescriptor ? 'flex-col items-start gap-1.5' : 'items-center gap-2',
        tone === 'inverse' ? 'focus-visible:outline-primary-300' : 'focus-visible:outline-focus-ring',
        className,
      )}
    >
      <span className={cn('inline-flex min-w-0 items-center', showStackedDescriptor ? 'gap-3' : 'gap-2')}>
        {showEmblem && (
          <img
            src={tone === 'inverse' ? pnuLogoWhite : pnuLogo}
            alt=""
            aria-hidden="true"
            className={cn(
              'w-auto shrink-0',
              size === 'sm' ? 'h-4' : showStackedDescriptor ? 'h-8' : 'h-7',
            )}
          />
        )}
        {showSymbol && (
          <PickleSymbol
            decorative
            tone={tone}
            className={size === 'sm' ? 'size-4' : 'size-7'}
          />
        )}
        {showWordmark && (
          <span
            className={cn(
              'font-bold tracking-[-0.035em]',
              size === 'sm' ? 'text-base' : showStackedDescriptor ? 'text-3xl leading-none' : 'text-lg',
              tone === 'inverse' ? 'text-white' : 'text-foreground-primary',
            )}
          >
            {BRAND_NAME}
          </span>
        )}
        {showInlineDescriptor && (
          <span
            className={cn(
              'hidden border-l pl-2 text-[0.6875rem] leading-tight font-medium sm:inline',
              tone === 'inverse'
                ? 'border-white/30 text-neutral-300'
                : 'border-stroke-default text-foreground-muted',
            )}
          >
            {OFFICIAL_SERVICE_NAME}
          </span>
        )}
      </span>
      {showStackedDescriptor && (
        <span
          className={cn(
            'hidden whitespace-nowrap text-sm leading-none font-medium sm:block',
            tone === 'inverse' ? 'text-neutral-300' : 'text-foreground-muted',
          )}
        >
          {OFFICIAL_SERVICE_NAME}
        </span>
      )}
    </Link>
  )
}
