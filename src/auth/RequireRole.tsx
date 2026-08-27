import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Spinner } from '../components/ui'
import { homePathFor, useAuth, type UserRole } from './auth-context'
import { ConsentGate } from './ConsentGate'
import { ProfilePrompt } from './ProfilePrompt'

/**
 * Route guard: requires an authenticated user whose role is in `roles`.
 * Unauthenticated users go to /login (with the attempted path preserved);
 * authenticated users with a different role go to their own home area.
 */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { status, user, refreshProfile } = useAuth()
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
  // 약관 다음에 프로필. 개인정보처리방침에 동의하기 전에 개인정보를 받는 것은 순서가
  // 거꾸로다. 약관은 법적 선행 조건이라 게이트로 남고, 프로필은 선택 입력이라 셸
  // 위에 뜨는 안내다. 판단은 서버가 내려보내는 플래그 하나로만 한다.
  return (
    <>
      {children}
      {!user.profileComplete && <ProfilePrompt user={user} onSaved={refreshProfile} />}
    </>
  )
}
