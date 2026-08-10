import { useLocation } from 'react-router'

/**
 * The route the app is on, for tests about routing itself (a redirect, a
 * navigation): the router is in memory, so there is no window.location to read.
 * Rendered inside the app's router by `renderApp`; read it with `currentPath`.
 */
export function PathnameProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="app-pathname" hidden>{`${pathname}${search}`}</span>
}
