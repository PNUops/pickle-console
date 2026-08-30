import { createContext } from 'react'
import type { UserRole } from '../auth/auth-context'

export interface AdminOrgOption {
  id: string
  name: string
  /** ORG 계층 계정이 이 기관에서 실제로 가진 역할. SYS 계층은 전역 역할을 쓴다. */
  role?: UserRole
}

export interface AdminScopeValue {
  tier: 'org' | 'system'
  activeOrgId: string | undefined
  activeOrg: AdminOrgOption | undefined
  activeOrgRole: UserRole | undefined
  options: AdminOrgOption[]
  /** ORG 다기관 계정이 아직 기관을 고르지 않은 상태. */
  requiresSelection: boolean
  /** SYS URL 기관이 실제 카탈로그에 있는지 확인하는 동안 true. */
  resolving: boolean
  /** route page를 마운트해도 범위 없는 API가 나가지 않는 상태. */
  ready: boolean
  setActiveOrgId: (orgId: string | undefined) => void
  path: (path: string) => string
}

export const AdminScopeContext = createContext<AdminScopeValue | null>(null)
