import { listPage } from './list-url'
import { adminPaths } from './paths'
import { safeInternalPath } from './redirect'
import { isUuid } from './validation'

/** Only the notice list can be a return destination for its authoring pages. */
export function noticeListReturn(value: string | null, activeOrgId?: string, systemTier = false): string {
  const fallback = adminPaths.notices(activeOrgId)
  if (!safeInternalPath(value)) return fallback
  const url = new URL(value!, 'https://pickle.invalid')
  if (url.pathname !== '/admin/notices' || url.hash) return fallback
  const rawOrgId = url.searchParams.get('org') || undefined
  if (rawOrgId && !isUuid(rawOrgId)) return fallback
  const orgId = rawOrgId?.toLowerCase()
  if (orgId && orgId !== activeOrgId) return fallback
  const selected = url.searchParams.get('selected')
  return adminPaths.notices(orgId ?? (systemTier ? undefined : activeOrgId), listPage(url.searchParams.get('page')), selected && isUuid(selected) ? selected.toLowerCase() : undefined)
}

export function noticeListWithoutSelection(path: string): string {
  const url = new URL(path, 'https://pickle.invalid')
  url.searchParams.delete('selected')
  return `${url.pathname}${url.search}`
}

export function noticeListWithSelection(path: string, noticeId: string): string {
  const url = new URL(path, 'https://pickle.invalid')
  url.searchParams.set('selected', noticeId)
  return `${url.pathname}${url.search}`
}
