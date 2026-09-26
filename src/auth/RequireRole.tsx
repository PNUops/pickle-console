import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Spinner } from '../components/ui'
import { homePathFor, useAuth, type UserRole } from './auth-context'
import { ConsentGate } from './ConsentGate'
import { ProfileGate } from './ProfileGate'

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
  // Lazy consent enforcement: a post-signup revision surfaces here (API not blocked).
  if (user.pendingConsents.length > 0) {
    return <ConsentGate pending={user.pendingConsents} />
  }
  // Terms before the profile: taking personal data before the privacy policy
  // is agreed to is the wrong way round. Both are gates, and both decide from a
  // flag the server sends rather than from the fields.
  //
  // The profile gate comes before the shell, and so before the 2FA enrolment
  // screen that lives inside it. The server exempts PUT /me/profile from the
  // enrolment scope restriction for exactly that reason.
  if (!user.profileComplete) {
    return <ProfileGate user={user} />
  }
  return <>{children}</>
}
