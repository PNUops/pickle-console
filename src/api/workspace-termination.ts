import { api } from './client'
import { toApiError } from './problem'
import { guardNetwork } from './queries'
import type { components } from './schema'

export type WorkspaceTerminationImpact = components['schemas']['WorkspaceTerminationImpactResponse']

/** Read exact lifecycle effects without submitting a cancellation or deletion. */
export function fetchWorkspaceTerminationImpact(workspaceId: string, { invitationId, admin = false, page = 0, resourcePage = 0 }: {
  invitationId?: string
  admin?: boolean
  page?: number
  resourcePage?: number
} = {}): Promise<WorkspaceTerminationImpact> {
  return guardNetwork(async () => {
    const query = { page, size: 20, resourcePage }
    const result = invitationId
      ? admin
        ? await api.GET('/admin/workspaces/{workspaceId}/invitations/{invitationId}/termination-impact', { params: { path: { workspaceId, invitationId }, query } })
        : await api.GET('/workspaces/{workspaceId}/invitations/{invitationId}/termination-impact', { params: { path: { workspaceId, invitationId }, query } })
      : admin
        ? await api.GET('/admin/workspaces/{workspaceId}/termination-impact', { params: { path: { workspaceId }, query } })
        : await api.GET('/workspaces/{workspaceId}/termination-impact', { params: { path: { workspaceId }, query } })
    if (!result.data) throw toApiError(result.error, '종료 영향을 불러오지 못했습니다.')
    return result.data
  })
}
