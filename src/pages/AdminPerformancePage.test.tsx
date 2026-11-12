import { act, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import { orgAdminProfile, refreshSuccessHandler, regularProfile, sysAdminUser, sysManagerUser, sysViewerUser } from '../test/msw/handlers/auth'
import { llmPerformanceFixture } from '../test/msw/handlers/llm-performance'
import { performanceOverviewFixture } from '../test/msw/handlers/performance-overview'
import { AUTHORITY_OVERRIDES, mockInstitutionAuthority } from '../test/msw/institution-authority'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'
import { formatTokenCompact } from '../lib/token-presentation'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui'

function selectedWork(work: string[], delegatedUser = false) {
  const authority = mockInstitutionAuthority(orgAdminProfile)
  authority.accountRole = delegatedUser ? 'USER' : 'ORG_MANAGER'
  authority.authorityFingerprint = `performance-${work.join('-')}`
  authority.assignments[0].permission = {
    mode: 'SELECTED', work, scopes: { LLM: { mode: 'ALL', workspaceIds: [] } }, revision: 12,
  }
  AUTHORITY_OVERRIDES[delegatedUser ? regularProfile.id : orgAdminProfile.id] = authority
  server.use(refreshSuccessHandler(delegatedUser ? 'access-user' : 'access-org-admin'))
}

function metric(label: string) {
  return within(screen.getByRole('heading', { name: label }).closest('article')!)
}

test('all retained history is the default while dashboard and sidebar links stay intact', async () => {
  const live = vi.fn()
  const queries: URL[] = []
  const result = llmPerformanceFixture({ orgId: uuid(1) })
  result.population.workspaceCount = 42
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/system-summary', () => { live(); return HttpResponse.json({}) }),
    http.get('*/api/v1/admin/llm/usage/performance', ({ request }) => {
      queries.push(new URL(request.url))
      return HttpResponse.json(result)
    }))
  renderApp(`/admin/performance?org=${uuid(1)}`)
  await screen.findByRole('heading', { name: '활용 성과', level: 1 })
  await screen.findByText('2026-01-15 ~ 2026-11-12')
  expect(metric('LLM 요청').getByText(result.totals.requests.toLocaleString('ko-KR'))).toBeInTheDocument()
  const populations = within(screen.getByRole('region', { name: 'LLM 이용 규모' }))
  expect(populations.getByText('42')).toBeInTheDocument()
  expect(queries[0].searchParams.has('days')).toBe(false)
  expect(queries[0].searchParams.get('orgId')).toBe(uuid(1))
  expect(screen.getByRole('button', { name: '전체 기간' })).toHaveAttribute('aria-pressed', 'true')
  const links = within(screen.getByRole('navigation', { name: '관리자 메뉴' })).getAllByRole('link')
  expect(links[0]).toHaveAccessibleName('활용 성과')
  expect(links[1]).toHaveAccessibleName('대시보드')
  expect(links[1]).toHaveAttribute('href', `/admin?org=${uuid(1)}`)
  expect(await screen.findByRole('img', { name: '월별 LLM 요청' })).toBeInTheDocument()
  expect(screen.queryByText('수치 안내')).not.toBeInTheDocument()
  expect(screen.queryByText('추정 포함')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'LLM 사용량 자세히 보기' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '운영 대시보드 보기' })).not.toBeInTheDocument()
  expect(live).not.toHaveBeenCalled()
})

test('failed period changes never relabel previous totals and recover with the same scope', async () => {
  const user = userEvent.setup()
  let fail = true
  const initial = llmPerformanceFixture({ orgId: uuid(1) })
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/llm/usage/performance', ({ request }) => {
      const value = new URL(request.url).searchParams.get('days')
      const days = value == null ? undefined : Number(value) as 7 | 30 | 90
      if (days === 90 && fail) return new HttpResponse(null, { status: 500 })
      return HttpResponse.json(llmPerformanceFixture({ days, orgId: uuid(1) }))
    }))
  renderApp(`/admin/performance?org=${uuid(1)}`)
  await screen.findByText(initial.totals.requests.toLocaleString('ko-KR'))
  await user.click(screen.getByRole('button', { name: '최근 90일' }))
  await screen.findByText('LLM 활용 수치를 불러오지 못했어요.')
  expect(screen.queryByRole('heading', { name: 'LLM 요청' })).not.toBeInTheDocument()
  expect(screen.queryByText('2026-01-15 ~ 2026-11-12')).not.toBeInTheDocument()
  expect(currentPath()).toContain(`org=${uuid(1)}`)
  expect(currentPath()).toContain('days=90')
  fail = false
  await user.click(screen.getByRole('button', { name: '다시 시도' }))
  await screen.findByText('2026-08-15 ~ 2026-11-12')
  await user.click(screen.getByRole('button', { name: '전체 기간' }))
  await screen.findByText('2026-01-15 ~ 2026-11-12')
  expect(currentPath()).not.toContain('days=')
})

test('notice-only default admission falls back before any performance query', async () => {
  selectedWork(['notice.manage'])
  const usage = vi.fn()
  const summary = vi.fn()
  server.use(http.get('*/api/v1/admin/llm/usage/performance', () => { usage(); return new HttpResponse(null, { status: 403 }) }),
    http.get('*/api/v1/admin/summary', () => { summary(); return new HttpResponse(null, { status: 403 }) }))
  renderApp('/login')
  await screen.findByRole('heading', { name: '관리자 대시보드' })
  await waitFor(() => expect(currentPath()).toBe('/admin'))
  expect(screen.queryByRole('link', { name: '활용 성과' })).not.toBeInTheDocument()
  expect(usage).not.toHaveBeenCalled()
  expect(summary).not.toHaveBeenCalled()
})

test('LLM observation and request readers never query VM summaries or show financial fields', async () => {
  selectedWork(['llm.observe', 'llm.request.read'])
  const summary = vi.fn()
  server.use(http.get('*/api/v1/admin/summary', () => { summary(); return new HttpResponse(null, { status: 403 }) }),
    http.get('*/api/v1/admin/performance/overview', () => { summary(); return new HttpResponse(null, { status: 403 }) }))
  renderApp('/admin/performance')
  await screen.findByText('LLM 요청')
  expect(screen.queryByText(/플랫폼 전체의 활용/)).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '등록 가상머신 현황' })).not.toBeInTheDocument()
  expect(screen.queryByText(/금액|USD|잔액/)).not.toBeInTheDocument()
  expect(summary).not.toHaveBeenCalled()
})

test('delegated personal accounts keep institutional labels and scoped population counts', async () => {
  selectedWork(['llm.observe'], true)
  renderApp('/admin/performance')
  await screen.findByText('LLM 요청')
  expect(screen.getByRole('option', { name: '기관 필터 없음' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: '전체 플랫폼' })).not.toBeInTheDocument()
  const population = within(screen.getByRole('region', { name: 'LLM 이용 규모' }))
  expect(population.getByRole('heading', { name: 'LLM 이용 기관' }).parentElement).toHaveTextContent('1개')
})

test('missing rollup confirmation does not become measured zero and masked VM groups stay hidden', async () => {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/llm/usage/performance', () => {
      const result = llmPerformanceFixture()
      result.rollupLastSuccessAt = null
      result.gatewayReportState = 'NOT_REPORTED'
      return HttpResponse.json(result)
    }), http.get('*/api/v1/admin/summary', () => HttpResponse.json({ publishedServiceCount: 0 })))
  renderApp('/admin/performance')
  await screen.findByText('사용량 집계를 기다리고 있어요')
  expect(screen.queryByText('LLM 요청')).not.toBeInTheDocument()
  expect(screen.getByText('사용 기록 수집 상태를 확인하지 못했어요.')).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /가상머신 상태:/ })).not.toBeInTheDocument()
  expect(screen.queryByText('할당 vCPU')).not.toBeInTheDocument()
  expect(screen.getByText('등록된 공개 경로').parentElement).toHaveTextContent('0개')
})

test('token exact values stay accessible while unsafe sums never masquerade as exact', async () => {
  const user = userEvent.setup()
  const result = llmPerformanceFixture()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  const view = renderApp('/admin/performance')
  const total = result.totals.inputTokens + result.totals.outputTokens
  await user.click(await screen.findByRole('button', { name: `${formatTokenCompact(total)}, 정확값 보기` }))
  expect(screen.getByText(`정확값 ${total.toLocaleString('ko-KR')} 토큰`)).toBeInTheDocument()
  view.unmount()
  server.use(http.get('*/api/v1/admin/llm/usage/performance', () => HttpResponse.json({ ...result, totals: { ...result.totals, inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 2 } })))
  renderApp('/admin/performance')
  await screen.findByText('정확값 확인 불가')
})

test('deleted VM history never inflates the current state distribution', async () => {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/summary', () => HttpResponse.json({ vmCountsByStatus: { RUNNING: 3, STOPPED: 2, DELETED: 10_000 } })))
  renderApp('/admin/performance')
  await screen.findByRole('img', { name: '가상머신 상태: 실행 중 60%, 중지됨 40%' })
  expect(screen.queryByText('삭제됨')).not.toBeInTheDocument()
  expect(screen.queryByText('10,000')).not.toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: '등록 가상머신 현황' })).getByText('3대')).toBeInTheDocument()
})

test('hardware stays separate from institution filters while global business counts stay hidden', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  const view = renderApp('/admin/performance')
  await screen.findByRole('region', { name: '플랫폼 이용 현황' })
  const hardware = within(screen.getByRole('region', { name: '서버 인프라 규모' }))
  expect(hardware.getByRole('heading', { name: '총 RAM' }).parentElement).toHaveTextContent('96GiB')
  expect(await screen.findByText('Example Unified Accelerator')).toBeInTheDocument()
  expect(screen.getByText('통합 메모리 32 GiB')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '최근 7일' }))
  expect(screen.getByRole('region', { name: '플랫폼 이용 현황' })).toBeInTheDocument()
  expect(hardware.getByRole('heading', { name: '총 RAM' }).parentElement).toHaveTextContent('96GiB')
  view.unmount()
  renderApp(`/admin/performance?org=${uuid(1)}`)
  await screen.findByRole('region', { name: '서버 인프라 규모' })
  expect(screen.queryByRole('region', { name: '플랫폼 이용 현황' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '지원 현황' })).not.toBeInTheDocument()
})

test('system managers get hardware without administrator business aggregates', async () => {
  server.use(refreshSuccessHandler('access-sys-manager', sysManagerUser))
  renderApp('/admin/performance')
  await screen.findByRole('region', { name: '서버 인프라 규모' })
  expect(screen.queryByRole('region', { name: '플랫폼 이용 현황' })).not.toBeInTheDocument()
})

test('system viewers do not query the privileged overview projection', async () => {
  const overview = vi.fn()
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser),
    http.get('*/api/v1/admin/performance/overview', () => { overview(); return new HttpResponse(null, { status: 403 }) }))
  renderApp('/admin/performance')
  await screen.findByRole('heading', { name: 'LLM 요청' })
  expect(overview).not.toHaveBeenCalled()
  expect(screen.queryByRole('region', { name: '서버 인프라 규모' })).not.toBeInTheDocument()
})

test('unreported hardware never becomes a zero capacity while token subsets never increase the total', async () => {
  const response = performanceOverviewFixture()
  response.hardware = null
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/performance/overview', () => HttpResponse.json(response)))
  renderApp('/admin/performance')
  await screen.findByText('서버 사양을 아직 확인할 수 없어요')
  expect(screen.queryByRole('region', { name: '서버 인프라 규모' })).not.toBeInTheDocument()
  const result = llmPerformanceFixture()
  const total = result.totals.inputTokens + result.totals.outputTokens
  expect(await metric('사용한 토큰').findByRole('button', { name: `${formatTokenCompact(total)}, 정확값 보기` })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '사용 모델' }).closest('article')).toHaveTextContent(String(result.totals.usedModelCount))
})

test('unreported accelerator memory is omitted rather than displayed as zero', async () => {
  const response = performanceOverviewFixture()
  response.hardware!.assets[0].gpus[0].dedicatedMemoryMiB = null
  response.hardware!.assets[1].gpus[0].unifiedMemoryMiB = null
  response.hardware!.assets[0].gpus[0].sharedMemory = null
  response.hardware!.assets[1].gpus[0].sharedMemory = null
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/performance/overview', () => HttpResponse.json(response)))
  renderApp('/admin/performance')
  await screen.findByRole('heading', { name: 'Example Dedicated GPU' })
  expect(screen.queryByText(/^VRAM /)).not.toBeInTheDocument()
  expect(screen.queryByText(/^통합 메모리 /)).not.toBeInTheDocument()
  expect(screen.queryByText('0 GiB')).not.toBeInTheDocument()
})

test('an authoritative read denial hides previously cached privileged totals', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  render(<MemoryRouter initialEntries={['/admin/performance']}><QueryClientProvider client={client}><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></QueryClientProvider></MemoryRouter>)
  await screen.findByRole('region', { name: '플랫폼 이용 현황' })
  await screen.findByRole('region', { name: '서버 인프라 규모' })
  server.use(http.get('*/api/v1/admin/performance/overview', () => HttpResponse.json({ type: 'about:blank', title: '조회 권한이 없어요.', status: 403, code: 'ACCESS_DENIED' }, { status: 403 })))
  await act(() => client.invalidateQueries({ queryKey: ['admin', 'performance', 'overview'] }))
  await screen.findByText(/플랫폼 현황을 불러오지 못했어요/)
  expect(screen.queryByRole('region', { name: '플랫폼 이용 현황' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '서버 인프라 규모' })).not.toBeInTheDocument()
})

test('foreground polling refreshes all three authorized reads without another navigation', async () => {
  const reads = { overview: 0, llm: 0, vms: 0 }
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/performance/overview', () => { reads.overview++; return HttpResponse.json(performanceOverviewFixture()) }),
    http.get('*/api/v1/admin/llm/usage/performance', () => { reads.llm++; return HttpResponse.json(llmPerformanceFixture()) }),
    http.get('*/api/v1/admin/summary', () => { reads.vms++; return HttpResponse.json({ vmCountsByStatus: { RUNNING: 1 } }) }))
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  const view = renderApp('/admin/performance')
  try {
    await screen.findByRole('region', { name: '서버 인프라 규모' })
    await screen.findByRole('heading', { name: 'LLM 요청' })
    await screen.findByRole('region', { name: '등록 가상머신 현황' })
    expect(reads).toEqual({ overview: 1, llm: 1, vms: 1 })
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    await waitFor(() => expect(reads).toEqual({ overview: 2, llm: 2, vms: 2 }))
  } finally {
    view.unmount()
    vi.useRealTimers()
  }
})
