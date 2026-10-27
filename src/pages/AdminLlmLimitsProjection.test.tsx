import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { singleProjectionResponse } from '../test/llm-projection-fixture'
import { AUTHORITY_OVERRIDES, mockInstitutionAuthority } from '../test/msw/institution-authority'
import { orgViewerProfile, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { adminLlmLimitBodies, adminLlmKeyStore } from '../test/msw/handlers/llm-keys'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { renderApp } from '../test/render'

function received() { return structuredClone(singleProjectionResponse) }

test('the captured HTTP projection renders its server before and after without local replacement arithmetic', async () => {
  const user = userEvent.setup()
  const row = received()
  const requests: URLSearchParams[] = []
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/llm/keys/:keyId', ({ request }) => {
      const query = new URL(request.url).searchParams
      if (query.get('projectLimits') === 'true') requests.push(query)
      return HttpResponse.json(query.get('projectLimits') === 'true' ? row : { ...row, limitsProjection: null })
    }))
  renderApp(`/admin/llm/keys/${row.id}`)
  await user.click(await screen.findByRole('button', { name: '한도 변경' }))
  const modal = within(screen.getByRole('dialog', { name: 'LLM API 키 한도 변경' }))
  expect(modal.queryByText('$5.00 → $15.00')).not.toBeInTheDocument()
  await user.clear(modal.getByLabelText('금액 한도 (USD)'))
  await user.type(modal.getByLabelText('금액 한도 (USD)'), '20')
  await modal.findByText('$5.00 → $15.00')
  expect(modal.getByText('명목 배정 합계').parentElement).toHaveTextContent('$10.00 → $20.00')
  expect(modal.queryByText('초과 배정')).not.toBeInTheDocument()
  expect(requests.some((query) => query.get('proposedCreditLimit') === '20' && query.get('proposedCreditLimitResetSet') === 'false')).toBe(true)
  expect(adminLlmLimitBodies).toHaveLength(0)
})

test('a different draft echo cannot publish an available account snapshot for the current editor', async () => {
  const user = userEvent.setup()
  const row = received()
  row.limitsProjection!.draft.creditLimit = 99
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/llm/keys/:keyId', ({ request }) => HttpResponse.json(new URL(request.url).searchParams.has('projectLimits') ? row : { ...row, limitsProjection: null })))
  renderApp(`/admin/llm/keys/${row.id}`)
  await user.click(await screen.findByRole('button', { name: '한도 변경' }))
  const modal = within(screen.getByRole('dialog'))
  await user.clear(modal.getByLabelText('금액 한도 (USD)'))
  await user.type(modal.getByLabelText('금액 한도 (USD)'), '20')
  await modal.findByText(/현재 제안과 일치하는 계정 영향이 제공되지 않았습니다/)
  expect(modal.queryByText('$5.00 → $15.00')).not.toBeInTheDocument()
  expect(modal.getByRole('button', { name: '저장' })).not.toBeDisabled()
})

test('a changed server configuration is not displayed as a preview of the abandoned editor baseline', async () => {
  const user = userEvent.setup()
  const baseline = received()
  const newer = received()
  newer.creditLimit = 11
  const before = newer.limitsProjection!.accountImpact.accounts![0].before
  before.committedCreditLimit = 11
  before.committedTotalCap = 11
  before.remainingCommitment = 6
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/llm/keys/:keyId', ({ request }) => HttpResponse.json(new URL(request.url).searchParams.has('projectLimits') ? newer : { ...baseline, limitsProjection: null })))
  renderApp(`/admin/llm/keys/${baseline.id}`)
  await user.click(await screen.findByRole('button', { name: '한도 변경' }))
  const modal = within(screen.getByRole('dialog'))
  await user.clear(modal.getByLabelText('금액 한도 (USD)'))
  await user.type(modal.getByLabelText('금액 한도 (USD)'), '20')
  await modal.findByText(/현재 제안과 일치하는 계정 영향이 제공되지 않았습니다/)
  expect(modal.queryByText('$6.00 → $15.00')).not.toBeInTheDocument()
  expect(modal.getByRole('button', { name: '저장' })).not.toBeDisabled()
})

test('a late earlier proposal cannot replace a newer proposal response', async () => {
  const user = userEvent.setup()
  const row = received()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let held = false
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/llm/keys/:keyId', async ({ request }) => {
      const query = new URL(request.url).searchParams
      if (!query.has('projectLimits')) return HttpResponse.json({ ...row, limitsProjection: null })
      if (query.get('proposedCreditLimit') === '20') { held = true; await gate; return HttpResponse.json(row) }
      const amount = query.has('proposedCreditLimit') ? Number(query.get('proposedCreditLimit')) : null
      return HttpResponse.json({ ...row, limitsProjection: { ...row.limitsProjection,
        draft: { ...row.limitsProjection!.draft, creditLimitSet: amount != null, creditLimit: amount },
        accountImpact: { state: 'NOT_PROVIDED', observedAt: row.limitsProjection!.configurationObservedAt, accounts: null, basisFingerprint: null } } })
    }))
  renderApp(`/admin/llm/keys/${row.id}`)
  await user.click(await screen.findByRole('button', { name: '한도 변경' }))
  const modal = within(screen.getByRole('dialog'))
  try {
    await user.clear(modal.getByLabelText('금액 한도 (USD)'))
    await user.type(modal.getByLabelText('금액 한도 (USD)'), '20')
    await waitFor(() => expect(held).toBe(true))
    await user.clear(modal.getByLabelText('금액 한도 (USD)'))
    await user.type(modal.getByLabelText('금액 한도 (USD)'), '30')
    await modal.findByText(/계정별 배정 영향이 제공되지 않습니다/)
    await act(async () => { release(); await gate })
    expect(modal.getByLabelText('금액 한도 (USD)')).toHaveDisplayValue('30')
    expect(modal.queryByText('$5.00 → $15.00')).not.toBeInTheDocument()
  } finally { release() }
})

test('an existing selected ORG viewer budget command saves without account finance or a one-target bulk request', async () => {
  const context = mockInstitutionAuthority(orgViewerProfile)
  context.accountRole = 'ORG_VIEWER'
  context.authorityFingerprint = 'synthetic-key-budget-only'
  context.assignments[0].permission = { mode: 'SELECTED', revision: 3, work: ['llm.key.budget'],
    scopes: { LLM: { mode: 'LISTED', workspaceIds: [uuid(12)] } } }
  AUTHORITY_OVERRIDES[orgViewerProfile.id] = context
  let bulkRequests = 0
  server.use(refreshSuccessHandler('access-org-viewer'),
    http.post('*/api/v1/admin/bulk-changes', () => { bulkRequests += 1; return new HttpResponse(null, { status: 403 }) }),
    http.post('*/api/v1/admin/bulk-changes/preview', () => { bulkRequests += 1; return new HttpResponse(null, { status: 403 }) }))
  renderApp(`/admin/llm/keys/${uuid(171)}?org=${uuid(1)}`)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '한도 변경' }))
  const modal = within(screen.getByRole('dialog'))
  await user.clear(modal.getByLabelText('금액 한도 (USD)'))
  await user.type(modal.getByLabelText('금액 한도 (USD)'), '20')
  await modal.findByText(/계정별 배정 영향이 제공되지 않습니다/)
  await user.click(modal.getByRole('button', { name: '저장' }))
  await screen.findByText('LLM API 키 한도를 변경했습니다.')
  expect(adminLlmLimitBodies).toHaveLength(1)
  expect(adminLlmLimitBodies[0]).toHaveProperty('creditLimit', 20)
  expect(adminLlmLimitBodies[0]).not.toHaveProperty('dailyTokens')
  expect(bulkRequests).toBe(0)
  expect(adminLlmKeyStore.find((key) => key.id === uuid(171))!.creditLimit).toBe(20)
})
