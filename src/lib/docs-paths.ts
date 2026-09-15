import { isUuid } from './validation'
import { safeInternalPath } from './redirect'

interface GuideLocation {
  pathname: string
  search?: string
  hash?: string
  state?: unknown
}

/** A return target is a console task, never another document or an external URL. */
export function guideNavigationState(location: GuideLocation) {
  const raw = location.state as { guideReturnTo?: unknown } | null
  const candidate = parseGuidePath(location.pathname)
    ? (typeof raw?.guideReturnTo === 'string' ? raw.guideReturnTo : undefined)
    : location.pathname + (location.search ?? '') + (location.hash ?? '')
  const safe = safeInternalPath(candidate)
  if (!safe) return undefined
  const url = new URL(safe, 'https://pickle.invalid')
  if (url.origin !== 'https://pickle.invalid') return undefined
  if (!/^\/(console|admin)(\/|$)/.test(url.pathname) || parseGuidePath(url.pathname)) return undefined
  return { guideReturnTo: safe }
}

export function guideReturnPath(location: GuideLocation) {
  const saved = guideNavigationState(location)?.guideReturnTo
  if (saved) return saved
  const parts = location.pathname.split('/').filter(Boolean)
  if (parts[0] === 'console') return isUuid(parts[1]) ? `/console/${parts[1]}` : '/console'
  if (parts[0] === 'admin') {
    const org = new URLSearchParams(location.search).get('org')
    return org ? `/admin?${new URLSearchParams({ org })}` : '/admin'
  }
  return null
}

export function parseGuidePath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'docs') return { surface: 'public', slug: parts.slice(1).join('/') }
  if (parts[0] === 'admin' && parts[1] === 'docs') {
    return { surface: 'admin', slug: parts.slice(2).join('/') }
  }
  if (parts[0] === 'console') {
    const offset = isUuid(parts[1]) ? 2 : 1
    if (parts[offset] === 'docs') {
      return { surface: 'console', slug: parts.slice(offset + 1).join('/') }
    }
  }
  return null
}

export function publicGuidePath(slug = '', anchor?: string) {
  return `/docs${slug ? `/${slug}` : ''}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`
}

/** Keep only the scope belonging to the current console, never a resource filter. */
export function guidePathFor(location: GuideLocation, slug = '', anchor?: string) {
  const parts = location.pathname.split('/').filter(Boolean)
  const suffix = slug ? `/${slug}` : ''
  const hash = anchor ? `#${encodeURIComponent(anchor)}` : ''
  if (parts[0] === 'admin') {
    const org = new URLSearchParams(location.search).get('org')
    const query = org ? `?${new URLSearchParams({ org })}` : ''
    return `/admin/docs${suffix}${query}${hash}`
  }
  if (parts[0] === 'console') {
    const scope = isUuid(parts[1]) ? `/${parts[1]}` : ''
    return `/console${scope}/docs${suffix}${hash}`
  }
  return publicGuidePath(slug, anchor)
}
