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
  llmKeys: (scope: Scope) => scoped(scope, 'llm-keys'),
  requests: (scope: Scope) => scoped(scope, 'requests'),
  // 종류를 알고 들어오는 자리가 있다 — 가상머신 목록의 신청 버튼은 무엇을
  // 신청할지 이미 말하고 있으므로, 위저드가 그 종류로 열린다.
  newRequest: (scope: Scope, kind?: string) =>
    scoped(scope, kind ? `requests/new?kind=${kind}` : 'requests/new'),

  // Detail pages stay outside the scope: a resource belongs to exactly one
  // workspace, so the segment would carry no information, and every link that
  // already points here — a notification, a bookmark — keeps working.
  vmDetail: (vmId: string) => `/console/vms/${vmId}`,
  vmAccess: (vmId: string) => `/console/vms/${vmId}/access`,
  llmKeyDetail: (keyId: string) => `/console/llm-keys/${keyId}`,
  llmKeyAccess: (keyId: string) => `/console/llm-keys/${keyId}/access`,
  requestDetail: (requestId: string) => `/console/requests/${requestId}`,
  workspaces: '/console/workspaces',
  workspaceDetail: (workspaceId: string) => `/console/workspaces/${workspaceId}`,
  account: '/console/account',
  notifications: '/console/notifications',
  activity: '/console/activity',
} as const

/** The listings that exist under a workspace as well as unscoped. */
const SCOPED_SECTIONS = ['resources', 'vms', 'llm-keys', 'requests', 'requests/new']

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

/**
 * 웹 터미널 팝업 창의 주소. `/console` 밖에 있는 것은 의도다 — 이 문서는 콘솔
 * 레이아웃도 인증 스택도 마운트하지 않는 별도 문서이고, 라우터를 타지 않는다.
 *
 * 브리지가 소유한 경로는 정확히 `/terminal/ws` 하나뿐이며(nginx `location =`),
 * 아래 파서가 UUID만 인정하므로 그 경로가 팝업 분기에 걸리는 일은 없다.
 */
export const terminalWindowPath = (vmId: string) => `/terminal/${vmId}`

/** VM마다 고정된 창 이름 — 같은 VM을 다시 열면 새 창 대신 기존 창이 뜬다. */
export const terminalWindowName = (vmId: string) => `pickle-terminal-${vmId}`

/** 이 주소가 터미널 팝업이면 대상 VM id, 아니면 null. */
export function parseTerminalWindowVmId(pathname: string): string | null {
  const id = /^\/terminal\/([^/]+)\/?$/.exec(pathname)?.[1]
  return isUuid(id) ? id : null
}
