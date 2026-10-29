import { api } from './client'
import { toApiError } from './problem'
import { guardNetwork, type WorkspaceInvitationEntry } from './queries'
import type { components } from './schema'
import type { AccessConfirmation, ActorAccessImpact } from './resource-access'

type Schemas = components['schemas']

export function updateAdminWorkspace(workspaceId: string, body: Schemas['UpdateWorkspaceRequest']) {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/admin/workspaces/{workspaceId}', { params: { path: { workspaceId } }, body })
    if (!data) throw toApiError(error, '워크스페이스 정보를 수정하지 못했습니다.')
    return data
  })
}

export function previewAdminWorkspaceMember(workspaceId: string, userId: string, body: Schemas['UpdateWorkspaceMemberRequest']): Promise<ActorAccessImpact> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/workspaces/{workspaceId}/members/{userId}/preview', { params: { path: { workspaceId, userId } }, body })
    if (!data) throw toApiError(error, '소유자 변경 영향을 확인하지 못했습니다.')
    return data
  })
}

export function updateAdminWorkspaceMember(workspaceId: string, userId: string, body: Schemas['UpdateWorkspaceMemberRequest']) {
  return guardNetwork(async () => {
    const { data, error } = await api.PATCH('/admin/workspaces/{workspaceId}/members/{userId}', { params: { path: { workspaceId, userId } }, body })
    if (!data) throw toApiError(error, '구성원 역할을 변경하지 못했습니다.')
    return data
  })
}

export function removeAdminWorkspaceMember(workspaceId: string, userId: string) {
  return guardNetwork(async () => {
    const { error, response } = await api.DELETE('/admin/workspaces/{workspaceId}/members/{userId}', { params: { path: { workspaceId, userId } } })
    if (!response.ok) throw toApiError(error, '구성원을 제거하지 못했습니다.')
  })
}

export function previewAdminWorkspaceInvitations(workspaceId: string, entries: WorkspaceInvitationEntry[]): Promise<ActorAccessImpact> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/workspaces/{workspaceId}/invitations/preview', { params: { path: { workspaceId } }, body: { entries } })
    if (!data) throw toApiError(error, '초대 영향을 확인하지 못했습니다.')
    return data
  })
}

export function inviteAdminWorkspaceMembers(workspaceId: string, entries: WorkspaceInvitationEntry[], confirmation?: AccessConfirmation) {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/workspaces/{workspaceId}/invitations', { params: { path: { workspaceId } }, body: { entries, ...(confirmation ? { confirmation } : {}) } })
    if (!data) throw toApiError(error, '구성원을 초대하지 못했습니다.')
    return data
  })
}

export function cancelAdminWorkspaceInvitation(workspaceId: string, invitationId: string, confirmation: Schemas['TerminationConfirmation']) {
  return guardNetwork(async () => {
    const { error, response } = await api.DELETE('/admin/workspaces/{workspaceId}/invitations/{invitationId}', { params: { path: { workspaceId, invitationId } }, body: { confirmation } })
    if (!response.ok) throw toApiError(error, '초대를 취소하지 못했습니다.')
  })
}

export function deleteAdminWorkspace(workspaceId: string, confirmation: Schemas['TerminationConfirmation']) {
  return guardNetwork(async () => {
    const { error, response } = await api.DELETE('/admin/workspaces/{workspaceId}', { params: { path: { workspaceId } }, body: { confirmation } })
    if (!response.ok) throw toApiError(error, '워크스페이스를 삭제하지 못했습니다.')
  })
}
