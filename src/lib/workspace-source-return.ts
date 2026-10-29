import { safeInternalPath } from './redirect'
import { isUuid } from './validation'
import { workspaceListParams, workspaceListState } from './workspace-list'

/** A request may return only to the exact workspace that the server associated with it. */
export function workspaceSourceReturn(value: string | null, workspaceId: string | null | undefined, admin: boolean): string | null {
  if (!workspaceId || !isUuid(workspaceId) || !safeInternalPath(value)) return null
  const url = new URL(value!, 'https://pickle.invalid')
  if (url.hash) return null
  const expectedId = workspaceId.toLowerCase()
  if (!admin) {
    const id = /^\/console\/workspaces\/([^/]+)$/.exec(url.pathname)?.[1]
    return id && isUuid(id) && id.toLowerCase() === expectedId && !url.search
      ? `/console/workspaces/${expectedId}` : null
  }
  if (url.pathname !== '/admin/workspaces') return null
  const rawId = url.searchParams.get('workspaceId')
  const rawOrg = url.searchParams.get('org')
  if (!rawId || !isUuid(rawId) || rawId.toLowerCase() !== expectedId || rawOrg && !isUuid(rawOrg)) return null
  const state = workspaceListState(url.searchParams)
  const params = workspaceListParams({ ...state, inspect: true }, rawOrg?.toLowerCase())
  return `/admin/workspaces?${params}`
}
