import type { ComponentPropsWithRef } from 'react'
import { cn } from '../../lib/cn'
import { useFieldContext } from './field-context'

export interface SelectProps extends ComponentPropsWithRef<'select'> {
  invalid?: boolean
}

export function Select({ invalid, className, children, ...rest }: SelectProps) {
  const field = useFieldContext()
  const isInvalid = invalid ?? field?.invalid ?? false
  const describedBy =
    [field?.errorId, field?.descriptionId].filter(Boolean).join(' ') || undefined

  return (
    <div className="relative">
      <select
        id={field?.id}
        aria-invalid={isInvalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-10 w-full cursor-pointer appearance-none rounded-lg border bg-white pr-9 pl-3 text-sm text-neutral-900',
          'focus-visible:outline-2 focus-visible:outline-offset-1',
          'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500',
          isInvalid
            ? 'border-danger-400 focus-visible:outline-danger-600'
            : 'border-neutral-300 focus-visible:outline-primary-600',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-neutral-400"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  )
}
