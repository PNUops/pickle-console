import { useQuery } from '@tanstack/react-query'
import { fetchOrgs } from '../api/queries'
import { useAuth } from '../auth/auth-context'
import { isSysTier, operatedOrgs } from '../auth/permissions'

export interface OrgOption {
  id: string
  name: string
}

/**
 * 관리자 화면의 기관 선택지 — 계정이 orgId로 지정할 수 있는 기관만 담는다.
 *
 * 시스템 계층은 전 기관 카탈로그를, 기관 계층은 프로필의 관리 기관 목록을 쓴다.
 * 계약 v0.46.0에서 기관 계층의 관리자 조회는 역할을 보유한 기관 안이고, 그 밖의
 * 기관을 지정하면 404로 답하므로, 선택지에 다른 기관을 올리는 것은 곧 고르면
 * 실패하는 항목을 보여주는 것이다.
 *
 * `scope`는 어느 보유 목록을 쓰는지다: 'read'는 역할을 보유한 기관 전부(조회
 * 화면), 'operated'는 관리자나 운영자로 있는 기관만 — 감사 로그가 후자다.
 */
export function useOrgOptions(scope: 'read' | 'operated' = 'read'): OrgOption[] {
  const { user } = useAuth()
  const sysTier = !!user && isSysTier(user.role)
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs, enabled: sysTier })
  if (sysTier) return (orgs.data ?? []).map((org) => ({ id: org.id, name: org.name }))
  const managed = user?.managedOrgs ?? []
  const rows = scope === 'operated' ? operatedOrgs(managed) : managed
  return rows.map((org) => ({ id: org.orgId, name: org.orgName }))
}
