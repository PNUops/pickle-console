import { createContext, useContext } from 'react'
import type { components } from '../api/schema'

export type UserProfile = components['schemas']['UserProfileResponse']
export type UserRole = components['schemas']['UserRole']
/** 이 계정이 관리하는 기관 하나와 그 기관에서의 역할 (contract v0.46.0). */
export type ManagedOrg = components['schemas']['ManagedOrgResponse']

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

/**
 * Login stage-1 result: either fully authenticated, or a 2FA challenge the
 * caller completes with {@link AuthContextValue.completeMfa}.
 */
export type LoginResult =
  | { kind: 'authenticated'; user: UserProfile }
  | { kind: 'mfaRequired'; mfaToken: string }

export interface AuthContextValue {
  status: AuthStatus
  user: UserProfile | null
  /** Resolves with the login outcome (authenticated or MFA challenge); rejects with ApiError. */
  login: (email: string, password: string) => Promise<LoginResult>
  /** Login stage-2: submit a TOTP code or recovery code for a pending MFA challenge. */
  completeMfa: (input: { mfaToken: string; code?: string; recoveryCode?: string }) => Promise<UserProfile>
  /** Re-fetch /me and update the cached profile (after 2FA enrol/disable, consent). */
  refreshProfile: () => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

/** Landing area for a role after login. */
export function homePathFor(role: UserRole): string {
  return role === 'USER' ? '/console' : '/admin'
}
