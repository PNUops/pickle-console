import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { llmCapacityFixture } from '../test/msw/handlers/llm-capacity'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'

const route = '/admin/llm/status?tab=metrics&view=capacity&from=2026-10-20T00:00:00Z&to=2026-10-21T00:00:00Z&group=KEY'

test.each([
  { raw: 'server_busy', category: 'GLOBAL_ADMISSION', label: '전역 중계', key: 'active-admin-key', requests: 2 },
  { raw: 'server_busy', category: 'PROVIDER', label: '공급 경로 결과', key: 'suspended-admin-key', requests: 3 },
  { raw: null, category: 'CANCELED', label: '취소', key: 'expired-admin-key', requests: 4 },
  { raw: null, category: 'UNCLASSIFIED', label: '미분류', key: 'revoked-admin-key', requests: 5 },
] as const)('keeps exact rows, totals and series for $raw/$category and preserves them through detail return', async ({ raw, category, label, key, requests }) => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(`${route}&page=2`)
  const reasons = within(await screen.findByRole('table', { name: '같은 조건의 거절·오류 원인' }))
  const row = reasons.getAllByRole('row').find((item) => item.textContent?.includes(raw == null ? '원인 미기록' : category === 'GLOBAL_ADMISSION' ? '전체 중계 처리 여유 부족' : 'server_busy') && within(item).queryByRole('cell', { name: label }))!
  await user.click(within(row).getByRole('button'))
  const link = await screen.findByRole('link', { name: key })
  expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('reasonCategory')).toBe(category)
  expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.has('page')).toBe(false)
  const consumers = within(screen.getByRole('table', { name: '같은 조건의 소비처' }))
  expect(consumers.getAllByRole('row')).toHaveLength(2)
  const totals = screen.getByText('보존된 요청').nextElementSibling
  expect(totals).toHaveTextContent(`${requests}건`)
  const selector = screen.getByRole('combobox', { name: '같은 기간의 요청 기록 정확값' })
  await user.selectOptions(selector, Array.from((selector as HTMLSelectElement).options).at(-1)!.value)
  expect(screen.getByText(`요청 ${requests}건`)).toBeInTheDocument()
  const returned = new URL(link.getAttribute('href')!, 'https://pickle.invalid').searchParams.get('returnTo')!
  expect(new URL(returned, 'https://pickle.invalid').searchParams.get('reasonCategory')).toBe(category)
  await user.click(link)
  await user.click(await screen.findByRole('link', { name: '← 장비와 수요 비교' }))
  expect(await screen.findByRole('link', { name: key })).toBeInTheDocument()
  expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('reasonCategory')).toBe(category)
})

test('keeps unknown admission separate from an actual zero-attempt global refusal', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(route)
  const reasons = within(await screen.findByRole('table', { name: '같은 조건의 거절·오류 원인' }))
  const row = reasons.getAllByRole('row').find((item) => item.textContent?.includes('server_busy (발생 위치 미확인)') && within(item).queryByRole('cell', { name: '미분류' }))!
  await user.click(within(row).getByRole('button'))
  expect(await screen.findByRole('link', { name: 'revoked-admin-key' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'active-admin-key' })).not.toBeInTheDocument()
  expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('reasonCategory')).toBe('UNCLASSIFIED')
})

test('reopens an exact category URL without combining a different category', async () => {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(`${route}&errorType=server_busy&reasonCategory=PROVIDER`)
  expect(await screen.findByRole('link', { name: 'suspended-admin-key' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'active-admin-key' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'revoked-admin-key' })).not.toBeInTheDocument()
  expect(screen.getByText('보존된 요청').nextElementSibling).toHaveTextContent('3건')
})

test('drills the selected category as well as its raw error type', async () => {
  const user = userEvent.setup()
  const queries: URLSearchParams[] = []
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', ({ request }) => {
    const p = new URL(request.url).searchParams; queries.push(p)
    const fixture = llmCapacityFixture({ from: p.get('from')!, to: p.get('to')!, group: 'KEY' })
    fixture.reasons = [{ errorType: 'server_busy', category: 'GLOBAL_ADMISSION', requests: 2, knownKeys: 1 }, { errorType: 'server_busy', category: 'PROVIDER', requests: 3, knownKeys: 1 }]
    return HttpResponse.json(fixture)
  }))
  renderApp(route)
  const table = within(await screen.findByRole('table', { name: '같은 조건의 거절·오류 원인' }))
  await user.click(within(table.getByRole('row', { name: /전역 중계/ })).getByRole('button'))
  await waitFor(() => expect(queries.at(-1)?.get('reasonCategory')).toBe('GLOBAL_ADMISSION'))
})

test('clears only the final-route restriction and page while preserving the other filters', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(`${route}&org=${uuid(1)}&workspaceId=${uuid(12)}&upstreamId=${uuid(301)}&publicModelName=campus%2Fexample&errorType=server_busy&reasonCategory=PROVIDER&page=2`)
  await user.click(await screen.findByRole('button', { name: '경로 제한 없이 보기' }))
  const params = new URL(currentPath(), 'https://pickle.invalid').searchParams
  expect(params.has('upstreamId')).toBe(false)
  expect(params.has('page')).toBe(false)
  expect(params.get('org')).toBe(uuid(1))
  expect(params.get('workspaceId')).toBe(uuid(12))
  expect(params.get('publicModelName')).toBe('campus/example')
  expect(params.get('errorType')).toBe('server_busy')
  expect(params.get('reasonCategory')).toBe('PROVIDER')
  expect(params.get('from')).toBe('2026-10-20T00:00:00Z')
  expect(params.get('to')).toBe('2026-10-21T00:00:00Z')
})
