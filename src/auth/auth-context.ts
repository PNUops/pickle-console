import { createContext, useContext } from 'react'
import type { components } from '../api/schema'

export type UserProfile = components['schemas']['UserProfile']
export type UserRole = components['schemas']['UserRole']

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthContextValue {
  status: AuthStatus
  user: UserProfile | null
  /** Resolves with the profile on success; rejects with ApiError on failure. */
  login: (email: string, password: string) => Promise<UserProfile>
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
  return role === 'STUDENT' ? '/console' : '/admin'
}
