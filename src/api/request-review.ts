import { api } from './client'
import { toApiError } from './problem'
import { guardNetwork } from './queries'
import type { components } from './schema'

export function requestReaderKey(user: { id: string; role: string; managedOrgs: readonly { orgId: string; role: string }[]; institutionAuthority?: { state: string; catalogueRevision: string; authorityFingerprint: string | null } | null } | null): string {
  const authority = user?.institutionAuthority
  return user ? `${user.id}:${user.role}:${authority?.state ?? 'UNAVAILABLE'}:${authority?.catalogueRevision ?? ''}:${authority?.authorityFingerprint ?? ''}` : 'no-session'
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
