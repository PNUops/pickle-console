import type { RequestStatus, ResourceType } from '../api/queries'
import { REQUEST_STATUS_LABELS } from './status'
import { adminPaths } from './paths'
import { safeInternalPath } from './redirect'
import { isUuid } from './validation'

/** Match the API's zero-based integer page without forwarding malformed values. */
export function listPage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 0
  const page = Number(value)
  return Number.isSafeInteger(page) && page <= 2_147_483_647 ? page : 0
}

export function updateListParams(
  current: URLSearchParams,
  changes: Record<string, string | number | undefined>,
  resetPage = false,
): URLSearchParams {
  const next = new URLSearchParams(current)
  if (resetPage) next.delete('page')
  for (const [key, value] of Object.entries(changes)) {
    if (value == null || value === '' || (key === 'page' && value === 0)) next.delete(key)
    else next.set(key, String(value))
  }
  return next
}

const REQUEST_TYPES: ResourceType[] = ['VM', 'LLM_API_KEY', 'GPU', 'DOMAIN']

function isoDate(value: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined
}

export function requestListState(params: URLSearchParams) {
  const rawStatus = params.get('status')
  const status: RequestStatus | undefined = rawStatus === 'all'
    ? undefined
    : rawStatus && Object.hasOwn(REQUEST_STATUS_LABELS, rawStatus)
      ? rawStatus as RequestStatus
      : 'SUBMITTED'
  const type = REQUEST_TYPES.find((item) => item === params.get('type'))
  const rawWorkspaceId = params.get('workspaceId')
  const workspaceId = rawWorkspaceId && isUuid(rawWorkspaceId) ? rawWorkspaceId.toLowerCase() : undefined
  const rawUserId = params.get('relatedUserId')
  const relatedUserId = rawUserId && isUuid(rawUserId) ? rawUserId.toLowerCase() : undefined
  const reqIndefinite = params.get('reqIndefinite') === 'true' ? true : params.get('reqIndefinite') === 'false' ? false : undefined
  return { status, type, workspaceId, relatedUserId, q: (params.get('q') ?? '').slice(0, 100),
    requestedEndFrom: reqIndefinite === true ? undefined : isoDate(params.get('requestedEndFrom')),
    requestedEndTo: reqIndefinite === true ? undefined : isoDate(params.get('requestedEndTo')),
    reqIndefinite,
    page: listPage(params.get('page')) }
}

export function requestListParams(
  state: ReturnType<typeof requestListState>,
  orgId: string | undefined,
): URLSearchParams {
  const params = new URLSearchParams()
  if (orgId) params.set('org', orgId)
  if (state.status == null) params.set('status', 'all')
  else if (state.status !== 'SUBMITTED') params.set('status', state.status)
  if (state.type) params.set('type', state.type)
  if (state.workspaceId) params.set('workspaceId', state.workspaceId)
  if (state.relatedUserId) params.set('relatedUserId', state.relatedUserId)
  if (state.q) params.set('q', state.q)
  if (state.reqIndefinite !== true && state.requestedEndFrom) params.set('requestedEndFrom', state.requestedEndFrom)
  if (state.reqIndefinite !== true && state.requestedEndTo) params.set('requestedEndTo', state.requestedEndTo)
  if (state.reqIndefinite != null) params.set('reqIndefinite', String(state.reqIndefinite))
  if (state.page > 0) params.set('page', String(state.page))
  return params
}

/** Keep a list's context separate from the institution of the detail target. */
export function withListReturn(path: string, listPath: string): string {
  const url = new URL(path, 'https://pickle.invalid')
  url.searchParams.set('returnTo', listPath)
  return `${url.pathname}${url.search}${url.hash}`
}

/** Preserve a validated request destination and its originating request list. */
export function requestDetailReturn(value: string | null, activeOrgId: string | undefined, systemTier: boolean): string | null {
  if (!safeInternalPath(value)) return null
  const url = new URL(value!, 'https://pickle.invalid')
  const id = /^\/admin\/requests\/([^/]+)$/.exec(url.pathname)?.[1]
  const rawOrg = url.searchParams.get('org')
  if (!id || !isUuid(id) || url.hash || rawOrg && !isUuid(rawOrg)) return null
  const orgId = rawOrg?.toLowerCase() ?? undefined
  if (!systemTier && orgId !== activeOrgId) return null
  return withListReturn(adminPaths.requestDetail(id.toLowerCase(), orgId), requestListReturn(url.searchParams.get('returnTo'), orgId, systemTier))
}

/** Only the originating request list is a supported return destination. */
export function requestListReturn(
  value: string | null,
  activeOrgId: string | undefined,
  systemTier: boolean,
): string {
  const fallback = adminPaths.requests(activeOrgId)
  if (!safeInternalPath(value)) return fallback
  const url = new URL(value!, 'https://pickle.invalid')
  if (url.pathname !== '/admin/requests') return fallback
  const rawOrgId = url.searchParams.get('org') ?? undefined
  const orgId = rawOrgId && isUuid(rawOrgId) ? rawOrgId.toLowerCase() : rawOrgId
  if (orgId !== activeOrgId && !(systemTier && orgId == null)) return fallback
  const params = requestListParams(requestListState(url.searchParams), orgId)
  return `/admin/requests${params.size ? `?${params}` : ''}`
}
