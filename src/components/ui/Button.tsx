import type { ComponentPropsWithRef } from 'react'
import { buttonClass, type ButtonSize, type ButtonVariant } from './button-style'
import { Spinner } from './Spinner'

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
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
      className={buttonClass({ variant, size, className })}
      {...rest}
    >
      {loading && <Spinner size="sm" label="처리 중" />}
      {children}
    </button>
  )
}
