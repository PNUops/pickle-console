import { createContext, useContext } from 'react'

export interface FieldContextValue {
  id: string
  descriptionId?: string
  errorId?: string
  invalid: boolean
  /** FormField의 필수 표시 — 별표는 aria-hidden이라 보조 기술에는 이 값이 닿는다. */
  required: boolean
}

export const FieldContext = createContext<FieldContextValue | null>(null)

/** Consumed by Input/Select to pick up label + aria wiring from FormField. */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext)
}
