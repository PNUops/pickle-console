import { useContext } from 'react'
import { ScopeContext, type Scope } from './scope-context'

/** The workspace the current page is scoped to, or null for "everything". */
export function useScope(): Scope {
  return useContext(ScopeContext)
}
