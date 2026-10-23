import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { orgViewerUser, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { llmCapacityFixture } from '../test/msw/handlers/llm-capacity'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'

const from = '2026-10-20T00:00:30.125Z'
const to = '2026-10-20T01:00:45.875Z'
const route = `/admin/llm/status?tab=metrics&view=capacity&from=${from}&to=${to}`

test('preserves exact UTC boundaries when applying an unchanged KST editor', async () => {
  const user = userEvent.setup()
  const queries: URLSearchParams[] = []
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', ({ request }) => {
    const p = new URL(request.url).searchParams
    queries.push(p)
    return HttpResponse.json(llmCapacityFixture({ from: p.get('from')!, to: p.get('to')! }))
  }))
  renderApp(route)
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  await user.click(screen.getByRole('button', { name: '기간 적용' }))
  const params = new URL(currentPath(), 'https://pickle.invalid').searchParams
  expect(params.get('from')).toBe(from)
  expect(params.get('to')).toBe(to)
  await waitFor(() => expect(queries.at(-1)?.get('from')).toBe(from))
  expect(queries.at(-1)?.get('to')).toBe(to)
})

test('shows the precision of the actual returned half-open window', async () => {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(route)
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  expect(screen.getByText('실제 응답 기간').nextElementSibling).toHaveTextContent('2026-10-20 09:00:30.125 KST 이상 ~ 2026-10-20 10:00:45.875 KST 미만')
})

test('distinguishes reported provider and unknown busy reasons from known global admission', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(route)
  const table = within(await screen.findByRole('table', { name: '같은 조건의 거절·오류 원인' }))
  const provider = table.getByRole('button', { name: 'server_busy (공급 경로 결과)' })
  expect(table.getByRole('button', { name: 'server_busy (발생 위치 미확인)' })).toBeInTheDocument()
  expect(table.getByRole('button', { name: '전체 중계 처리 여유 부족' })).toBeInTheDocument()
  await user.click(provider)
  expect(await screen.findByText(/선택한 원인: server_busy \(공급 경로 결과\)/)).toBeInTheDocument()
})

test('shows unlimited retention instead of zero days', async () => {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => {
    const fixture = llmCapacityFixture({ from, to })
    fixture.quality.configuredRetentionDays = 0
    return HttpResponse.json(fixture)
  }))
  renderApp(route)
  await screen.findByRole('heading', { name: '기록의 보존과 전달' })
  expect(screen.getByText('설정된 보존 기간').nextElementSibling).toHaveTextContent('무기한')
})

test('keeps swept price samples unknown instead of claiming there were no samples', async () => {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => {
    const fixture = llmCapacityFixture({ from, to })
    fixture.quality.rawHistoryState = 'FULLY_SWEPT'
    fixture.summary = { ...fixture.summary, costUsd: null, pricedRequests: null }
    return HttpResponse.json(fixture)
  }))
  renderApp(route)
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  expect(screen.getByText('공급자가 보고한 요청 금액').nextElementSibling).toHaveTextContent('미확인')
  expect(screen.getByText('금액 표본').nextElementSibling).toHaveTextContent('미확인')
})

test('does not interpret institution-masked shipping diagnostics as a missing observation', async () => {
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
  renderApp(`${route}&org=${uuid(1)}`)
  await screen.findByRole('heading', { name: '기록의 보존과 전달' })
  expect(screen.getByText('사용량 전달 마지막 성공').nextElementSibling).toHaveTextContent('제공되지 않음')
})

test.each([
  [0, '$0.00'],
  [0.00000001, '$0.00000001'],
  [0.00000049, '$0.00000049'],
] as const)('preserves reported amount %s separately from zero and unknown', async (costUsd, expected) => {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => {
    const fixture = llmCapacityFixture({ from, to })
    fixture.summary = { ...fixture.summary, costUsd, pricedRequests: 1 }
    return HttpResponse.json(fixture)
  }))
  renderApp(route)
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  expect(screen.getByText('공급자가 보고한 요청 금액').nextElementSibling).toHaveTextContent(expected)
})
