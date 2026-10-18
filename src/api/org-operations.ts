import { api } from './client'
import { toApiError } from './problem'
import { guardNetwork } from './queries'
import type { components } from './schema'

type Schemas = components['schemas']
export type OrgOperations = Schemas['AdminOrgOperationsResponse']
export type OrgOperationsMember = Schemas['AdminOrgRoleMemberView']
export type OrgOperationsPreview = Schemas['OrgOperationsPreviewResponse']
export type SaveOrgOperations = Schemas['SaveOrgOperationsRequest']
export type SaveRequestMail = Schemas['SaveOrgRequestMailSettingsRequest']
export type PermissionInput = Schemas['InstitutionPermissionInput']
export interface RequestMailTarget { requestType: Schemas['ResourceType']; workspaceId: string }
export type RequestMailTargetOption = NonNullable<OrgOperations['selectionTargets']>[number]

export function fetchOrgOperations(orgId: string, requesterId?: string, target?: RequestMailTarget | null): Promise<OrgOperations> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/orgs/{orgId}/operations', { params: { path: { orgId }, query: { requesterId, ...target } } })
    if (!data) throw toApiError(error, '기관 운영 설정을 불러오지 못했습니다.')
    return data
  })
}

export function previewOrgOperations(orgId: string, body: SaveOrgOperations): Promise<OrgOperationsPreview> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/orgs/{orgId}/operations/preview', { params: { path: { orgId } }, body })
    if (!data) throw toApiError(error, '기관 권한 변경안을 확인하지 못했습니다.')
    return data
  })
}

export function saveOrgOperations(orgId: string, body: SaveOrgOperations): Promise<OrgOperations> {
  return guardNetwork(async () => {
    const { data, error } = await api.PUT('/admin/orgs/{orgId}/operations', { params: { path: { orgId } }, body })
    if (!data) throw toApiError(error, '기관 권한을 저장하지 못했습니다.')
    return data
  })
}

export function previewRequestMail(orgId: string, body: SaveRequestMail, target?: RequestMailTarget | null): Promise<OrgOperationsPreview> {
  return guardNetwork(async () => {
    const { data, error } = await api.POST('/admin/orgs/{orgId}/operations/request-mail/preview', { params: { path: { orgId }, query: target ?? undefined }, body })
    if (!data) throw toApiError(error, '신청 메일 수신 변경안을 확인하지 못했습니다.')
    return data
  })
}

export function saveRequestMail(orgId: string, body: SaveRequestMail): Promise<OrgOperations> {
  return guardNetwork(async () => {
    const { data, error } = await api.PUT('/admin/orgs/{orgId}/operations/request-mail', { params: { path: { orgId } }, body })
    if (!data) throw toApiError(error, '신청 메일 수신 설정을 저장하지 못했습니다.')
    return data
  })
}
