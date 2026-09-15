import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../auth/auth-context'
import { cn } from '../lib/cn'
import { guideNavigationState, guidePathFor } from '../lib/docs-paths'
import { adminPath, consolePaths } from '../lib/paths'
import { isUuid } from '../lib/validation'

const linkClass = 'font-medium text-primary-700 underline decoration-primary-300 underline-offset-4 hover:text-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'

export function GuideLink({ slug, anchor, children, className, onClick }: {
  slug: string
  anchor?: string
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  const location = useLocation()
  const to = guidePathFor(location, slug, anchor)
  return (
    <Link to={to} state={guideNavigationState(location)} className={cn(linkClass, className)} onClick={() => {
      onClick?.()
      if (anchor && to === location.pathname + location.search + location.hash) {
        const target = document.getElementById(anchor)
        target?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
        target?.focus({ preventScroll: true })
      }
    }}>{children}</Link>
  )
}

type GuideActionName = 'newRequest' | 'requests' | 'workspaces' | 'account' | 'notices' | 'notifications' | 'vms' | 'llmKeys' | 'dnsDomains'

/** Administrators can read the manual without links to inaccessible user actions. */
export function GuideAction({ action, children }: { action: GuideActionName; children: ReactNode }) {
  const location = useLocation()
  const { user } = useAuth()
  if (user && user.role !== 'USER') {
    if (action !== 'account' && action !== 'notices' && action !== 'notifications') {
      return <span className="font-medium">{children}</span>
    }
    const org = new URLSearchParams(location.search).get('org') ?? undefined
    return <Link className={linkClass} to={adminPath(`/admin/${action}`, org)}>{children}</Link>
  }
  const parts = location.pathname.split('/').filter(Boolean)
  const scope = parts[0] === 'console' && isUuid(parts[1]) ? parts[1] : null
  const path = consolePaths[action]
  const to = typeof path === 'function' ? path(scope) : path
  return <Link className={linkClass} to={to}>{children}</Link>
}
