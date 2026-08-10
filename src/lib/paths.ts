import type { Scope } from './scope-context'

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
  vmDetail: (vmId: number | string) => `/console/vms/${vmId}`,
  vmAccess: (vmId: number | string) => `/console/vms/${vmId}/access`,
  vmTerminal: (vmId: number | string) => `/console/vms/${vmId}/terminal`,
  requestDetail: (requestId: number | string) => `/console/requests/${requestId}`,
  workspaces: '/console/workspaces',
  workspaceDetail: (workspaceId: number | string) => `/console/workspaces/${workspaceId}`,
  sshKeys: '/console/ssh-keys',
  account: '/console/account',
  notifications: '/console/notifications',
  activity: '/console/activity',
} as const
