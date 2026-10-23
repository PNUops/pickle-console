import { act, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { orgViewerProfile, orgViewerUser, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { llmCapacityFixture } from '../test/msw/handlers/llm-capacity'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'
import { AUTHORITY_OVERRIDES, mockInstitutionAuthority } from '../test/msw/institution-authority'
import { AuthProvider } from '../auth/AuthProvider'
import { useAuth, type AuthContextValue } from '../auth/auth-context'
import { ToastProvider } from '../components/ui'
import App from '../App'

const route = '/admin/llm/status?tab=metrics&view=capacity&from=2026-10-20T00:00:00Z&to=2026-10-21T00:00:00Z'

test('opens demand comparison inside service metrics without implying installed telemetry', async () => {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(route)
  expect(await screen.findByRole('tab', { name: '장비와 수요 비교' })).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: '같은 시간창의 수요' })).toBeInTheDocument()
  expect(screen.getByText(/장비·추론 수집이 구성되지 않았습니다/)).toBeInTheDocument()
  expect(screen.getByText(/초당 처리량이나 순간 최댓값이 아닙니다/)).toBeInTheDocument()
  expect(screen.queryByText(/TTFT|TPOT/)).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: '같은 기간의 요청 기록 정확값' })).toBeInTheDocument()
})

test('does not render global telemetry for an institution even if the response flag is wrong', async () => {
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(llmCapacityFixture())))
  renderApp(`${route}&org=${uuid(1)}`)
  expect(await screen.findByRole('heading', { name: '같은 시간창의 수요' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '장비 전체와 추론 관측' })).not.toBeInTheDocument()
})

test('keeps fully swept nulls separate from measured zero and hidden money', async () => {
  const fixture = llmCapacityFixture({}, false)
  fixture.quality.rawHistoryState = 'FULLY_SWEPT'
  fixture.summary = Object.fromEntries(Object.keys(fixture.summary).map((key) => [key, key === 'financeVisible' ? false : null])) as typeof fixture.summary
  fixture.series = []
  fixture.reasons = []
  fixture.consumers.items = []
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(fixture)))
  renderApp(route)
  expect(await screen.findByText(/조회 기간의 원문 수요 기록이 보존되어 있지 않습니다/)).toBeInTheDocument()
  expect(screen.getAllByText('미확인').length).toBeGreaterThan(0)
  expect(screen.getAllByText('제공되지 않음').length).toBeGreaterThan(0)
  expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
})

test('filters a reason over the same window and enters the exact key with a return URL', async () => {
  const user = userEvent.setup()
  const queries: URLSearchParams[] = []
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', ({ request }) => {
    const p = new URL(request.url).searchParams
    queries.push(p)
    return HttpResponse.json(llmCapacityFixture({ from: p.get('from')!, to: p.get('to')!, group: p.get('group') === 'KEY' ? 'KEY' : 'WORKSPACE', errorType: p.get('errorType') ?? undefined }))
  }))
  renderApp(route)
  await user.click(await screen.findByRole('button', { name: '일일 토큰 한도 소진' }))
  const link = await screen.findByRole('link', { name: 'active-admin-key' })
  const last = queries.at(-1)!
  expect(last.get('errorType')).toBe('quota_exhausted')
  expect(last.get('group')).toBe('KEY')
  expect(last.get('from')).toBe('2026-10-20T00:00:00.000Z')
  const target = new URL(link.getAttribute('href')!, 'https://pickle.invalid')
  expect(target.pathname).toBe(`/admin/llm/keys/${uuid(171)}`)
  expect(target.searchParams.get('returnTo')).toContain('errorType=quota_exhausted')
  await user.click(link)
  expect(await screen.findByRole('link', { name: '← 장비와 수요 비교' })).toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: '← 장비와 수요 비교' }))
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  expect(currentPath()).toContain('errorType=quota_exhausted')
})

test('preserves an unrecorded error type as an exact missing filter', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(route)
  const reasons = within(await screen.findByRole('table', { name: '같은 조건의 거절·오류 원인' }))
  await user.click(within(reasons.getByRole('row', { name: /원인 미기록 미분류/ })).getByRole('button'))
  await waitFor(() => expect(currentPath()).toContain('errorTypeMissing=true'))
  expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.has('errorType')).toBe(false)
})

test('keeps exact filters and window when paging beyond the first consumer page', async () => {
  const user = userEvent.setup()
  const pages: string[] = []
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', ({ request }) => {
    const p = new URL(request.url).searchParams; pages.push(p.toString())
    const fixture = llmCapacityFixture({ page: Number(p.get('page')), group: 'KEY' })
    fixture.consumers.totalElements = 21; fixture.consumers.totalPages = 2
    return HttpResponse.json(fixture)
  }))
  renderApp(`${route}&group=KEY&errorType=quota_exhausted`)
  await user.click(await screen.findByRole('button', { name: '다음' }))
  await waitFor(() => expect(pages.at(-1)).toContain('page=1'))
  expect(pages.at(-1)).toContain('errorType=quota_exhausted')
  expect(pages.at(-1)).toContain('from=2026-10-20T00%3A00%3A00.000Z')
})

test('shows a failed refresh beside the last successful response instead of hiding it', async () => {
  const user = userEvent.setup(); let calls = 0
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => {
    calls++
    return calls === 1 ? HttpResponse.json(llmCapacityFixture()) : HttpResponse.json({ title: '합성 갱신 실패', status: 503 }, { status: 503 })
  }))
  renderApp(route)
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  await user.click(screen.getByRole('button', { name: '다시 조회' }))
  expect(await screen.findByText(/갱신하지 못했습니다/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '같은 시간창의 수요' })).toBeInTheDocument()
  expect(screen.getByText('콘솔 마지막 GET 성공')).toBeInTheDocument()
})

test('labels retained previous-window data while the new window is loading', async () => {
  const user = userEvent.setup(); let release: (() => void) | undefined; let calls = 0
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', async ({ request }) => {
    const p = new URL(request.url).searchParams; calls++
    if (calls > 1) await new Promise<void>((resolve) => { release = resolve })
    return HttpResponse.json(llmCapacityFixture({ from: p.get('from')!, to: p.get('to')! }))
  }))
  renderApp(route)
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  await user.click(screen.getByRole('button', { name: '1시간' }))
  expect(await screen.findByText(/이전 조회 결과입니다/)).toBeInTheDocument()
  expect(screen.queryByRole('table', { name: '같은 조건의 소비처' })).not.toBeInTheDocument()
  await waitFor(() => expect(release).toBeDefined()); release!()
  await waitFor(() => expect(screen.queryByText(/이전 조회 결과입니다/)).not.toBeInTheDocument())
})

test('never replays the old institution while its replacement response is pending', async () => {
  const user = userEvent.setup(); let release: (() => void) | undefined
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', async ({ request }) => {
    const p = new URL(request.url).searchParams
    if (p.get('orgId') === uuid(2)) await new Promise<void>((resolve) => { release = resolve })
    const fixture = llmCapacityFixture({ orgId: p.get('orgId') ?? undefined })
    fixture.consumers.items[0].workspaceName = p.get('orgId') === uuid(2) ? '새 기관 수요' : '이전 기관 수요'
    return HttpResponse.json(fixture)
  }))
  renderApp(`${route}&org=${uuid(1)}`)
  await screen.findByRole('button', { name: '이전 기관 수요' })
  await user.selectOptions(screen.getByRole('combobox', { name: '관리 기관 선택' }), uuid(2))
  await waitFor(() => expect(release).toBeDefined())
  expect(screen.queryByText('이전 기관 수요')).not.toBeInTheDocument()
  release!()
  expect(await screen.findByRole('button', { name: '새 기관 수요' })).toBeInTheDocument()
})

test('retains the original response window and GET time when a different window fails', async () => {
  const user = userEvent.setup(); let calls = 0
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => {
    calls++
    return calls === 1 ? HttpResponse.json(llmCapacityFixture()) : HttpResponse.json({ title: '합성 기간 실패', status: 503 }, { status: 503 })
  }))
  renderApp(route)
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  await user.click(screen.getByRole('button', { name: '1시간' }))
  await screen.findByText(/갱신하지 못했습니다/)
  expect(screen.getByText(/이전 조회 결과입니다/)).toBeInTheDocument()
  expect(screen.getByText('콘솔 마지막 GET 성공')).toBeInTheDocument()
  expect(screen.queryByRole('table', { name: '같은 조건의 소비처' })).not.toBeInTheDocument()
})

test('keeps configured zero, unlimited, and unreported service defaults distinct', async () => {
  const fixture = llmCapacityFixture({ group: 'KEY' })
  fixture.quality.rawHistoryState = 'PARTIALLY_SWEPT'
  fixture.consumers.items = fixture.consumers.items.slice(0, 1)
  fixture.consumers.items[0].currentLimits = { configurationObservedAt: fixture.generatedAt, rpm: null, tpm: 0, concurrency: 0, dailyTokens: 0, quotaExhausted: false, serviceDefaultsReported: false }
  fixture.consumers.items.push({ ...fixture.consumers.items[0], keyId: uuid(172), keyName: 'suspended-admin-key', currentLimits: { ...fixture.consumers.items[0].currentLimits, dailyTokens: null } })
  fixture.consumers.totalElements = 2
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(fixture)))
  renderApp(`${route}&group=KEY`)
  expect(await screen.findByText(/일일 TOKEN 사용 불가/)).toBeInTheDocument()
  expect(screen.getAllByText(/RPM 기본값 미보고/)).toHaveLength(2)
  expect(screen.getByText(/일일 무제한/)).toBeInTheDocument()
  expect(screen.getByText(/조회 기간 일부가 삭제되어/)).toBeInTheDocument()
  expect(screen.getAllByText(/과거 요청 당시 설정이나 서비스 반영 완료를 뜻하지 않습니다/)).toHaveLength(2)
})

test('does not issue a broadened request for malformed scope filters', async () => {
  let calls = 0
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/llm/capacity', () => { calls++; return HttpResponse.json(llmCapacityFixture()) }))
  renderApp(`${route}&workspaceId=invalid`)
  expect(await screen.findByText('조회 대상의 식별자가 올바르지 않습니다.')).toBeInTheDocument()
  expect(calls).toBe(0)
})

test('applies model and upstream filters by keyboard while retaining URL and window', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(route)
  const model = await screen.findByRole('textbox', { name: '요청한 공개 모델' })
  await user.type(model, 'campus/example{Enter}')
  await waitFor(() => expect(currentPath()).toContain('publicModelName=campus%2Fexample'))
  await user.selectOptions(await screen.findByRole('combobox', { name: '최종 처리 공급원' }), uuid(301))
  await waitFor(() => expect(currentPath()).toContain(`upstreamId=${uuid(301)}`))
  expect(currentPath()).toContain('from=2026-10-20')
})

test('removes cached demand after same-role workspace authority changes', async () => {
  const initial = mockInstitutionAuthority(orgViewerProfile)
  initial.authorityFingerprint = 'synthetic-observation-first'
  initial.assignments[0].permission = { mode: 'SELECTED', work: ['llm.observe'], scopes: { LLM: { mode: 'LISTED', workspaceIds: [uuid(12)] } }, revision: 40 }
  AUTHORITY_OVERRIDES[orgViewerProfile.id] = initial
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser), http.get('*/api/v1/admin/llm/capacity', () => HttpResponse.json(llmCapacityFixture({}, false))))
  let auth!: AuthContextValue
  function Capture() { auth = useAuth(); return null }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<MemoryRouter initialEntries={[`${route}&org=${uuid(1)}&workspaceId=${uuid(12)}`]}><QueryClientProvider client={client}><AuthProvider><ToastProvider><Capture /><App /></ToastProvider></AuthProvider></QueryClientProvider></MemoryRouter>)
  await screen.findByRole('heading', { name: '같은 시간창의 수요' })
  const changed = structuredClone(initial)
  changed.authorityFingerprint = 'synthetic-observation-second'
  changed.assignments[0].permission = { mode: 'SELECTED', work: ['llm.observe'], scopes: { LLM: { mode: 'LISTED', workspaceIds: [uuid(13)] } }, revision: 41 }
  AUTHORITY_OVERRIDES[orgViewerProfile.id] = changed
  await act(async () => { await auth.refreshProfile() })
  expect(auth.user?.role).toBe('ORG_VIEWER')
  expect(screen.queryByRole('heading', { name: '같은 시간창의 수요' })).not.toBeInTheDocument()
  expect(screen.getByText('선택한 기관·공간 범위의 LLM 관측 업무가 없습니다.')).toBeInTheDocument()
})
