import { expect, test } from 'vitest'
import { fetchAdminLlmKey } from '../../api/queries'
import { setAccessToken } from '../../api/token'
import { mappedLimitsProjection } from '../llm-projection-fixture'
import { adminLlmKeyStore, adminLlmProjectionFixtures, limitsProjectionFixtureKey } from './handlers/llm-keys'
import { capturedAccountStates, capturedProjectionSupported } from './projection-fixtures'
import { uuid } from './ids'

function mapWithoutBaseline() {
  const key = adminLlmKeyStore.find((row) => row.id === uuid(171))!
  const snapshot = mappedLimitsProjection(uuid(410), 'Synthetic unsupported baseline')
  const query = new URLSearchParams({ proposedCreditLimit: '20', proposedCreditLimitResetSet: 'false' })
  adminLlmProjectionFixtures.set(limitsProjectionFixtureKey(key.id, query), snapshot)
  expect(capturedAccountStates.has(uuid(410))).toBe(false)
  return { key, snapshot }
}

test('an exact fixture query without an independently registered baseline is unsupported', () => {
  const { key, snapshot } = mapWithoutBaseline()
  key.creditLimit = 30
  key.creditUsage = 7
  expect(capturedProjectionSupported(snapshot.accountImpact, adminLlmKeyStore)).toBe(false)
})

test('a map-only fixture cannot publish stale captured amounts through the current mock GET', async () => {
  const { key } = mapWithoutBaseline()
  key.creditLimit = 30
  key.creditUsage = 7
  setAccessToken('access-sys-admin')
  const response = await fetchAdminLlmKey(key.id, { projectLimits: true, proposedCreditLimit: 20, proposedCreditLimitResetSet: false })
  expect(response.creditLimit).toBe(30)
  expect(response.limitsProjection!.accountImpact.state).toBe('NOT_PROVIDED')
  expect(response.limitsProjection!.accountImpact.accounts).toBeNull()
})
