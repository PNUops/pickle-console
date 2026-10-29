import { act, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { server } from '../test/msw/server'
import { orgAdminProfile, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { adminLlmKeyStore } from '../test/msw/handlers/llm-keys'
import { AUTHORITY_OVERRIDES, mockInstitutionAuthority } from '../test/msw/institution-authority'
import { renderApp } from '../test/render'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui'
import App from '../App'
import type { AdminLlmKeyDetail, AdminLlmKeyUsage } from '../api/queries'

test.each(['/admin/llm/status', '/admin/llm/status?tab=metrics', '/admin/llm/usage'])('global key observation support does not query institution aggregates at %s', async (route) => {
  prepare('llm.observe.support.read')
  let aggregates = 0
  const deny = () => { aggregates++; return HttpResponse.json({ title: '집계 권한이 없습니다.', status: 403 }, { status: 403 }) }
  server.use(http.get('*/api/v1/admin/llm/status', deny), http.get('*/api/v1/admin/llm/metrics', deny),
    http.get('*/api/v1/admin/llm/usage', deny))
  renderApp(route)
  await screen.findByRole('heading', { name: '관리자 대시보드' })
  const navigation = screen.getByRole('navigation', { name: '관리자 메뉴' })
  expect(within(navigation).queryByRole('link', { name: 'LLM 사용량' })).not.toBeInTheDocument()
  expect(within(navigation).queryByRole('link', { name: 'LLM 서비스 상태' })).not.toBeInTheDocument()
  expect(aggregates).toBe(0)
})

test('global key observation support retains a foreign key nonfinancial usage view', async () => {
  const key = { ...prepare('llm.observe.support.read'), orgId: '00000000-0000-4000-8000-000000000002',
    status: 'ACTIVE', allowedWorkIds: ['llm.observe.support.read'], metadataVisible: false, observationVisible: true, financeVisible: false,
    creditLimit: null, creditLimitReset: null, creditAllowedModels: null, creditDeniedModels: null, passthroughEndpoints: null,
    openrouterAccountId: null, openrouterAccountName: null, creditAxisConnected: null }
  let reads = 0
  server.use(http.get('*/api/v1/admin/llm/keys/:keyId', () => HttpResponse.json(key)),
    http.get('*/api/v1/admin/llm/keys/:keyId/usage', () => {
      reads++; return HttpResponse.json({ trend: { from: '2026-10-01', to: '2026-10-07', points: [], models: [], latency: null,
        budget: { dailyTokens: null, todayTokens: null, quotaExhausted: null, creditLimit: null, creditUsage: null } },
        financeVisible: false, costPoints: null, endpointKinds: [], servedModels: [] } satisfies AdminLlmKeyUsage)
    }))
  renderApp(`/admin/llm/keys/${key.id}?tab=usage`)
  expect(await screen.findByRole('tab', { name: '사용량' })).toHaveAttribute('aria-selected', 'true')
  await screen.findByText('총 요청')
  expect(reads).toBe(1)
  expect(screen.queryByText('총 사용 금액')).not.toBeInTheDocument()
})

test.each([
  ['llm.token.operate', 'ACTIVE', '한도 변경', 'LLM API 키 한도 변경', 'row'],
  ['llm.period', 'ACTIVE', '만료일 변경', 'LLM API 키 만료일 변경', 'row'],
  ['llm.state.operate', 'ACTIVE', '키 정지', 'LLM API 키 정지', 'row'],
  ['llm.state.operate', 'SUSPENDED', '정지 해제', 'LLM API 키 정지 해제', 'row'],
  ['llm.revoke', 'ACTIVE', '키 폐기', 'LLM API 키 폐기', 'row'],
  ['llm.period', 'ACTIVE', '만료일 변경', 'LLM API 키 만료일 변경', 'workspace'],
  ['llm.period', 'ACTIVE', '만료일 변경', 'LLM API 키 만료일 변경', 'status'],
] as const)('closes the %s command after a same-fingerprint %s row refresh (%s, %s, %s)', async (work, status, button, dialog, change) => {
  const initial = { ...prepare(work), status, allowedWorkIds: [work], metadataVisible: false, observationVisible: false,
    financeVisible: false, tokenReferenceVisible: work === 'llm.token.operate', budgetReferenceVisible: false }
  let current: AdminLlmKeyDetail = initial
  let reads = 0, commands = 0
  server.use(http.get('*/api/v1/admin/llm/keys/:keyId', () => { reads++; return HttpResponse.json(current) }),
    http.put('*/api/v1/admin/llm/keys/:keyId/limits', () => { commands++; return HttpResponse.json(current) }),
    http.patch('*/api/v1/admin/llm/keys/:keyId/expiry', () => { commands++; return HttpResponse.json(current) }),
    http.post('*/api/v1/admin/llm/keys/:keyId/suspend', () => { commands++; return HttpResponse.json(current) }),
    http.post('*/api/v1/admin/llm/keys/:keyId/resume', () => { commands++; return HttpResponse.json(current) }),
    http.delete('*/api/v1/admin/llm/keys/:keyId', () => { commands++; return HttpResponse.json(current) }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<MemoryRouter initialEntries={[`/admin/llm/keys/${initial.id}`]}><QueryClientProvider client={client}>
    <AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider>
  </QueryClientProvider></MemoryRouter>)
  await userEvent.click(await screen.findByRole('button', { name: button }))
  await screen.findByRole('dialog', { name: dialog })
  const fingerprint = AUTHORITY_OVERRIDES[orgAdminProfile.id]!.authorityFingerprint
  current = { ...initial, ...(change === 'row' ? { allowedWorkIds: [] } : change === 'workspace'
    ? { workspaceId: '00000000-0000-4000-8000-000000009999' } : { status: 'REVOKED' as const }) }
  await act(async () => { await client.invalidateQueries({ queryKey: ['admin', 'llm-keys'] }) })
  await waitFor(() => expect(reads).toBeGreaterThanOrEqual(2))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.queryByRole('button', { name: button })).not.toBeInTheDocument()
  expect(AUTHORITY_OVERRIDES[orgAdminProfile.id]!.authorityFingerprint).toBe(fingerprint)
  current = initial
  await act(async () => { await client.invalidateQueries({ queryKey: ['admin', 'llm-keys'] }) })
  await screen.findByRole('button', { name: button })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(commands).toBe(0)
})

function prepare(work: string, differentWorkspace = false) {
  const key = structuredClone(adminLlmKeyStore[1])
  const context = mockInstitutionAuthority(orgAdminProfile)
  context.accountRole = 'ORG_MANAGER'
  context.authorityFingerprint = `synthetic:${work}:${differentWorkspace}`
  context.assignments[0].permission = { mode: 'SELECTED', revision: 13, work: [work], scopes: {
    LLM: { mode: 'LISTED', workspaceIds: differentWorkspace ? ['00000000-0000-4000-8000-000000009999'] : [key.workspaceId] },
  } }
  AUTHORITY_OVERRIDES[orgAdminProfile.id] = context
  server.use(refreshSuccessHandler('access-org-admin'))
  return key
}

test('token-only key operations omit hidden monetary policy and preserve the full feature grant', async () => {
  const key = { ...prepare('llm.token.operate'), allowedWorkIds: ['llm.token.operate'], metadataVisible: false,
    observationVisible: false, financeVisible: false, tokenReferenceVisible: true, budgetReferenceVisible: false,
    creditLimit: null, creditLimitReset: null, creditAxisConnected: null, creditAllowedModels: null,
    creditDeniedModels: null, passthroughEndpoints: null, chatEnabled: true, accountReferences: null }
  const writes: Record<string, unknown>[] = []
  let accountQueries = 0
  server.use(http.get('*/api/v1/admin/llm/keys/:keyId', () => HttpResponse.json(key)),
    http.get('*/api/v1/admin/llm/accounts', () => { accountQueries++; return new HttpResponse(null, { status: 403 }) }),
    http.put('*/api/v1/admin/llm/keys/:keyId/limits', async ({ request }) => {
      const body = await request.json() as Record<string, unknown>; writes.push(body)
      return HttpResponse.json({ ...key, ...body })
    }))
  renderApp(`/admin/llm/keys/${key.id}`)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '한도 변경' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).queryByRole('spinbutton', { name: '금액 한도 (USD)' })).not.toBeInTheDocument()
  const rpm = within(dialog).getByRole('spinbutton', { name: 'RPM' })
  await user.clear(rpm); await user.type(rpm, '93')
  await user.click(within(dialog).getByRole('button', { name: '저장' }))
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toMatchObject({ rpm: 93, chatEnabled: true })
  for (const field of ['creditLimit', 'creditLimitReset', 'creditAllowedModels', 'creditDeniedModels', 'passthroughEndpoints', 'openrouterAccountId']) expect(writes[0]).not.toHaveProperty(field)
  expect(accountQueries).toBe(0)
})

test('budget-only changes use command references without reading account balances or token limits', async () => {
  const key = { ...prepare('llm.key.budget'), allowedWorkIds: ['llm.key.budget'], metadataVisible: false,
    observationVisible: false, financeVisible: false, tokenReferenceVisible: false, budgetReferenceVisible: true,
    rpm: null, tpm: null, concurrency: null, dailyTokens: null, chatEnabled: true,
    passthroughEndpoints: ['chat'], accountReferences: [], creditAxisConnected: null }
  const writes: Record<string, unknown>[] = []
  let financialQueries = 0
  server.use(http.get('*/api/v1/admin/llm/keys/:keyId', () => HttpResponse.json(key)),
    http.get('*/api/v1/admin/llm/accounts/:accountId', () => { financialQueries++; return new HttpResponse(null, { status: 403 }) }),
    http.put('*/api/v1/admin/llm/keys/:keyId/limits', async ({ request }) => {
      const body = await request.json() as Record<string, unknown>; writes.push(body)
      return HttpResponse.json({ ...key, ...body })
    }))
  renderApp(`/admin/llm/keys/${key.id}`)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '한도 변경' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).queryByRole('spinbutton', { name: 'RPM' })).not.toBeInTheDocument()
  const credit = within(dialog).getByRole('spinbutton', { name: '금액 한도 (USD)' })
  await user.clear(credit); await user.type(credit, '12')
  await user.click(within(dialog).getByRole('button', { name: '저장' }))
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toMatchObject({ creditLimit: 12, passthroughEndpoints: ['chat'] })
  for (const field of ['rpm', 'tpm', 'concurrency', 'dailyTokens', 'chatEnabled']) expect(writes[0]).not.toHaveProperty(field)
  expect(financialQueries).toBe(0)
})

test('a row permission cannot borrow a different workspace from the current source', async () => {
  const key = { ...prepare('llm.token.operate', true), allowedWorkIds: ['llm.token.operate'], metadataVisible: false,
    observationVisible: false, financeVisible: false, tokenReferenceVisible: false, budgetReferenceVisible: false }
  server.use(http.get('*/api/v1/admin/llm/keys/:keyId', () => HttpResponse.json(key)))
  renderApp(`/admin/llm/keys/${key.id}`)
  await screen.findByRole('heading', { name: key.name })
  expect(screen.queryByRole('button', { name: '한도 변경' })).not.toBeInTheDocument()
  expect(screen.queryByRole('tab', { name: '사용량' })).not.toBeInTheDocument()
})

test('a command-only list row distinguishes withheld finance and activity from known absence', async () => {
  const key = { ...prepare('llm.key.budget'), allowedWorkIds: ['llm.key.budget'], metadataVisible: false, observationVisible: false,
    financeVisible: false, purpose: null, rpm: null, tpm: null, dailyTokens: null, concurrency: null,
    creditLimit: null, creditUsage: null, creditUsageAt: null, creditLimitRemaining: null, openrouterAccountId: null, openrouterAccountName: null, lastUsedAt: null,
    tokenObservation: { source: 'RETAINED_TOKEN_EVENTS', day: '2091-02-03', observedAt: '2091-02-03T01:02:03Z', todayTokens: 765432, remainingTokens: 456789 } }
  server.use(http.get('*/api/v1/admin/llm/keys', () => HttpResponse.json({ content: [key], page: 0, size: 20, totalElements: 1, totalPages: 1 })))
  renderApp('/admin/llm/keys')
  const row = (await screen.findByRole('link', { name: key.name })).closest('tr')!
  expect(within(row).queryByText('미결합')).not.toBeInTheDocument()
  expect(within(row).queryByText('금액 관측 전')).not.toBeInTheDocument()
  expect(within(row).queryByText('사용 기록 없음')).not.toBeInTheDocument()
  const headers = within(screen.getByRole('table')).getAllByRole('columnheader')
  const cells = within(row).getAllByRole('cell')
  for (const name of ['사업 계정', '저장 한도', '보존된 오늘 TOKEN 기록', '금액 관측', '마지막 사용']) {
    const index = headers.findIndex((header) => header.textContent === name)
    expect(index).toBeGreaterThanOrEqual(0)
    expect(cells[index]).toHaveTextContent(/^제공되지 않음$/)
  }
})

test('an ACL write capability cannot outrun the current read-only source', async () => {
  const context = mockInstitutionAuthority(orgAdminProfile)
  context.accountRole = 'ORG_MANAGER'
  context.authorityFingerprint = 'synthetic-acl-read-source'
  context.assignments[0].permission = { mode: 'SELECTED', revision: 17, work: ['vm.acl.support.read'], scopes: { VM: { mode: 'LISTED', workspaceIds: ['00000000-0000-4000-8000-000000000012'] } } }
  AUTHORITY_OVERRIDES[orgAdminProfile.id] = context
  server.use(refreshSuccessHandler('access-org-admin'), http.get('*/api/v1/admin/resource-access/:resourceType/:resourceId', () => HttpResponse.json({
    resource: { id: '00000000-0000-4000-8000-000000000057', type: 'VM', name: 'Synthetic ACL target', status: 'RUNNING', workspaceId: '00000000-0000-4000-8000-000000000012', workspaceName: 'Synthetic workspace' },
    grants: [], eligibleMembers: [], canManageAccess: true,
  })))
  renderApp('/admin/resource-access/VM/00000000-0000-4000-8000-000000000057')
  await screen.findByText(/Synthetic ACL target/)
  expect(screen.queryByRole('heading', { name: '접근 권한 부여' })).not.toBeInTheDocument()
})
