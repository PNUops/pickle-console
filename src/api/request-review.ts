import { api } from './client'
import { toApiError } from './problem'
import { guardNetwork } from './queries'
import type { components } from './schema'

export function requestReaderKey(user: { id: string; role: string; managedOrgs: readonly { orgId: string; role: string }[] } | null): string {
  return user ? `${user.id}:${user.role}:${user.managedOrgs.map((org) => `${org.orgId}:${org.role}`).sort().join(',')}` : 'no-session'
}

export type VmPlacementPreview = components['schemas']['AdminVmPlacementPreviewResponse']
export type GeneratedRequestResource = components['schemas']['AdminRequestGeneratedResourceResponse']
export type RequestReviewContext = components['schemas']['ApprovalContextResponse']

export function previewVmPlacement(body: components['schemas']['AdminVmPlacementPreviewRequest']): Promise<VmPlacementPreview> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/vm-placement/preview', { body })
    if (!data) throw toApiError(error, '배치 후보를 조회하지 못했습니다.')
    return data
  })
}
