import { api } from './client'
import { toApiError } from './problem'
import type { components } from './schema'

type Schemas = components['schemas']

export type GroupSummary = Schemas['GroupSummary']
export type GroupDetail = Schemas['GroupDetail']
export type GroupMember = Schemas['GroupMember']
export type GroupMemberRole = Schemas['GroupMemberRole']
export type OrgSummary = Schemas['OrgSummary']
export type VmTemplate = Schemas['VmTemplate']
export type CreateVmRequest = Schemas['CreateVmRequest']
export type VmRequestDetail = Schemas['VmRequestDetail']
export type VmRequestPage = Schemas['VmRequestPage']
export type VmRequestStatus = Schemas['VmRequestStatus']
export type VmSummary = Schemas['VmSummary']
export type VmDetail = Schemas['VmDetail']
export type VmPage = Schemas['VmPage']

export interface RequestOptions {
  allowedRootDomains: string[]
  reservedSubdomains: string[]
}

/* ─── query functions (throw ApiError so useQuery surfaces Korean messages) ─── */

export async function fetchGroups(): Promise<GroupSummary[]> {
  const { data, error } = await api.GET('/groups')
  if (!data) throw toApiError(error, '그룹 목록을 불러오지 못했습니다.')
  return data
}

export async function fetchGroup(groupId: number): Promise<GroupDetail> {
  const { data, error } = await api.GET('/groups/{groupId}', {
    params: { path: { groupId } },
  })
  if (!data) throw toApiError(error, '그룹 정보를 불러오지 못했습니다.')
  return data
}

export async function fetchOrgs(): Promise<OrgSummary[]> {
  const { data, error } = await api.GET('/orgs')
  if (!data) throw toApiError(error, '기관 목록을 불러오지 못했습니다.')
  return data
}

export async function fetchTemplates(): Promise<VmTemplate[]> {
  const { data, error } = await api.GET('/templates')
  if (!data) throw toApiError(error, '템플릿 목록을 불러오지 못했습니다.')
  return data
}

export async function fetchRequestOptions(): Promise<RequestOptions> {
  const { data, error } = await api.GET('/meta/request-options')
  if (!data) throw toApiError(error, '신청 선택지를 불러오지 못했습니다.')
  return data
}

export async function fetchVmRequests(params: {
  status?: VmRequestStatus
  page?: number
  size?: number
}): Promise<VmRequestPage> {
  const { data, error } = await api.GET('/vm-requests', { params: { query: params } })
  if (!data) throw toApiError(error, '신청 목록을 불러오지 못했습니다.')
  return data
}

export async function fetchVmRequest(requestId: number): Promise<VmRequestDetail> {
  const { data, error } = await api.GET('/vm-requests/{requestId}', {
    params: { path: { requestId } },
  })
  if (!data) throw toApiError(error, '신청 정보를 불러오지 못했습니다.')
  return data
}

export async function fetchVms(params: { page?: number; size?: number }): Promise<VmPage> {
  const { data, error } = await api.GET('/vms', { params: { query: params } })
  if (!data) throw toApiError(error, 'VM 목록을 불러오지 못했습니다.')
  return data
}

export async function fetchVm(vmId: number): Promise<VmDetail> {
  const { data, error } = await api.GET('/vms/{vmId}', { params: { path: { vmId } } })
  if (!data) throw toApiError(error, 'VM 정보를 불러오지 못했습니다.')
  return data
}
