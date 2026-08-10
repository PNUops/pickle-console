import type { Scope } from './scope-context'
import { isUuid } from './validation'

/**
 * Every console URL in one place.
 *
 * The scoped listings exist twice — once unscoped and once under a workspace —
 * and a literal typed at the call site is the one kind of link change the
 * compiler cannot catch.
 */
const scoped = (scope: Scope, path: string) =>
  scope == null ? `/console/${path}` : `/console/${scope}/${path}`

export const consolePaths = {
  dashboard: (scope: Scope) => (scope == null ? '/console' : `/console/${scope}`),
  resources: (scope: Scope) => scoped(scope, 'resources'),
  vms: (scope: Scope) => scoped(scope, 'vms'),
  requests: (scope: Scope) => scoped(scope, 'requests'),
  newRequest: (scope: Scope) => scoped(scope, 'requests/new'),

  // Detail pages stay outside the scope: a resource belongs to exactly one
  // workspace, so the segment would carry no information, and every link that
  // already points here — a notification, a bookmark — keeps working.
  vmDetail: (vmId: string) => `/console/vms/${vmId}`,
  vmAccess: (vmId: string) => `/console/vms/${vmId}/access`,
  vmTerminal: (vmId: string) => `/console/vms/${vmId}/terminal`,
  requestDetail: (requestId: string) => `/console/requests/${requestId}`,
  workspaces: '/console/workspaces',
  workspaceDetail: (workspaceId: string) => `/console/workspaces/${workspaceId}`,
  sshKeys: '/console/ssh-keys',
  account: '/console/account',
  notifications: '/console/notifications',
  activity: '/console/activity',
} as const

/** The listings that exist under a workspace as well as unscoped. */
const SCOPED_SECTIONS = ['resources', 'vms', 'requests', 'requests/new']

/**
 * The part of a console path that survives a scope change: the list you are
 * looking at, without the scope segment. Anything that is not a scoped list (a
 * VM's detail, the account screen) belongs to one workspace already, so it
 * drops back to that scope's dashboard.
 */
function consoleSection(pathname: string): string {
  const rest = pathname.replace(/^\/console\/?/, '')
  const segments = rest.split('/').filter(Boolean)
  // The scope segment is a workspace UUID; a section name never looks like one.
  const withoutScope = isUuid(segments[0]) ? segments.slice(1) : segments
  const section = withoutScope.join('/')
  return SCOPED_SECTIONS.includes(section) ? section : ''
}

/**
 * The same screen read through another scope — where switching workspace lands,
 * and where a scope that is not mine falls back to.
 */
export function consolePathInScope(scope: Scope, pathname: string): string {
  const section = consoleSection(pathname)
  return section === '' ? consolePaths.dashboard(scope) : scoped(scope, section)
}
