import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { AUTHORITY_OVERRIDES, mockInstitutionAuthority } from '../test/msw/institution-authority'
import { orgAdminProfile, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { adminLlmKeyStore, adminLlmListQueries, adminTokenUsageStore } from '../test/msw/handlers/llm-keys'
import { accountUsageRecordStore, accountUsageQueries, openRouterAccountStore } from '../test/msw/handlers/openrouter-accounts'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { currentPath, renderApp } from '../test/render'

function addKeys(count: number) {
  const base = adminLlmKeyStore.find((key) => key.id === uuid(171))!
  for (let index = 0; index < count; index += 1) {
    const id = uuid(900 + index)
    adminLlmKeyStore.push({ ...structuredClone(base), id, name: `Exploration ${String(index + 1).padStart(2, '0')}`,
      status: 'ACTIVE', expiresAt: null, creditLimit: 10, creditUsage: 2, creditLimitRemaining: 8 })
    adminTokenUsageStore.set(id, index)
  }
}

function sys() { server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser)) }

test('the full server key page preserves account cohort sort and search through detail and bulk returns', async () => {
  addKeys(25)
  sys()
  const path = `/admin/llm/keys?org=${uuid(1)}&openrouterAccountId=${uuid(410)}&cohort=COMMITTED&sort=NAME_ASC&q=Exploration&page=1`
  renderApp(path)
  const user = userEvent.setup()
  const key = await screen.findByRole('link', { name: 'Exploration 21' })
  const table = screen.getByRole('table', { name: '관리자 LLM API 키 목록' })
  expect(within(table).getAllByRole('row')).toHaveLength(6)
  expect(screen.queryByRole('link', { name: 'Exploration 01' })).not.toBeInTheDocument()
  const query = new URLSearchParams(adminLlmListQueries.at(-1))
  expect(query.get('page')).toBe('1')
  expect(query.get('cohort')).toBe('COMMITTED')
  expect(query.get('sort')).toBe('NAME_ASC')
  expect(query.get('openrouterAccountId')).toBe(uuid(410))
  await user.click(key)
  const back = await screen.findByRole('link', { name: '← 이전 LLM 조회' })
  expect(back).toHaveAttribute('href', path)
  await user.click(back)
  await screen.findByRole('link', { name: 'Exploration 21' })
  await user.click(screen.getByRole('checkbox', { name: 'Exploration 21 선택' }))
  await user.click(screen.getByRole('button', { name: '일괄 변경' }))
  expect((await screen.findByRole('link', { name: '← LLM API 키' }))).toHaveAttribute('href', path)
  expect(new URLSearchParams(currentPath().split('?')[1]).get('returnTo')).toBe(path)
})

test('account navigation counts readable current rows separately from whole-account facts', async () => {
  const context = mockInstitutionAuthority(orgAdminProfile)
  context.accountRole = 'ORG_MANAGER'
  context.authorityFingerprint = 'synthetic-scoped-account-navigation'
  context.assignments[0].permission = { mode: 'SELECTED', revision: 9,
    work: ['institution.account.read', 'institution.account.finance.read', 'llm.metadata.read', 'llm.observe', 'llm.key.cost.read'],
    scopes: { LLM: { mode: 'LISTED', workspaceIds: [uuid(12)] } } }
  AUTHORITY_OVERRIDES[orgAdminProfile.id] = context
  const base = adminLlmKeyStore.find((key) => key.id === uuid(171))!
  adminLlmKeyStore.push({ ...structuredClone(base), id: uuid(990), name: 'Synthetic other workspace key', workspaceId: uuid(13) })
  const account = openRouterAccountStore.find((row) => row.id === uuid(410))!
  account.boundKeyCount = 3
  account.allocation = { ...account.allocation, committedCreditLimit: 15, committedTotalCap: 0, committedMonthly: 15,
    committedKeyCount: 3, remainingCommitment: 7.5 }
  server.use(refreshSuccessHandler('access-org-admin'))
  renderApp(`/admin/llm/accounts/${account.id}?org=${uuid(1)}`)
  const heading = await screen.findByRole('heading', { name: '읽을 수 있는 키군 탐색' })
  const nav = within(heading.closest('section')!)
  const link = within(nav.getByText('현재 금액 배정').parentElement!).getByRole('link')
  expect(link).toHaveTextContent('2개 전체 탐색')
  expect(screen.getByText('계정 전체 연결 키').parentElement).toHaveTextContent('3개')
  await userEvent.setup().click(link)
  const table = await screen.findByRole('table', { name: '관리자 LLM API 키 목록' })
  expect(within(table).queryByText('Synthetic other workspace key')).not.toBeInTheDocument()
  expect(within(table).getAllByRole('row')).toHaveLength(3)
})

test('account rollup summaries and total count are not recalculated from the current consumer page', async () => {
  addKeys(21)
  for (let index = 0; index < 21; index += 1) {
    accountUsageRecordStore.push({ day: '2026-08-31', keyId: uuid(900 + index), keyName: '', requests: 100 - index,
      inputTokens: 1000, outputTokens: 100, attributedCostUsd: index % 2 ? 0.01 : null, pricedRequests: index % 2 ? 1 : 0 })
  }
  sys()
  renderApp(`/admin/llm/accounts/${uuid(410)}?org=${uuid(1)}&days=30&page=1&sort=REQUESTS_DESC`)
  const table = await screen.findByRole('table', { name: '키별 쓰임새' })
  await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(4))
  const tile = screen.getByText('쓰인 키', { selector: 'dt' }).parentElement!
  expect(within(tile).getByText('23개')).toBeInTheDocument()
  const query = new URLSearchParams(accountUsageQueries.at(-1))
  expect(query.get('page')).toBe('1')
  expect(query.get('sort')).toBe('REQUESTS_DESC')
  expect(query.get('days')).toBe('30')
  const destination = new URL(within(table).getByRole('link', { name: 'Exploration 21' }).getAttribute('href')!, 'https://pickle.invalid')
  expect(destination.searchParams.get('tab')).toBe('usage')
  expect(destination.searchParams.get('days')).toBe('30')
  expect(destination.searchParams.get('returnTo')).toContain('page=1&sort=REQUESTS_DESC')
})

test('a hidden-money sort is refused without changing filters or displaying a fabricated empty total', async () => {
  const context = mockInstitutionAuthority(orgAdminProfile)
  context.accountRole = 'ORG_MANAGER'
  context.authorityFingerprint = 'synthetic-metadata-only-exploration'
  context.assignments[0].permission = { mode: 'SELECTED', revision: 10, work: ['llm.metadata.read'],
    scopes: { LLM: { mode: 'LISTED', workspaceIds: [uuid(12)] } } }
  AUTHORITY_OVERRIDES[orgAdminProfile.id] = context
  server.use(refreshSuccessHandler('access-org-admin'))
  renderApp(`/admin/llm/keys?org=${uuid(1)}&sort=CREDIT_LIMIT_DESC`)
  await screen.findByText('현재 조회 집합의 금융 탐색을 제공하지 않습니다.')
  expect(currentPath()).toContain('sort=CREDIT_LIMIT_DESC')
  expect(screen.queryByRole('table', { name: '관리자 LLM API 키 목록' })).not.toBeInTheDocument()
  expect(screen.queryByText(/현재 조회 0개/)).not.toBeInTheDocument()
  await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: '키 정렬' }), 'NEWEST')
  const table = await screen.findByRole('table', { name: '관리자 LLM API 키 목록' })
  expect(table.textContent).not.toContain('$')
  expect(screen.getByRole('option', { name: '금액 한도 큰 순' })).toBeDisabled()
})

test('stored TOKEN policy eligibility does not assert that a zero-budget key can actually run a request', async () => {
  const key = adminLlmKeyStore.find((row) => row.id === uuid(171))!
  Object.assign(key, { passthroughEndpoints: ['chat'], creditLimit: 0, dailyTokens: 0 })
  sys()
  renderApp(`/admin/llm/keys?org=${uuid(1)}&policyModel=pickle-general&policyFeature=chat`)
  await screen.findByRole('link', { name: 'active-admin-key' })
  expect(screen.getByText(/발급·예산·실제 경로와 호출 성공을 보장하지 않습니다/)).toBeInTheDocument()
  const table = screen.getByRole('table', { name: '관리자 LLM API 키 목록' })
  expect(within(table).queryByRole('link', { name: 'suspended-admin-key' })).not.toBeInTheDocument()
})
