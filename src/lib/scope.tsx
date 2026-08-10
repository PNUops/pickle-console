import { useEffect, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { matchPath, useLocation, useNavigate } from 'react-router'
import { fetchWorkspaces } from '../api/queries'
import { consolePathInScope } from './paths'
import { ScopeContext, type Scope } from './scope-context'
import { isUuid } from './validation'

/**
 * Publishes the workspace scope the URL asks for.
 *
 * The URL is the truth (a scoped page is `/console/{workspaceId}/…`), so a
 * link or a bookmark carries the scope with it. A workspace I am not in is not
 * a scope at all: the selector would have no option to show for it while every
 * list on screen stayed filtered to it, so the URL falls back to the unscoped
 * screen instead. Reachable by a shared link, and by the back button after
 * leaving a workspace.
 */
export function ScopeProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  // Read from the path rather than from useParams: this provider sits above
  // the routes that carry the segment, so it never sees their params.
  const requested = useMemo<Scope>(() => {
    const match =
      matchPath('/console/:workspaceId', location.pathname) ??
      matchPath('/console/:workspaceId/*', location.pathname)
    const raw = match?.params.workspaceId
    // A segment that is not a UUID names no workspace, so it is no scope —
    // same answer as an unscoped URL, and the membership check below never
    // sees a value that could not have come from the workspace list.
    return isUuid(raw) ? raw : null
  }, [location.pathname])

  // The same query the selector reads, so membership costs no extra request.
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: fetchWorkspaces })
  // Only once the list is in: while it is loading, a workspace I am not in is
  // indistinguishable from one I have simply not been told about yet.
  const rejected =
    requested != null &&
    workspaces.isSuccess &&
    !workspaces.data.some((workspace) => workspace.id === requested)
  const scope = rejected ? null : requested

  useEffect(() => {
    if (!rejected) return
    navigate(consolePathInScope(null, location.pathname), { replace: true })
  }, [rejected, location.pathname, navigate])

  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
}
