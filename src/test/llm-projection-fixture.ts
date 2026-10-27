import type { AdminBulkChangePreview, AdminLlmKeyDetail, LlmKeyLimitsProjection } from '../api/queries'
import single from './fixtures/llm-limits-projection.json'
import bulk from './fixtures/llm-bulk-impact-preview.json'
import multi from './fixtures/llm-bulk-multi-account.json'

if (single.status !== 'ACTIVE' || single.limitsProjection.accountImpact.state !== 'AVAILABLE'
  || single.limitsProjection.accountImpact.accounts.some((row) => row.quality.creditsFreshness !== 'FRESH' || row.quality.keyMetersFreshness !== 'FRESH')) {
  throw new Error('Unexpected synthetic projection fixture state')
}

/** Captured synthetic HTTP values; amounts are never recomputed by this fixture adapter. */
export const limitsProjectionFixture: LlmKeyLimitsProjection = {
  ...single.limitsProjection,
  accountImpact: { ...single.limitsProjection.accountImpact, state: 'AVAILABLE', accounts: single.limitsProjection.accountImpact.accounts.map((row) => ({
    ...row, quality: { ...row.quality, creditsFreshness: 'FRESH', keyMetersFreshness: 'FRESH' },
  })) },
}

export const singleProjectionResponse: AdminLlmKeyDetail = { ...single, status: 'ACTIVE', limitsProjection: limitsProjectionFixture }
export const bulkProjectionResponse: AdminBulkChangePreview = {
  ...bulk, targetType: 'LLM_KEY', change: { ...bulk.change, kind: 'LLM_KEY_LIMITS' }, accountImpact: limitsProjectionFixture.accountImpact,
}

if (multi.accountImpact.accounts.some((row) => row.quality.creditsFreshness !== 'FRESH' || row.quality.keyMetersFreshness !== 'UNKNOWN')
  || multi.items.some((row) => row.reason != null && row.reason !== 'INVALID_STATE')) throw new Error('Unexpected synthetic multi-account fixture state')

export const multiProjectionResponse: AdminBulkChangePreview = {
  ...multi, targetType: 'LLM_KEY', change: { ...multi.change, kind: 'LLM_KEY_LIMITS' },
  items: multi.items.map((row) => ({ ...row, reason: row.reason == null ? null : 'INVALID_STATE' })),
  accountImpact: { ...multi.accountImpact, state: 'AVAILABLE', accounts: multi.accountImpact.accounts.map((row) => ({
    ...row, quality: { ...row.quality, creditsFreshness: 'FRESH', keyMetersFreshness: 'UNKNOWN' },
  })) },
}

/** Only relational identity labels are mapped; the server's numeric snapshot stays intact. */
export function mappedLimitsProjection(accountId: string, accountName: string): LlmKeyLimitsProjection {
  const copy = structuredClone(limitsProjectionFixture)
  for (const row of copy.accountImpact.accounts ?? []) { row.accountId = accountId; row.accountName = accountName }
  return copy
}
