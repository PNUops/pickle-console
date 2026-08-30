import type { ComponentPropsWithRef } from 'react'
import { cn } from '../../lib/cn'
import { useFieldContext } from './field-context'

export interface InputProps extends ComponentPropsWithRef<'input'> {
  /** Marks the input invalid when used outside a FormField. */
  invalid?: boolean
}

export function Input({
  invalid,
  className,
  'aria-describedby': ariaDescribedBy,
  ...rest
}: InputProps) {
  const field = useFieldContext()
  const isInvalid = invalid ?? field?.invalid ?? false
  // 호출부가 준 aria-describedby는 필드 컨텍스트의 설명·오류를 덮지 않고 덧붙인다.
  const describedBy =
    [field?.errorId, field?.descriptionId, ariaDescribedBy].filter(Boolean).join(' ') || undefined

  return (
    <input
      id={field?.id}
      aria-invalid={isInvalid || undefined}
      aria-describedby={describedBy}
      className={cn(
        'control-height w-full rounded-control border bg-surface-card px-3 text-sm text-foreground-primary',
        'placeholder:text-foreground-disabled',
        'focus-visible:outline-2 focus-visible:outline-offset-1',
        'disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-foreground-disabled',
        isInvalid
          ? 'border-danger-400 focus-visible:outline-danger-600'
          : 'border-stroke-default focus-visible:outline-focus-ring',
        className,
      )}
      {...rest}
    />
  )
}
