import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { applyAdminBulkChange, fetchAdminLlmKeyModels, fetchOpenRouterAccount, previewAdminBulkChange } from '../api/queries'
import { setAccessToken } from '../api/token'
import { seedAllocationFixture } from '../test/msw/allocation-fixtures'
import { multiProjectionResponse } from '../test/llm-projection-fixture'
import { adminLlmKeyStore, adminLlmLimitBodies } from '../test/msw/handlers/llm-keys'
import { orgViewerUser, orgViewerProfile, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { AUTHORITY_OVERRIDES, mockInstitutionAuthority } from '../test/msw/institution-authority'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

test('the explicit captured single scenario has a matching baseline and recognizes only its received after-state', async () => {
  const scene = seedAllocationFixture('single')!
  if (!scene.keyId || !scene.accountId) throw new Error('Missing single scenario')
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(`/admin/llm/keys/${scene.keyId}?org=${scene.orgId}`)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '한도 변경' }))
  const modal = within(screen.getByRole('dialog'))
  expect(modal.getByLabelText('금액 한도 (USD)')).toHaveDisplayValue('10')
  await user.clear(modal.getByLabelText('금액 한도 (USD)'))
  await user.type(modal.getByLabelText('금액 한도 (USD)'), '20')
  await modal.findByText('$5.00 → $15.00')
  await user.click(modal.getByRole('button', { name: '저장' }))
  await screen.findByText('LLM API 키 한도를 변경했습니다.')
  expect(adminLlmKeyStore.find((key) => key.id === scene.keyId)!.creditLimit).toBe(20)
  expect((await fetchOpenRouterAccount(scene.accountId)).allocation!.remainingCommitment).toBe(15)
})

test('the explicit command-only scenario retains the existing single command without account finance or bulk', async () => {
  const scene = seedAllocationFixture('command-only')!
  if (!scene.keyId || !scene.accountId) throw new Error('Missing single scenario')
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
  renderApp(`/admin/llm/keys/${scene.keyId}?org=${scene.orgId}`)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '한도 변경' }))
  const modal = within(screen.getByRole('dialog'))
  await user.clear(modal.getByLabelText('금액 한도 (USD)'))
  await user.type(modal.getByLabelText('금액 한도 (USD)'), '20')
  await modal.findByText(/계정별 배정 영향이 제공되지 않습니다/)
  expect(modal.queryByText('관측 잔액')).not.toBeInTheDocument()
  await user.click(modal.getByRole('button', { name: '저장' }))
  await screen.findByText('LLM API 키 한도를 변경했습니다.')
  expect(adminLlmLimitBodies).toHaveLength(1)
  expect(adminLlmLimitBodies[0]).not.toHaveProperty('dailyTokens')
})

test('the multi-account scenario uses received snapshots with normal preview fingerprints and durable results', async () => {
  seedAllocationFixture('multi')
  setAccessToken('access-sys-admin')
  const request = { targetType: multiProjectionResponse.targetType, targetIds: multiProjectionResponse.items.map((row) => row.targetId), change: multiProjectionResponse.change! }
  const preview = await previewAdminBulkChange(request)
  expect(preview.accountImpact!.state).toBe('AVAILABLE')
  expect(preview.accountImpact!.accounts!.map((row) => row.after.remainingCommitment)).toEqual([5, 16])
  const result = await applyAdminBulkChange({ ...request, previewId: preview.previewId, operationId: uuid(9990),
    fingerprints: Object.fromEntries(preview.items.map((row) => [row.targetId, row.fingerprint])) })
  expect(result.items.filter((row) => row.result === 'APPLIED')).toHaveLength(3)
  expect(result.items.filter((row) => row.result === 'UNCHANGED')).toHaveLength(1)
  expect(result.items.filter((row) => row.result === 'SKIPPED')).toHaveLength(1)
  for (const account of preview.accountImpact!.accounts!) expect((await fetchOpenRouterAccount(account.accountId)).allocation!.remainingCommitment).toBe(account.after.remainingCommitment)
})

test('admin model preview uses the actual admin key and the shared cached policy matcher', async () => {
  setAccessToken('access-sys-admin')
  const result = await fetchAdminLlmKeyModels(uuid(171))
  expect(result.selfServed.some((model) => model.name === 'pickle-general')).toBe(true)
  expect(result.paid!.models.map((model) => model.id)).toEqual(['openai/gpt-4o-mini'])
})

test('admin model preview masks paid policy when the key is readable only as metadata', async () => {
  const context = mockInstitutionAuthority(orgViewerProfile)
  context.accountRole = 'ORG_VIEWER'
  context.authorityFingerprint = 'synthetic-model-metadata-only'
  context.assignments = [{ ...context.assignments[0], institutionId: uuid(1), permission: { mode: 'SELECTED', revision: 3, work: ['llm.metadata.read'],
    scopes: { LLM: { mode: 'LISTED', workspaceIds: [uuid(12)] } } } }]
  AUTHORITY_OVERRIDES[orgViewerUser.id] = context
  setAccessToken('access-org-viewer')
  const result = await fetchAdminLlmKeyModels(uuid(171))
  expect(result.paid).toBeNull()
  expect(result.financeVisible).toBe(false)
})
