import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { fetchAdminRequest } from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { isOrgTier } from '../auth/permissions'
import { adminNotificationPath } from './paths'

export function useNotificationNavigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const sequence = useRef(0)
  const [navigationError, setNavigationError] = useState<string | null>(null)

  useEffect(() => () => { sequence.current += 1 }, [location.key, user?.id])

  async function openNotification(linkPath: string | null | undefined): Promise<boolean> {
    const attempt = ++sequence.current
    setNavigationError(null)
    if (!linkPath) return true
    try {
      let destination = linkPath
      if (linkPath.startsWith('/admin/')) {
        const url = new URL(linkPath, 'https://pickle.invalid')
        const request = /^\/admin\/requests\/([^/]+)\/?$/.exec(url.pathname)
        let targetOrgId = url.searchParams.get('org') ?? undefined
        if (targetOrgId == null && user && isOrgTier(user.role)) {
          // Legacy notifications do not carry an institution. Resolve the authorized
          // request instead of borrowing the institution selected in the shell.
          targetOrgId = request
            ? (await fetchAdminRequest(request[1])).orgId ?? undefined
            : new URLSearchParams(location.search).get('org') ?? undefined
          if (request && targetOrgId == null) throw new Error('신청의 대상 기관을 확인하지 못했습니다.')
        }
        destination = adminNotificationPath(linkPath, targetOrgId)
      }
      if (sequence.current !== attempt) return false
      void navigate(destination)
      return true
    } catch (failure) {
      if (sequence.current === attempt) {
        setNavigationError(toApiError(failure, '알림 대상을 열지 못했습니다. 다시 시도해 주세요.').message)
      }
      return false
    }
  }

  return { openNotification, navigationError }
}
