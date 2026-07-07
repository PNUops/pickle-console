import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Spinner } from '../components/ui'
import { homePathFor, useAuth, type UserRole } from './auth-context'

/**
 * Route guard: requires an authenticated user whose role is in `roles`.
 * Unauthenticated users go to /login (with the attempted path preserved);
 * authenticated users with a different role go to their own home area.
 */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-primary-600">
        <Spinner size="lg" label="세션을 확인하는 중" />
      </div>
    )
  }
  if (status === 'unauthenticated' || !user) {
    const from = location.pathname + location.search + location.hash
    return <Navigate to="/login" replace state={{ from }} />
  }
  if (!roles.includes(user.role)) {
    return <Navigate to={homePathFor(user.role)} replace />
  }
  return <>{children}</>
}
