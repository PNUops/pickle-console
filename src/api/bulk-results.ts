import { api } from './client'
import { toApiError } from './problem'
import { guardNetwork, type AdminBulkChangePreview } from './queries'
import type { components } from './schema'

export type AdminBulkOperation = components['schemas']['AdminBulkChangeOperationResponse']

export function fetchAdminBulkPreview(previewId: string): Promise<AdminBulkChangePreview> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/bulk-changes/previews/{previewId}', { params: { path: { previewId } } })
    if (!data) throw toApiError(error, '저장된 미리보기를 불러오지 못했습니다.')
    return data
  })
}

export function fetchAdminBulkOperation(operationId: string): Promise<AdminBulkOperation> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/bulk-changes/operations/{operationId}', { params: { path: { operationId } } })
    if (!data) throw toApiError(error, '저장된 적용 결과를 불러오지 못했습니다.')
    return data
  })
}

export function fetchRecentAdminBulkOperations(): Promise<AdminBulkOperation[]> {
  return guardNetwork(async () => {
    const { data, error } = await api.GET('/admin/bulk-changes/operations')
    if (!data) throw toApiError(error, '최근 적용 결과를 불러오지 못했습니다.')
    return data
  })
}
