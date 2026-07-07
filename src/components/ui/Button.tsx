import type { ComponentPropsWithRef } from 'react'
import { cn } from '../../lib/cn'
import { Spinner } from './Spinner'

const variants = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 disabled:bg-primary-300',
  secondary:
    'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 disabled:text-neutral-400',
  danger:
    'bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-800 disabled:bg-danger-300',
  ghost:
    'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 active:bg-neutral-200 disabled:text-neutral-400',
} as const

const sizes = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
} as const

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  /** Shows a spinner and disables the button. */
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center rounded-lg font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
        'disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner size="sm" label="처리 중" />}
      {children}
    </button>
  )
}
