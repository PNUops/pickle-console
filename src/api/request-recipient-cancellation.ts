import { api } from './client'
import { toApiError } from './problem'
import { guardNetwork } from './queries'
import type { components } from './schema'

export type RecipientCancellationImpact = components['schemas']['RequestRecipientCancellationImpactResponse']
export type RecipientCancellationReceipt = components['schemas']['RequestRecipientCancellationReceipt']
type CancellationBody = components['schemas']['CancelRequestRecipientRequest']

export function fetchRecipientCancellationImpact(requestId: string, recipientId: string, support: boolean): Promise<RecipientCancellationImpact> {
  return guardNetwork(async () => {
    const result = support
      ? await api.GET('/admin/requests/{requestId}/recipients/{recipientId}/cancellation-impact', { params: { path: { requestId, recipientId } } })
      : await api.GET('/requests/{requestId}/recipients/{recipientId}/cancellation-impact', { params: { path: { requestId, recipientId } } })
    if (!result.data) throw toApiError(result.error, '생성 대기 취소 영향을 확인하지 못했습니다.')
    return result.data
  })
}

export function cancelRequestRecipient(requestId: string, recipientId: string, support: boolean, body: CancellationBody): Promise<RecipientCancellationReceipt> {
  return guardNetwork(async () => {
    const result = support
      ? await api.POST('/admin/requests/{requestId}/recipients/{recipientId}/cancel', { params: { path: { requestId, recipientId } }, body })
      : await api.POST('/requests/{requestId}/recipients/{recipientId}/cancel', { params: { path: { requestId, recipientId } }, body })
    if (!result.data) throw toApiError(result.error, '생성 대기 취소 결과를 확인하지 못했습니다.')
    return result.data
  })
}
