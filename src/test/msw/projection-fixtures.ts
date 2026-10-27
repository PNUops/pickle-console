import type { AdminBulkChangeRequest, AdminLlmKeyDetail, LlmAccountImpactProjection, LlmKeyLimitsProjection } from '../../api/queries'
import type { components } from '../../api/schema'

type KeyBasis = Pick<AdminLlmKeyDetail, 'id' | 'status' | 'expiresAt' | 'creditLimit' | 'creditLimitReset' | 'creditUsage' | 'creditAxisConnected' | 'openrouterAccountId'>
type Amounts = components['schemas']['LlmAccountImpactAmounts']
export const adminLlmProjectionFixtures = new Map<string, LlmKeyLimitsProjection>()
export const bulkAccountImpactFixtures = new Map<string, LlmAccountImpactProjection>()
export const capturedAccountStates = new Map<string, { beforeKey: string; afterKey: string; before: Amounts; after: Amounts }>()

/** Match captured cases, without calculating an amount or introducing a write condition. */
export function projectionBasisKey(rows: readonly KeyBasis[]): string {
  return JSON.stringify([...rows].sort((a, b) => a.id.localeCompare(b.id)).map((row) => [row.id, row.status, row.expiresAt ?? null,
    row.creditLimit, row.creditLimitReset ?? null, row.creditUsage ?? null, row.creditAxisConnected, row.openrouterAccountId ?? null]))
}

export function capturedProjectionSupported(snapshot: LlmAccountImpactProjection, rows: readonly KeyBasis[]): boolean {
  return (snapshot.accounts ?? []).every((account) => {
    const basis = capturedAccountStates.get(account.accountId)
    return !!basis && basis.beforeKey === projectionBasisKey(rows.filter((row) => row.openrouterAccountId === account.accountId))
  })
}

export function capturedAllocation(accountId: string, rows: readonly KeyBasis[]): Amounts | null | undefined {
  const basis = capturedAccountStates.get(accountId)
  if (!basis) return undefined
  const current = projectionBasisKey(rows.filter((row) => row.openrouterAccountId === accountId))
  return current === basis.beforeKey ? basis.before : current === basis.afterKey ? basis.after : null
}

export function limitsProjectionFixtureKey(keyId: string, params: URLSearchParams): string {
  return JSON.stringify([keyId, params.has('proposedCreditLimit') ? Number(params.get('proposedCreditLimit')) : null,
    params.get('proposedCreditLimitResetSet') === 'true', params.get('proposedCreditLimitReset') ?? null,
    params.get('proposedOpenrouterAccountId') ?? null])
}

export function bulkImpactFixtureKey(body: Pick<AdminBulkChangeRequest, 'targetType' | 'targetIds' | 'change'>): string {
  return JSON.stringify([body.targetType, [...body.targetIds].sort(), body.change.kind,
    Object.entries(body.change.llmKeyLimits ?? {}).sort(([a], [b]) => a.localeCompare(b))])
}
