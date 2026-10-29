import { fetchAuthedBytes } from './client'
import { toApiError } from './problem'

export interface LlmAccountReference {
  id: string; name: string; eligibleForBinding: boolean
  defaultCreditAllowedModels?: string[] | null
  defaultCreditDeniedModels?: string[] | null
}

/** References for the same-source roster/budget command, without account finance or credentials. */
export async function fetchLlmRosterAccountReferences(orgId: string, workspaceId: string): Promise<LlmAccountReference[]> {
  const params = new URLSearchParams({ orgId, workspaceId })
  const response = await fetchAuthedBytes(`/api/v1/admin/llm/roster-account-references?${params}`)
  const body: unknown = await response.json()
  if (!response.ok) throw toApiError(body, '명단 지급에 사용할 사업 계정 참조를 불러오지 못했습니다.')
  if (!Array.isArray(body)) throw new Error('사업 계정 참조 형식을 확인할 수 없습니다.')
  return body as LlmAccountReference[]
}
