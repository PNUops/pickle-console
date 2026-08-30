import type { ComponentPropsWithRef } from 'react'
import { cn } from '../../lib/cn'
import { useFieldContext } from './field-context'

export interface TextareaProps extends ComponentPropsWithRef<'textarea'> {
  /** Marks the textarea invalid when used outside a FormField. */
  invalid?: boolean
}

export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  const field = useFieldContext()
  const isInvalid = invalid ?? field?.invalid ?? false
  const describedBy =
    [field?.errorId, field?.descriptionId].filter(Boolean).join(' ') || undefined

  return (
    <textarea
      id={field?.id}
      aria-invalid={isInvalid || undefined}
      aria-describedby={describedBy}
      rows={3}
      className={cn(
        'w-full rounded-control border bg-surface-card px-3 py-2 text-sm text-foreground-primary',
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
