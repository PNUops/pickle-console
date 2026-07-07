import { createContext, useContext } from 'react'

export interface FieldContextValue {
  id: string
  descriptionId?: string
  errorId?: string
  invalid: boolean
}

export const FieldContext = createContext<FieldContextValue | null>(null)

/** Consumed by Input/Select to pick up label + aria wiring from FormField. */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext)
}
