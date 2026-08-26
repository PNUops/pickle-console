import { isSysTier } from '../../../auth/permissions'
import type { components } from '../../../api/schema'
import { problemResponse } from './auth'

type Profile = components['schemas']['UserProfileResponse']

/**
 * 계약 v0.46.0의 관리자 기관 스코프를 목이 재현한다 (api의 AdminOrgScope와
 * 같은 결정): 시스템 계층은 전 기관을 보고 orgId는 보통 필터다. 기관 계층은
 * 허용된 기관 집합 안만 보고, 그 밖의 기관을 지정하면 존재를 감추는 404다.
 *
 * 허용 집합이 조회('read', 역할을 보유한 기관 전부)냐 행위('operated',
 * 관리자나 운영자인 기관)냐가 두 진입점의 차이고, 감사 로그만 후자를 쓴다.
 */
interface OrgScopeResult {
  /** 404로 끝나야 하면 그 응답, 아니면 null. */
  notFound: Response | null
  /** 이 행의 기관이 응답 범위에 드는가. */
  matches: (rowOrgId: string | null | undefined) => boolean
}

function scopeOf(
  profile: Profile,
  allowed: string[],
  orgId: string | null,
  instance: string,
): OrgScopeResult {
  if (isSysTier(profile.role)) {
    return { notFound: null, matches: (rowOrgId) => !orgId || rowOrgId === orgId }
  }
  if (orgId && !allowed.includes(orgId)) {
    return {
      notFound: problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: '해당 기관을 찾을 수 없습니다.',
        instance,
        code: 'RESOURCE_NOT_FOUND',
      }),
      matches: () => false,
    }
  }
  const inScope = orgId ? [orgId] : allowed
  return {
    notFound: null,
    matches: (rowOrgId) => rowOrgId != null && inScope.includes(rowOrgId),
  }
}

/** 관리자 조회의 기관 스코프 — 역할을 보유한 기관 전부. */
export function adminReadScope(
  profile: Profile,
  orgId: string | null,
  instance: string,
): OrgScopeResult {
  return scopeOf(
    profile,
    profile.managedOrgs.map((org) => org.orgId),
    orgId,
    instance,
  )
}

/** 행위 표면(감사 로그)의 기관 스코프 — 관리자나 운영자인 기관만. */
export function adminOperatedScope(
  profile: Profile,
  orgId: string | null,
  instance: string,
): OrgScopeResult {
  return scopeOf(
    profile,
    profile.managedOrgs
      .filter((org) => org.role === 'ORG_ADMIN' || org.role === 'ORG_MANAGER')
      .map((org) => org.orgId),
    orgId,
    instance,
  )
}
