import type { LlmAccountImpactProjection } from '../../api/queries'
import { singleProjectionResponse, limitsProjectionFixture, multiProjectionResponse } from '../llm-projection-fixture'
import { AUTHORITY_OVERRIDES, mockInstitutionAuthority } from './institution-authority'
import { orgViewerProfile, sysAdminUser } from './handlers/auth'
import { adminLlmKeyStore, adminLlmProjectionFixtures, adminTokenUsageStore, limitsProjectionFixtureKey } from './handlers/llm-keys'
import { openRouterAccountStore } from './handlers/openrouter-accounts'
import { bulkSavedPreviews } from './handlers/bulk-changes'
import { bulkAccountImpactFixtures, bulkImpactFixtureKey, capturedAccountStates, projectionBasisKey } from './projection-fixtures'
import { uuid } from './ids'

type Impact = NonNullable<LlmAccountImpactProjection['accounts']>[number]

/** Replay captured synthetic server values. This seed never recalculates a budget. */
export function seedAllocationFixture(scenario: string | null) {
  if (!['single', 'command-only', 'multi'].includes(scenario ?? '')) return null
  const templateKey = structuredClone(adminLlmKeyStore.find((row) => row.id === uuid(171))!)
  const templateAccount = structuredClone(openRouterAccountStore.find((row) => row.id === uuid(410))!)
  const orgId = uuid(1), workspaceId = uuid(12)
  const upsertAccount = (impact: Impact, creditUsage: number | null, linkedKeys: number) => {
    const account = { ...structuredClone(templateAccount), id: impact.accountId, name: impact.accountName,
      orgId, boundKeyCount: linkedKeys, program: null, contact: null, activeCredential: null, rotationCredential: null,
      credentialAvailable: false, eligibleForBinding: false, defaultCreditAllowedModels: [], defaultCreditDeniedModels: [],
      allocation: { ...impact.before, remainingCommitment: impact.before.remainingCommitment!, committedUsage: 0 },
      credits: { ...structuredClone(templateAccount.credits), totalCredits: creditUsage == null ? null : 100, totalUsage: creditUsage, balance: impact.balance ?? null,
        freshness: impact.quality.creditsFreshness, observedAt: impact.balanceObservedAt ?? null,
        lastSuccessAt: impact.quality.creditsLastSuccessAt ?? null, lastAttemptAt: impact.quality.creditsLastAttemptAt ?? null, error: null,
        keysFreshness: impact.quality.keyMetersFreshness, keysLastSuccessAt: impact.quality.keyMetersLastSuccessAt ?? null,
        keysLastAttemptAt: impact.quality.keyMetersLastAttemptAt ?? null, keysError: null,
        averageDailyUsage: null, depletionForecastAt: null, forecastUnavailableReason: 'INSUFFICIENT_HISTORY' as const,
        forecastWindowStartedAt: null, accountUsageSinceBaseline: null, managedUsageSinceBaseline: null, unmanagedSpend: null,
        unmanagedSpendUnavailableReason: 'NO_BASELINE' as const, unmanagedBaselineAt: null, pairedCreditsObservedAt: null, pairedKeysObservedAt: null } }
    const index = openRouterAccountStore.findIndex((row) => row.id === account.id)
    if (index < 0) openRouterAccountStore.push(account)
    else openRouterAccountStore.splice(index, 1, account)
  }
  const upsertKey = (id: string, name: string, accountId: string, accountName: string, creditLimit: number, creditUsage: number | null, revoked = false) => {
    const row = { ...structuredClone(templateKey), id, name, orgId, workspaceId, requestId: null,
      purpose: '합성 서버 제안 비교', status: revoked ? 'REVOKED' as const : 'ACTIVE' as const,
      rpm: null, tpm: null, concurrency: null, dailyTokens: 1000, expiresAt: null, creditLimit,
      creditLimitReset: null, creditUsage, creditUsageAt: creditUsage == null ? null : limitsProjectionFixture.configurationObservedAt,
      creditLimitRemaining: null, openrouterAccountId: accountId, openrouterAccountName: accountName,
      creditAxisConnected: true, creditAllowedModels: [], creditDeniedModels: [], passthroughEndpoints: [], chatEnabled: false,
      initialAccountBindingAllowed: false, limitsProjection: null }
    const index = adminLlmKeyStore.findIndex((key) => key.id === id)
    if (index < 0) adminLlmKeyStore.push(row)
    else adminLlmKeyStore.splice(index, 1, row)
    adminTokenUsageStore.set(id, 0)
  }
  const registerBasis = (impact: Impact, changes: { id: string; credit: number }[]) => {
    const rows = adminLlmKeyStore.filter((key) => key.openrouterAccountId === impact.accountId)
    const after = rows.map((key) => {
      const change = changes.find((item) => item.id === key.id)
      return change ? { ...key, creditLimit: change.credit } : key
    })
    capturedAccountStates.set(impact.accountId, { beforeKey: projectionBasisKey(rows), afterKey: projectionBasisKey(after),
      before: structuredClone(impact.before), after: structuredClone(impact.after) })
  }
  if (scenario === 'single' || scenario === 'command-only') {
    const impact = limitsProjectionFixture.accountImpact.accounts![0]
    upsertAccount(impact, 83, 1)
    upsertKey(singleProjectionResponse.id, singleProjectionResponse.name, impact.accountId, impact.accountName, 10, 5)
    registerBasis(impact, [{ id: singleProjectionResponse.id, credit: 20 }])
    const query = new URLSearchParams({ proposedCreditLimit: '20', proposedCreditLimitResetSet: 'false' })
    adminLlmProjectionFixtures.set(limitsProjectionFixtureKey(singleProjectionResponse.id, query), structuredClone(limitsProjectionFixture))
    if (scenario === 'command-only') {
      const authority = mockInstitutionAuthority(orgViewerProfile)
      authority.accountRole = 'ORG_VIEWER'
      authority.authorityFingerprint = 'synthetic-key-budget-command'
      authority.assignments = [{ ...authority.assignments[0], institutionId: orgId,
        permission: { mode: 'SELECTED', revision: 3, work: ['llm.key.budget'], scopes: { LLM: { mode: 'LISTED', workspaceIds: [workspaceId] } } } }]
      AUTHORITY_OVERRIDES[orgViewerProfile.id] = authority
    }
    return { keyId: singleProjectionResponse.id, accountId: impact.accountId, orgId }
  }
  const preview = structuredClone(multiProjectionResponse)
  const [first, second] = preview.accountImpact!.accounts!
  upsertAccount(first, 96, 2)
  upsertAccount(second, 85, 3)
  const rows = preview.items
  upsertKey(rows[0].targetId, rows[0].name!, first.accountId, first.accountName, 10, 9)
  upsertKey(rows[1].targetId, rows[1].name!, first.accountId, first.accountName, 3, 0)
  upsertKey(rows[2].targetId, rows[2].name!, second.accountId, second.accountName, 2, 1)
  upsertKey(rows[3].targetId, rows[3].name!, second.accountId, second.accountName, 5, 0)
  upsertKey(uuid(9179), 'unaffected unreported', second.accountId, second.accountName, 7, null)
  const skippedAccountId = uuid(9499)
  const empty = { committedCreditLimit: 0, committedTotalCap: 0, committedDaily: 0, committedWeekly: 0, committedMonthly: 0,
    committedKeyCount: 0, remainingCommitment: 0, awaitingProvisionKeyCount: 0, usageUnreportedKeyCount: 0 }
  upsertAccount({ ...structuredClone(first), accountId: skippedAccountId, accountName: 'skipped account', changedKeys: 0,
    before: empty, after: empty, balance: null, balanceObservedAt: null, overAllocated: null,
    quality: { ...first.quality, creditsFreshness: 'UNKNOWN', keyMetersFreshness: 'UNKNOWN', creditsLastSuccessAt: null,
      creditsLastAttemptAt: null, keyMetersLastSuccessAt: null, keyMetersLastAttemptAt: null, balanceUnreported: true } }, null, 1)
  upsertKey(rows[4].targetId, rows[4].name!, skippedAccountId, 'skipped account', 100, 0, true)
  registerBasis(first, [{ id: rows[0].targetId, credit: 5 }, { id: rows[1].targetId, credit: 5 }])
  registerBasis(second, [{ id: rows[2].targetId, credit: 5 }])
  const request = { targetType: preview.targetType, targetIds: rows.map((row) => row.targetId), change: preview.change! }
  bulkAccountImpactFixtures.set(bulkImpactFixtureKey(request), structuredClone(preview.accountImpact!))
  bulkSavedPreviews.set(preview.previewId, { actorId: sysAdminUser.id,
    request, response: preview })
  return { previewId: preview.previewId, orgId }
}
