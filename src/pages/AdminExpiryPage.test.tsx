import { act, render, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, MemoryRouter } from 'react-router'
import App from '../App'
import { AuthContext, type AuthContextValue, type UserProfile } from '../auth/auth-context'
import { setAccessToken } from '../api/token'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui'
import { ADMIN_DEADLINE_QUERY_KEY } from '../lib/admin-deadline-cache'
import { vmStore } from '../test/msw/handlers/vms'
import { externalDomains } from '../test/msw/handlers/publishing'
import { adminLlmKeyStore } from '../test/msw/handlers/llm-keys'
import { gpuAllocationFixture, gpuAllocationStore, gpuActions } from '../test/msw/handlers/gpu'
import { PathnameProbe } from '../test/PathnameProbe'
import type { AdminResourceDeadline } from '../api/resource-deadlines'
import { ACCESS_TOKENS, refreshSuccessHandler, sysAdminUser, sysManagerUser, sysViewerUser, orgAdminUser, orgManagerUser, orgViewerUser } from '../test/msw/handlers/auth'
import { deadlineFixture, deadlinePage, deadlineRequests } from '../test/msw/handlers/resource-deadlines'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp, currentPath } from '../test/render'

function renderExpiry(route = '/admin/expiry') {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  return renderApp(route)
}
function respond(rows: AdminResourceDeadline[]) {
  server.use(http.get('*/api/v1/admin/resource-deadlines', ({ request }) => { deadlineRequests.push(new URL(request.url).searchParams); return HttpResponse.json(deadlinePage(rows)) }))
}
function resourceRow(name: string) { return screen.getByText(name).closest('tr')! }
function renderHistory(route: string) {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter([{ path: '*', element: <QueryClientProvider client={client}><AuthProvider><ToastProvider><App /><PathnameProbe /></ToastProvider></AuthProvider></QueryClientProvider> }], { initialEntries: [route] })
  render(<RouterProvider router={router} />)
  return { router, client }
}
afterEach(() => vi.unstubAllEnvs())

describe('Resource deadline projection', () => {
  test('reads one projection for all six primary deadline kinds without legacy list requests', async () => {
    const legacy: string[] = []
    for (const path of ['vms', 'llm/keys', 'domains', 'gpu-allocations']) {
      server.use(http.get(`*/api/v1/admin/${path}`, ({ request }) => { legacy.push(request.url); return HttpResponse.json([]) }))
    }
    renderExpiry()
    await screen.findByText('총 6개 자원')
    for (const name of ['algo-judge', 'capstone-key', 'docs.example.test', 'reserved.example.test', 'gpu-queue-date', 'gpu-lease-date']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    expect(legacy).toEqual([])
    expect(deadlineRequests).toHaveLength(1)
    expect(screen.queryByRole('button', { name: '기간 연장' })).not.toBeInTheDocument()
  })

  test.each([
    ['access-sys-admin', sysAdminUser], ['access-sys-manager', sysManagerUser], ['access-sys-viewer', sysViewerUser],
    ['access-org-admin', orgAdminUser], ['access-org-manager', orgManagerUser], ['access-org-viewer', orgViewerUser],
  ] as const)('allows global metadata reads for %s without granting inline writes', async (token, actor) => {
    server.use(refreshSuccessHandler(token, actor))
    respond([deadlineFixture({ name: 'foreign-resource', orgId: uuid(2), orgName: '타 기관' })])
    renderApp('/admin/expiry')
    await screen.findByText('foreign-resource')
    const row = resourceRow('foreign-resource')
    expect(within(row).getByRole('link', { name: '상세 열기' })).toHaveAttribute('href', `/admin/vms/${uuid(56)}?org=${uuid(2)}`)
    expect(deadlineRequests).toHaveLength(1)
    expect(deadlineRequests[0].has('orgId')).toBe(false)
    expect(screen.queryByRole('button', { name: '기간 연장' })).not.toBeInTheDocument()
  })

  test.each([
    ['access-org-manager', orgManagerUser, uuid(56), uuid(1), 'algo-judge', true],
    ['access-org-manager', orgManagerUser, uuid(61), uuid(2), 'ai-train', false],
    ['access-org-viewer', orgViewerUser, uuid(56), uuid(1), 'algo-judge', false],
    ['access-sys-viewer', sysViewerUser, uuid(56), uuid(1), 'algo-judge', false],
  ] as const)('preserves the actual organization write boundary for %s and %s', async (token, actor, id, orgId, name, allowed) => {
    server.use(refreshSuccessHandler(token, actor))
    respond([deadlineFixture({ id, orgId, name })])
    renderApp('/admin/expiry')
    await screen.findByText(name)
    await userEvent.setup().click(within(resourceRow(name)).getByRole('link', { name: '상세 열기' }))
    await screen.findByRole('heading', { name, level: 1 })
    await waitFor(() => {
      if (allowed) expect(screen.getByRole('button', { name: '기간 연장' })).toBeInTheDocument()
      else expect(screen.queryByRole('button', { name: '기간 연장' })).not.toBeInTheDocument()
    })
  })

  test.each(['-1', 'invalid', '2147483648', '0'])('normalizes malformed or default page %s without forwarding it', async (page) => {
    renderExpiry(`/admin/expiry?window=D30&page=${page}`)
    await screen.findByText('algo-judge')
    expect(deadlineRequests[0].get('page')).toBe('0')
    await waitFor(() => expect(currentPath()).toBe('/admin/expiry?window=D30'))
  })

  test('forwards URL filters and resets page when a window changes', async () => {
    renderExpiry(`/admin/expiry?org=${uuid(1)}&workspaceId=${uuid(11)}&type=DOMAIN&deadlineKind=DOMAIN_RENEWAL&window=D30&sort=-deadlineAt&page=2`)
    await screen.findByText('요청한 페이지가 조회 범위를 벗어났습니다.')
    expect(Object.fromEntries(deadlineRequests[0])).toEqual({ orgId: uuid(1), workspaceId: uuid(11), type: 'DOMAIN', deadlineKind: 'DOMAIN_RENEWAL', expiringInDays: '30', sort: '-deadlineAt', page: '2', size: '20' })
    await userEvent.setup().click(screen.getByRole('button', { name: '만료됨' }))
    await waitFor(() => expect(deadlineRequests.at(-1)?.get('expired')).toBe('true'))
    expect(deadlineRequests.at(-1)?.has('expiringInDays')).toBe(false)
    expect(deadlineRequests.at(-1)?.get('page')).toBe('0')
    expect(currentPath()).toContain('workspaceId=')
    expect(currentPath()).not.toContain('page=')
  })

  test('preserves server order, total count and page instead of sorting or merging rows', async () => {
    const names = Array.from({ length: 21 }, (_, index) => `resource-${index}`)
    server.use(http.get('*/api/v1/admin/resource-deadlines', ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('page'))
      const rows = names.slice(page * 20, (page + 1) * 20).map((name, index) => deadlineFixture({ name, id: uuid(2000 + page * 20 + index), deadlineAt: index % 2 ? '2030-01-01T00:00:00Z' : '2031-01-01T00:00:00Z' }))
      return HttpResponse.json(deadlinePage(rows, page, 20, 21))
    }))
    renderExpiry()
    await screen.findByText('총 21개 자원')
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('resource-0')
    expect(screen.getAllByRole('row')[2]).toHaveTextContent('resource-1')
    await userEvent.setup().click(screen.getByRole('button', { name: /다음/ }))
    await screen.findByText('resource-20')
    expect(screen.queryByText('resource-0')).not.toBeInTheDocument()
    expect(currentPath()).toContain('page=1')
  })

  test.each(['type=OTHER', 'deadlineKind=OTHER', 'workspaceId=bad', 'window=OTHER', 'sort=name'])('rejects invalid URL filters: %s', async (filter) => {
    renderExpiry(`/admin/expiry?${filter}&page=3`)
    await screen.findByText(/조회 조건을 확인해 주세요/)
    expect(deadlineRequests).toHaveLength(0)
    await userEvent.setup().click(screen.getByRole('button', { name: '필터 초기화' }))
    await screen.findByText('algo-judge')
    expect(currentPath()).toBe('/admin/expiry')
  })

  test('validates workspace input and preserves other filters on submit', async () => {
    renderExpiry('/admin/expiry?window=D30&sort=-deadlineAt')
    await screen.findByText('algo-judge')
    const input = screen.getByLabelText('워크스페이스 ID')
    fireEvent.change(input, { target: { value: 'invalid' } })
    await userEvent.setup().click(screen.getByRole('button', { name: '워크스페이스로 조회' }))
    expect(screen.getByText('워크스페이스 ID를 UUID 형식으로 입력해 주세요.')).toBeInTheDocument()
    expect(deadlineRequests).toHaveLength(1)
    fireEvent.change(input, { target: { value: uuid(11).toUpperCase() } })
    await userEvent.setup().click(screen.getByRole('button', { name: '워크스페이스로 조회' }))
    await waitFor(() => expect(deadlineRequests.at(-1)?.get('workspaceId')).toBe(uuid(11)))
    expect(currentPath()).toContain('window=D30')
    expect(currentPath()).toContain('sort=-deadlineAt')
  })

  test('uses server elapsed state and KST observation while keeping stored lifecycle status separate', async () => {
    respond([deadlineFixture({ name: 'elapsed-running', sourceStatus: 'RUNNING', status: 'RUNNING', overdue: true, observedAt: '2030-01-01T15:01:00Z', deadlineAt: '2030-01-01T15:00:00Z', inclusiveEndDate: '2030-01-01', dates: { endDate: '2030-01-01', expiryStoppedAt: null } })])
    renderExpiry('/admin/expiry?window=EXPIRED')
    await screen.findByText('elapsed-running')
    const row = resourceRow('elapsed-running')
    expect(within(row).getByText('기한 경과')).toBeInTheDocument()
    expect(within(row).getByText(/저장 상태: 실행 중/)).toBeInTheDocument()
    expect(within(row).getByText('2030-01-01까지 포함')).toBeInTheDocument()
    expect(within(row).getByText(/2030.*01.*02.*00:01.*KST/)).toBeInTheDocument()
    expect(within(row).queryByText('자동 중지됨')).not.toBeInTheDocument()
    expect(within(row).queryByText(/D[+-]/)).not.toBeInTheDocument()
    expect(within(row).getByText('만료 중지 관측:').parentElement).toHaveTextContent('—')
  })

  test('keeps a released domain reservation stored status neutral without claiming a live connection', async () => {
    const releasedAt = new Date(Date.now() - 86_400_000).toISOString()
    const reservedUntil = new Date(Date.now() + 2 * 86_400_000).toISOString()
    const stored = deadlineFixture({ id: uuid(9102), type: 'DOMAIN', name: 'released-reservation', sourceStatus: 'ACTIVE', status: 'ACTIVE', deadlineKind: 'DOMAIN_RESERVATION', deadlineAt: reservedUntil, inclusiveEndDate: null,
      dates: { releasedAt, reservedUntil, renewDueAt: new Date(Date.now() - 2 * 86_400_000).toISOString() } })
    respond([stored])
    renderExpiry()
    await screen.findByText('released-reservation')
    const row = resourceRow('released-reservation')
    expect(within(row).getByText('도메인 예약 종료')).toBeInTheDocument()
    expect(within(row).getByText('저장 상태: 활성')).toBeInTheDocument()
    expect(within(row).queryByText(/연결됨/)).not.toBeInTheDocument()
    await userEvent.setup().click(within(row).getByText('관련 날짜'))
    const exact = within(row).getByText(releasedAt)
    await userEvent.setup().click(within(exact.closest('details')!).getByText('원본 시각'))
    expect(exact).toBeVisible()
    expect(stored.sourceStatus).toBe('ACTIVE')
    expect(stored.status).toBe('ACTIVE')
    expect(stored.overdue).toBe(false)
  })

  test('exposes exact server microseconds alongside readable KST timestamps', async () => {
    const deadline = '2030-01-01T15:00:00.123456Z'
    const observed = '2030-01-01T15:00:00.654321Z'
    const related = '2030-01-01T15:00:00.111111Z'
    respond([deadlineFixture({ deadlineAt: deadline, observedAt: observed, dates: { expiryStoppedAt: related } })])
    renderExpiry()
    await screen.findByText('algo-judge')
    const row = resourceRow('algo-judge')
    await userEvent.setup().click(within(row).getByText('관련 날짜'))
    for (const value of [deadline, observed, related]) {
      const exact = within(row).getByText(value)
      const disclosure = exact.closest('details')!
      await userEvent.setup().click(within(disclosure).getByText('원본 시각'))
      expect(disclosure).toHaveAttribute('open')
      expect(exact).toBeVisible()
    }
    expect(within(row).getAllByText(/2030.*01.*02.*00:00:00.*KST/).length).toBe(3)
  })

  test('retains unknown and invalid rows and denies their detail actions without epoch fallback', async () => {
    const unknown = { ...deadlineFixture({ name: 'unknown-resource' }), type: 'FUTURE', deadlineKind: 'FUTURE_END', status: 'FUTURE', sourceStatus: 'FUTURE' } as unknown as AdminResourceDeadline
    respond([unknown, { ...deadlineFixture({ name: 'unknown-kind', id: uuid(2002) }), deadlineKind: 'FUTURE_END' } as unknown as AdminResourceDeadline, deadlineFixture({ name: 'unknown-status', id: uuid(2003), status: 'FUTURE' }), deadlineFixture({ name: 'invalid-date', id: uuid(2001), deadlineAt: '0', observedAt: '2030-02-30T00:00:00Z', inclusiveEndDate: '2030-02-30', dates: { endDate: null } })])
    renderExpiry()
    await screen.findByText('unknown-resource')
    expect(screen.getAllByText('알 수 없음 (FUTURE_END)')).toHaveLength(2)
    for (const name of ['unknown-resource', 'unknown-kind', 'unknown-status', 'invalid-date']) expect(within(resourceRow(name)).queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument()
    expect(within(resourceRow('invalid-date')).getAllByText(/기한 정보 확인 필요/).length).toBeGreaterThan(0)
  })

  test('keeps GPU rows readable but non-actionable when the preview gate is disabled', async () => {
    vi.stubEnv('VITE_GPU_PREVIEW', '0')
    renderExpiry()
    await screen.findByText('gpu-lease-date')
    expect(within(resourceRow('gpu-lease-date')).queryByRole('link')).not.toBeInTheDocument()
    expect(within(resourceRow('gpu-lease-date')).getByText('GPU 상세 준비 중')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'GPU' })).toBeInTheDocument()
  })

  test('opens all four existing detail paths with the resource actual organization', async () => {
    vi.stubEnv('VITE_GPU_PREVIEW', '1')
    renderExpiry()
    await screen.findByText('algo-judge')
    for (const [name, path] of [['algo-judge', `/admin/vms/${uuid(56)}`], ['capstone-key', `/admin/llm/keys/${uuid(171)}`], ['docs.example.test', `/admin/domains?domainId=${uuid(9101)}`], ['gpu-lease-date', `/admin/gpus/${uuid(902)}`]]) {
      const href = within(resourceRow(name)).getByRole('link', { name: '상세 열기' }).getAttribute('href')!
      expect(href).toContain(path)
      expect(new URL(href, 'http://localhost').searchParams.get('org')).toBe(uuid(1))
    }
  })

  test.each(['success', 'failure'] as const)('isolates a late previous organization %s response', async (outcome) => {
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    let entered = false
    server.use(http.get('*/api/v1/admin/resource-deadlines', async ({ request }) => {
      const org = new URL(request.url).searchParams.get('orgId')
      if (org === uuid(1)) {
        entered = true
        await held
        return outcome === 'success' ? HttpResponse.json(deadlinePage([deadlineFixture({ name: 'old-private-row' })], 0, 20, 99)) : HttpResponse.json({ detail: 'old-private-error' }, { status: 403 })
      }
      return HttpResponse.json(deadlinePage([deadlineFixture({ name: 'current-org-row', orgId: uuid(2), orgName: '테스트 기관' })]))
    }))
    renderExpiry(`/admin/expiry?org=${uuid(1)}`)
    await waitFor(() => expect(entered).toBe(true))
    await userEvent.setup().selectOptions(screen.getByLabelText('관리 기관 선택'), uuid(2))
    await screen.findByText('current-org-row')
    await act(async () => { release(); await held })
    await waitFor(() => expect(screen.getByText('총 1개 자원')).toBeInTheDocument())
    expect(screen.queryByText('old-private-row')).not.toBeInTheDocument()
    expect(screen.queryByText('old-private-error')).not.toBeInTheDocument()
    expect(screen.queryByText('총 99개 자원')).not.toBeInTheDocument()
  })

  test.each(['actor', 'role'] as const)('isolates a held response after the same organization reader %s changes', async (change) => {
    setAccessToken('access-sys-admin')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const initial = ACCESS_TOKENS['access-sys-admin']
    const next: UserProfile = change === 'actor' ? ACCESS_TOKENS['access-sys-viewer'] : { ...initial, role: 'SYS_VIEWER' }
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    let reads = 0
    server.use(http.get('*/api/v1/admin/resource-deadlines', async () => {
      reads += 1
      if (reads === 1) { await held; return HttpResponse.json(deadlinePage([deadlineFixture({ name: 'old-reader-row' })], 0, 20, 99)) }
      return HttpResponse.json(deadlinePage([deadlineFixture({ name: 'current-reader-row' })]))
    }))
    const reader = (profile: UserProfile) => {
      const auth: AuthContextValue = { status: 'authenticated', user: profile,
        login: async () => { throw new Error('Unused credential exchange') },
        completeMfa: async () => { throw new Error('Unused credential exchange') },
        refreshProfile: async () => {}, logout: async () => {}, beginCredentialExchange: () => { throw new Error('Unused credential exchange') } }
      return <MemoryRouter initialEntries={[`/admin/expiry?org=${uuid(1)}`]}><QueryClientProvider client={client}><AuthContext.Provider value={auth}><ToastProvider><App /></ToastProvider></AuthContext.Provider></QueryClientProvider></MemoryRouter>
    }
    const view = render(reader(initial))
    await waitFor(() => expect(reads).toBe(1))
    setAccessToken('access-sys-viewer')
    view.rerender(reader(next))
    await screen.findByText('current-reader-row')
    await act(async () => { release(); await held })
    expect(screen.getByText('총 1개 자원')).toBeInTheDocument()
    expect(screen.queryByText('old-reader-row')).not.toBeInTheDocument()
    expect(screen.queryByText('총 99개 자원')).not.toBeInTheDocument()
    expect(reads).toBe(2)
  })

  test('restores filters and page through browser history after visiting an existing detail', async () => {
    server.use(http.get('*/api/v1/admin/resource-deadlines', ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('page'))
      return HttpResponse.json(deadlinePage([deadlineFixture()], page, 20, 21))
    }))
    const route = '/admin/expiry?window=D30&sort=-deadlineAt&page=1'
    const { router } = renderHistory(route)
    await screen.findByText('algo-judge')
    await userEvent.setup().click(within(resourceRow('algo-judge')).getByRole('link', { name: '상세 열기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/admin/vms/${uuid(56)}`))
    await act(async () => { await router.navigate(-1) })
    await screen.findByText('algo-judge')
    expect(currentPath()).toBe(route)
    expect(screen.getByRole('button', { name: '2 페이지' })).toHaveAttribute('aria-current', 'page')
  })

  test('requeries the saved server page after changing a VM period through its existing detail', async () => {
    let reads = 0
    const vm = vmStore.find((row) => row.id === uuid(56))!
    server.use(http.get('*/api/v1/admin/resource-deadlines', ({ request }) => {
      reads += 1
      const page = Number(new URL(request.url).searchParams.get('page'))
      const content = vm.endDate === '2099-01-01' ? [] : [deadlineFixture()]
      return HttpResponse.json(deadlinePage(content, page, 20, content.length ? 21 : 0))
    }))
    const route = '/admin/expiry?window=D30&sort=-deadlineAt&page=1'
    const { router } = renderHistory(route)
    await screen.findByText('algo-judge')
    await userEvent.setup().click(within(resourceRow('algo-judge')).getByRole('link', { name: '상세 열기' }))
    await userEvent.setup().click(await screen.findByRole('button', { name: '기간 연장' }))
    const dialog = await screen.findByRole('dialog', { name: '기간 연장 — algo-judge' })
    fireEvent.change(within(dialog).getByLabelText(/새 종료일/), { target: { value: '2099-01-01' } })
    await userEvent.setup().click(within(dialog).getByRole('button', { name: '연장' }))
    await screen.findByText('새 종료일을 저장했습니다. 중지된 VM은 VM 관리에서 다시 시작해 주세요.')
    expect(vm.endDate).toBe('2099-01-01')
    await act(async () => { await router.navigate(-1) })
    await screen.findByText('총 0개 자원')
    expect(reads).toBe(2)
    expect(currentPath()).toBe(route)
    expect(screen.getByText('요청한 페이지가 조회 범위를 벗어났습니다.')).toBeInTheDocument()
    expect(screen.queryByText('algo-judge')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: '첫 페이지 보기' }))
    await screen.findByText('조건에 해당하는 자원 기한이 없습니다.')
    expect(currentPath()).toBe('/admin/expiry?window=D30&sort=-deadlineAt')
  })

  test('invalidates the projection after an existing LLM expiry change', async () => {
    const { client } = renderHistory(`/admin/llm/keys/${uuid(170)}?org=${uuid(1)}`)
    const key = [...ADMIN_DEADLINE_QUERY_KEY, 'saved-page']
    client.setQueryData(key, deadlinePage([]))
    await userEvent.setup().click(await screen.findByRole('button', { name: '만료일 변경' }))
    const dialog = await screen.findByRole('dialog', { name: 'LLM API 키 만료일 변경' })
    fireEvent.change(within(dialog).getByLabelText(/새 만료일/), { target: { value: '2030-01-01' } })
    await userEvent.setup().click(within(dialog).getByRole('button', { name: '변경' }))
    await screen.findByText('LLM API 키 만료일을 변경했습니다.')
    expect(adminLlmKeyStore.find((row) => row.id === uuid(170))!.expiresAt).toBe('2030-01-01T15:00:00.000Z')
    await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true))
  })

  test('invalidates the projection after existing domain renewal', async () => {
    const domain = externalDomains[0]
    const { client } = renderHistory(`/admin/domains?domainId=${domain.id}&org=${uuid(1)}`)
    const key = [...ADMIN_DEADLINE_QUERY_KEY, 'saved-page']
    client.setQueryData(key, deadlinePage([]))
    const dialog = await screen.findByRole('dialog', { name: '도메인 상세' })
    fireEvent.change(await within(dialog).findByLabelText('새 기한'), { target: { value: '2030-06-30' } })
    await userEvent.setup().click(within(dialog).getByRole('button', { name: '기한 조정' }))
    await screen.findByText(/사용 기한을 옮겼습니다/)
    expect(domain.renewDueAt?.startsWith('2030-06-30')).toBe(true)
    await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true))
  })

  test('invalidates the projection after an existing GPU lease extension without changing its grant', async () => {
    vi.stubEnv('VITE_GPU_PREVIEW', '1')
    const allocation = gpuAllocationFixture()
    gpuAllocationStore.push(allocation)
    const { client } = renderHistory(`/admin/gpus/${allocation.id}?org=${uuid(1)}`)
    const key = [...ADMIN_DEADLINE_QUERY_KEY, 'saved-page']
    client.setQueryData(key, deadlinePage([]))
    await userEvent.setup().click(await screen.findByRole('button', { name: '임대 연장' }))
    const dialog = await screen.findByRole('dialog', { name: 'GPU 임대 연장' })
    fireEvent.change(within(dialog).getByLabelText('추가 임대 기간'), { target: { value: '1' } })
    fireEvent.change(within(dialog).getByLabelText('처리 사유'), { target: { value: '수업 실습 기간 조정' } })
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'GPU 임대 연장' }))
    await screen.findByText('GPU 임대 연장 요청을 접수했습니다.')
    expect(gpuActions.at(-1)).toEqual({ action: 'extend', body: { hours: 1, reason: '수업 실습 기간 조정' } })
    await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true))
  })

  test('shows query failure instead of reporting an empty successful projection', async () => {
    server.use(http.get('*/api/v1/admin/resource-deadlines', () => HttpResponse.json({ type: 'about:blank', title: '조회 거부', detail: '기한 조회 권한이 없습니다.', status: 403, code: 'ACCESS_DENIED' }, { status: 403, headers: { 'Content-Type': 'application/problem+json' } })))
    renderExpiry()
    await screen.findByText('기한 조회 권한이 없습니다.')
    expect(screen.queryByText('조건에 해당하는 자원 기한이 없습니다.')).not.toBeInTheDocument()
    expect(screen.queryByText(/총 \d+개 자원/)).not.toBeInTheDocument()
  })
})
