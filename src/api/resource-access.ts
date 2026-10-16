import { api } from './client'
import { toApiError } from './problem'
import { guardNetwork, type ResourceType, type VmAccessGrant, type VmAccessList } from './queries'
import type { components } from './schema'

export type AccessConfirmation = components['schemas']['AccessConfirmation']
export type ActorAccessImpact = components['schemas']['ActorAccessImpact']
export type AccessChangePreview = components['schemas']['ResourceAccessChangePreviewRequest']
export type AddAccessGrant = components['schemas']['AddResourceAccessGrantRequest']
export type UpdateAccessGrant = components['schemas']['UpdateResourceAccessGrantRequest']

export function fetchAdminResourceAccess(resourceType: ResourceType, resourceId: string): Promise<VmAccessList> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/resource-access/{resourceType}/{resourceId}', { params: { path: { resourceType, resourceId } } })
    if (!data) throw toApiError(error, '접근 권한을 불러오지 못했습니다.')
    return data
  })
}

export function previewResourceAccess(resourceType: ResourceType, resourceId: string, body: AccessChangePreview, support = false): Promise<ActorAccessImpact> {
  return guardNetwork(async () => {
    const result = support
      ? await api.POST('/admin/resource-access/{resourceType}/{resourceId}/preview', { params: { path: { resourceType, resourceId } }, body })
      : resourceType === 'VM'
        ? await api.POST('/vms/{vmId}/access/preview', { params: { path: { vmId: resourceId } }, body })
        : resourceType === 'DOMAIN'
          ? await api.POST('/dns-domains/{domainId}/access/preview', { params: { path: { domainId: resourceId } }, body })
          : resourceType === 'LLM_API_KEY'
            ? await api.POST('/llm-keys/{keyId}/access/preview', { params: { path: { keyId: resourceId } }, body })
            : await api.POST('/gpu-allocations/{allocationId}/access/preview', { params: { path: { allocationId: resourceId } }, body })
    if (!result.data) throw toApiError(result.error, '얻게 되는 접근 권한을 확인하지 못했습니다.')
    return result.data
  })
}

export function addAdminResourceAccess(resourceType: ResourceType, resourceId: string, body: AddAccessGrant): Promise<VmAccessGrant> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/resource-access/{resourceType}/{resourceId}', { params: { path: { resourceType, resourceId } }, body })
    if (!data) throw toApiError(error, '접근 권한을 부여하지 못했습니다.')
    return data
  })
}

export function updateAdminResourceAccess(resourceType: ResourceType, resourceId: string, grantId: string, body: UpdateAccessGrant): Promise<VmAccessGrant> {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/admin/resource-access/{resourceType}/{resourceId}/{grantId}', { params: { path: { resourceType, resourceId, grantId } }, body })
    if (!data) throw toApiError(error, '등급을 변경하지 못했습니다.')
    return data
  })
}

export function removeAdminResourceAccess(resourceType: ResourceType, resourceId: string, grantId: string): Promise<void> {
  return guardNetwork(async () => {
    const { error, response } = await api.DELETE('/admin/resource-access/{resourceType}/{resourceId}/{grantId}', { params: { path: { resourceType, resourceId, grantId } } })
    if (!response.ok) throw toApiError(error, '접근 권한을 회수하지 못했습니다.')
  })
}
