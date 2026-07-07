import { useId, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { FieldContext } from './field-context'

export interface FormFieldProps {
  label: string
  /** Field-level validation error. Rendered below the control and linked via aria-describedby. */
  error?: string
  /** Help text rendered below the label. */
  description?: string
  required?: boolean
  className?: string
  children: ReactNode
}

export function FormField({ label, error, description, required, className, children }: FormFieldProps) {
  const id = useId()
  const descriptionId = description ? `${id}-description` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-0.5">
        <label htmlFor={id} className="text-sm font-medium text-neutral-700">
          {label}
        </label>
        {required && (
          <span aria-hidden="true" className="text-danger-600">
            *
          </span>
        )}
      </div>
      {description && (
        <p id={descriptionId} className="text-xs text-neutral-500">
          {description}
        </p>
      )}
      <FieldContext.Provider value={{ id, descriptionId, errorId, invalid: Boolean(error) }}>
        {children}
      </FieldContext.Provider>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
    </div>
  )
}
