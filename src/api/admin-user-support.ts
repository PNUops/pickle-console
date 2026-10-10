import { api } from './client'
import { toApiError } from './problem'
import { guardNetwork, type ResourceType, type UserRole } from './queries'
import type { components } from './schema'

export type AdminProfileUpdate = components['schemas']['AdminUpdateProfileRequest']
export type UserResourceAccess = components['schemas']['AdminUserResourceAccessResponse']
export type SupportInvitation = components['schemas']['AdminUserSupportInvitation']
export type UserSupport = components['schemas']['AdminUserSupportResponse']
export type ProfileImpact = components['schemas']['AdminUserProfileImpactResponse']

export function fetchUserSupport(userId: string, orgId?: string): Promise<UserSupport> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/users/{userId}/support', { params: { path: { userId }, query: { orgId } } })
    if (!data) throw toApiError(error, '사용자 관계를 불러오지 못했습니다.')
    return data
  })
}

export function fetchUserResourceAccess(userId: string, type: ResourceType, resourceId: string, orgId?: string): Promise<UserResourceAccess> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/users/{userId}/support/access', { params: { path: { userId }, query: { type, resourceId, orgId } } })
    if (!data) throw toApiError(error, '이 사용자의 접근 조건을 확인하지 못했습니다.')
    return data
  })
}

export function previewUserProfileImpact(userId: string, action: 'PROFILE' | 'ENABLE', profile?: AdminProfileUpdate): Promise<ProfileImpact> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/users/{userId}/profile-impact', { params: { path: { userId } }, body: { action, ...(profile ? { profile } : {}) } })
    if (!data) throw toApiError(error, '변경 영향을 확인하지 못했습니다.')
    return data
  })
}

export function supportsInvitationRead(role?: UserRole): boolean {
  return role === 'ORG_MANAGER' || role === 'ORG_ADMIN' || role === 'SYS_ADMIN'
}
