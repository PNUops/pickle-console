import { useEffect, useMemo, type ReactNode } from 'react'
import { matchPath, useLocation } from 'react-router'
import { ScopeContext, type Scope } from './scope-context'
import { rememberScope } from './scope-storage'

/**
 * Publishes the workspace scope the URL asks for.
 *
 * The URL is the truth (a scoped page is `/console/{workspaceId}/…`), so a
 * link or a bookmark carries the scope with it. The remembered value only
 * decides where an unscoped entry point sends you next time.
 */
export function ScopeProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  // Read from the path rather than from useParams: this provider sits above
  // the routes that carry the segment, so it never sees their params.
  const scope = useMemo<Scope>(() => {
    const match =
      matchPath('/console/:workspaceId', location.pathname) ??
      matchPath('/console/:workspaceId/*', location.pathname)
    const raw = match?.params.workspaceId
    if (raw == null) return null
    const asNumber = Number(raw)
    return Number.isFinite(asNumber) ? asNumber : null
  }, [location.pathname])

  useEffect(() => {
    rememberScope(scope)
  }, [scope])

  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
}
