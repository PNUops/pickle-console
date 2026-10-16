import { api } from './client'
import { toApiError } from './problem'
import { guardNetwork } from './queries'
import type { components, operations } from './schema'

export type AdminResourceDeadline = components['schemas']['AdminResourceDeadlineResponse']
export type AdminDeadlineKind = components['schemas']['AdminResourceDeadlineKind']
export type AdminDeadlinePage = components['schemas']['PageResponseAdminResourceDeadlineResponse']
export type AdminDeadlineQuery = NonNullable<operations['listAdminResourceDeadlines']['parameters']['query']>

export function fetchAdminResourceDeadlines(params: AdminDeadlineQuery): Promise<AdminDeadlinePage> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/resource-deadlines', { params: { query: params } })
    if (!data) throw toApiError(error, '자원 기한을 불러오지 못했습니다.')
    return data
  })
}
