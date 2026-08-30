import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface CheckboxProps
  extends Omit<ComponentPropsWithRef<'input'>, 'type' | 'className'> {
  label: ReactNode
  /** Help text rendered below the label. */
  description?: string
  className?: string
}

/** Labeled checkbox for boolean toggles (e.g. 네트워크 옵션). */
export function Checkbox({ label, description, className, ...rest }: CheckboxProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-control border border-stroke-subtle bg-surface-card px-4 py-3',
        'has-checked:border-primary-300 has-checked:bg-brand-subtle',
        'has-disabled:cursor-not-allowed has-disabled:bg-surface-subtle',
        className,
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand-fill disabled:cursor-not-allowed"
        {...rest}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground-primary">{label}</span>
        {description && <span className="text-xs text-foreground-muted">{description}</span>}
      </span>
    </label>
  )
}
