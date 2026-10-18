import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AuthContext, type AuthContextValue, type UserProfile } from '../auth/auth-context'
import type { InstitutionAuthority, InstitutionGrant, WorkGroup, WorkspaceScope } from '../auth/institution-authority'
import { AdminScopeContext, type AdminScopeValue } from '../lib/admin-scope-context'
import { ToastProvider } from '../components/ui'
import { VmDomainsSection } from '../components/vm-domains/VmDomainsSection'
import type { AdminDomainView, AdminDomainRootView, AdminRouteView, VmDetail } from '../api/queries'
import { setAccessToken } from '../api/token'
import { MOCK_WORK_CATALOGUE } from '../test/msw/institution-authority'
import { ACCESS_TOKENS, orgAdminProfile, sysAdminProfile, sysManagerProfile } from '../test/msw/handlers/auth'
import { gpuAllocationFixture, gpuActions } from '../test/msw/handlers/gpu'
import { vmStore } from '../test/msw/handlers/vms'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { AdminDomainsPage } from './AdminDomainsPage'
import { AdminGpuDetailPage } from './AdminGpuDetailPage'
import { AdminGpusPage } from './AdminGpusPage'
import { AdminExpiryPage } from './AdminExpiryPage'
import { AdminTerminalSessionsPage } from './AdminTerminalSessionsPage'

const ORG = uuid(1), OTHER_ORG = uuid(2), WS = uuid(12), OTHER_WS = uuid(14)
const FIXTURE_TOKEN = 'access-institution-resource-interface'
afterEach(() => { delete ACCESS_TOKENS[FIXTURE_TOKEN]; vi.unstubAllEnvs() })

function selected(work: string[], scopes?: Partial<Record<WorkGroup, WorkspaceScope>>, orgId = ORG): UserProfile {
  const write = work.some((id) => MOCK_WORK_CATALOGUE.find((entry) => entry.id === id)?.write)
  const groups = MOCK_WORK_CATALOGUE.filter((entry) => work.includes(entry.id)).flatMap((entry) => entry.group ? [entry.group] : [])
  const assignedScopes = scopes ?? Object.fromEntries(groups.map((group) => [group, { mode: 'ALL', workspaceIds: [] }]))
  const role = write ? 'ORG_MANAGER' : 'ORG_VIEWER'
  const assignment: InstitutionGrant = { institutionId: orgId, institutionName: '명시 기관', permission: { mode: 'SELECTED', work, scopes: assignedScopes, revision: 7 } }
  const authority: InstitutionAuthority = { state: 'VALID_SOURCES', failure: null, accountRole: role,
    catalogueRevision: '4', authorityFingerprint: JSON.stringify(assignment), catalogue: MOCK_WORK_CATALOGUE, assignments: [assignment] }
  return { ...orgAdminProfile, role, institutionAuthority: authority }
}

function page(content: unknown[], pageIndex = 0, totalPages = content.length ? 1 : 0) {
  return { content, page: pageIndex, size: 20, totalElements: content.length, totalPages }
}

function domain(patch: Partial<AdminDomainView> = {}): AdminDomainView {
  return { id: uuid(9101), kind: 'EXTERNAL', fqdn: 'command.example.test', status: 'ACTIVE',
    workspaceId: WS, workspaceName: '대상 공간', orgId: ORG, orgName: '실제 기관', metadataVisible: false,
    allowedWorkIds: ['domain.renewal'], renewDueAt: '2027-03-11T00:00:00Z', ...patch }
}

function domainHandlers(row: AdminDomainView) {
  server.use(http.get('*/api/v1/admin/domains', () => HttpResponse.json(page([row]))),
    http.get('*/api/v1/admin/domains/:domainId', () => HttpResponse.json(row)))
}

function renderPage(actor: UserProfile, route: string, options: { vm?: VmDetail; surface?: 'admin' | 'personal' } = {}) {
  ACCESS_TOKENS[FIXTURE_TOKEN] = actor
  setAccessToken(FIXTURE_TOKEN)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const scope: AdminScopeValue = { tier: actor.role.startsWith('SYS_') ? 'system' : 'org', globalSupport: false,
    activeOrgId: ORG, activeOrg: { id: ORG, name: '조회 기관' }, activeOrgRole: actor.role,
    options: [], requiresSelection: false, resolving: false, catalogPending: false, error: false, ready: true,
    retry: vi.fn(), setActiveOrgId: vi.fn(), path: (path) => path }
  const tree = (profile: UserProfile) => {
    const auth: AuthContextValue = { status: 'authenticated', user: profile, login: vi.fn(), completeMfa: vi.fn(), refreshProfile: vi.fn(),
      beginCredentialExchange: vi.fn(), logout: vi.fn() }
    return <MemoryRouter initialEntries={[route]}><QueryClientProvider client={client}><AuthContext.Provider value={auth}>
      <AdminScopeContext.Provider value={scope}><ToastProvider><Routes>
        <Route path="/admin/domains" element={<AdminDomainsPage />} />
        <Route path="/admin/gpus" element={<AdminGpusPage />} />
        <Route path="/admin/gpus/:allocationId" element={<AdminGpuDetailPage />} />
        <Route path="/admin/expiry" element={<AdminExpiryPage />} />
        <Route path="/admin/terminal-sessions" element={<AdminTerminalSessionsPage />} />
        <Route path="/fixture/domains" element={options.vm ? <VmDomainsSection vm={options.vm} surface={options.surface} /> : null} />
      </Routes></ToastProvider></AdminScopeContext.Provider>
    </AuthContext.Provider></QueryClientProvider></MemoryRouter>
  }
  const result = render(tree(actor))
  return { ...result, client, rerenderActor: (profile: UserProfile) => { ACCESS_TOKENS[FIXTURE_TOKEN] = profile; result.rerender(tree(profile)) } }
}

describe('institution resource authority projections', () => {
  test('a coarse institution role without context cannot fetch domain metadata', async () => {
    let requests = 0
    server.use(http.get('*/api/v1/admin/domains', () => { requests++; return HttpResponse.json(page([])) }))
    renderPage({ ...orgAdminProfile, institutionAuthority: undefined }, '/admin/domains')
    expect(await screen.findByText('공개 서비스를 조회할 권한이 없습니다.')).toBeInTheDocument()
    expect(requests).toBe(0)
  })

  test('invalid authority and an empty listed scope never admit a GPU query', async () => {
    let requests = 0
    server.use(http.get('*/api/v1/admin/gpu-allocations', () => { requests++; return HttpResponse.json(page([])) }))
    const actor = selected(['gpu.observe'], { GPU: { mode: 'LISTED', workspaceIds: [] } })
    const view = renderPage(actor, '/admin/gpus')
    expect(await screen.findByText('GPU 할당을 조회할 권한이 없습니다.')).toBeInTheDocument()
    view.rerenderActor({ ...actor, institutionAuthority: { ...actor.institutionAuthority!, state: 'INVALID', failure: 'CORRUPT_PAYLOAD' } })
    expect(screen.getByText('GPU 할당을 조회할 권한이 없습니다.')).toBeInTheDocument()
    expect(requests).toBe(0)
  })

  test('renewal-only command works without metadata or raw DNS admission', async () => {
    const row = domain()
    domainHandlers(row)
    let records = 0, routes = 0
    server.use(http.get('*/api/v1/admin/domains/:domainId/records', () => { records++; return HttpResponse.json([]) }),
      http.get('*/api/v1/admin/routes', () => { routes++; return HttpResponse.json(page([])) }))
    const sent: unknown[] = []
    server.use(http.patch('*/api/v1/admin/domains/:domainId/renewal', async ({ request }) => {
      expect(request.headers.get('Authorization')).toBe(`Bearer ${FIXTURE_TOKEN}`)
      expect(ACCESS_TOKENS[FIXTURE_TOKEN].id).toBe(orgAdminProfile.id)
      sent.push(await request.json()); return HttpResponse.json(row)
    }))
    renderPage(selected(['domain.renewal']), `/admin/domains?domainId=${row.id}`)
    const drawer = await screen.findByRole('dialog', { name: '도메인 상세' })
    await within(drawer).findByRole('button', { name: '기한 조정' })
    expect(within(drawer).queryByRole('button', { name: '강제 해제' })).not.toBeInTheDocument()
    expect(within(drawer).getByText('레코드 원문을 조회할 권한이 없습니다.')).toBeInTheDocument()
    await userEvent.click(within(drawer).getByRole('button', { name: '기한 조정' }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toEqual({ renewDueAt: '2027-03-11T14:59:59.000Z' })
    expect(records).toBe(0)
    expect(routes).toBe(0)
  })

  test('server allowed works cannot borrow a different workspace from the same role', async () => {
    const row = domain({ workspaceId: OTHER_WS })
    domainHandlers(row)
    renderPage(selected(['domain.renewal'], { DOMAIN: { mode: 'LISTED', workspaceIds: [WS] } }), `/admin/domains?domainId=${row.id}`)
    const drawer = await screen.findByRole('dialog', { name: '도메인 상세' })
    await within(drawer).findByText(row.fqdn)
    expect(within(drawer).queryByRole('button', { name: '기한 조정' })).not.toBeInTheDocument()
  })

  test('a server row denial closes an otherwise matching command', async () => {
    const row = domain({ allowedWorkIds: [] })
    domainHandlers(row)
    renderPage(selected(['domain.renewal']), `/admin/domains?domainId=${row.id}`)
    const drawer = await screen.findByRole('dialog', { name: '도메인 상세' })
    await within(drawer).findByText(row.fqdn)
    expect(within(drawer).queryByRole('button', { name: '기한 조정' })).not.toBeInTheDocument()
  })

  test('external metadata support does not expose raw records or grant VM publication commands', async () => {
    const row = domain({ orgId: OTHER_ORG, metadataVisible: true, allowedWorkIds: ['domain.metadata.support.read'] })
    domainHandlers(row)
    let records = 0
    server.use(http.get('*/api/v1/admin/domains/:domainId/records', () => { records++; return HttpResponse.json([]) }))
    renderPage(selected(['domain.metadata.support.read']), `/admin/domains?domainId=${row.id}`)
    const drawer = await screen.findByRole('dialog', { name: '도메인 상세' })
    await within(drawer).findByText(row.fqdn)
    expect(within(drawer).getByText('실제 기관')).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: '강제 해제' })).not.toBeInTheDocument()
    expect(records).toBe(0)
  })

  test('custom verification-only rows keep verification without metadata or route operations', async () => {
    const row = domain({ kind: 'CUSTOM', allowedWorkIds: ['vm.custom-domain.verify'], renewDueAt: null })
    domainHandlers(row)
    renderPage(selected(['vm.custom-domain.verify']), `/admin/domains?domainId=${row.id}`)
    const drawer = await screen.findByRole('dialog', { name: '도메인 상세' })
    expect(await within(drawer).findByRole('button', { name: '재검증' })).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: '강제 해제' })).not.toBeInTheDocument()
    expect(within(drawer).getByText('라우트를 조회할 권한이 없습니다.')).toBeInTheDocument()
  })

  test('route resolution uses actual domain authority without assuming its institution is the VM filter', async () => {
    const row = domain({ kind: 'PLATFORM', orgId: OTHER_ORG, allowedWorkIds: ['vm.publication.operate'], routeStatus: 'FAILED' })
    domainHandlers(row)
    const requested: URL[] = []
    const route: AdminRouteView = { id: uuid(5101), domainId: row.id, fqdn: row.fqdn, domainKind: row.kind,
      vmId: uuid(101), vmName: '연결 VM', workspaceId: WS, workspaceName: '대상 공간', orgId: OTHER_ORG, orgName: '실제 기관',
      status: 'FAILED', metadataVisible: false, allowedWorkIds: ['vm.publication.operate'] }
    server.use(http.get('*/api/v1/admin/routes', ({ request }) => {
      const url = new URL(request.url); requested.push(url)
      return HttpResponse.json(url.searchParams.get('page') === '0' ? page([], 0, 2) : page([route], 1, 2))
    }))
    renderPage(selected(['vm.publication.operate'], undefined, OTHER_ORG), `/admin/domains?domainId=${row.id}`)
    const drawer = await screen.findByRole('dialog', { name: '도메인 상세' })
    expect(await within(drawer).findByRole('button', { name: '재적용' })).toBeInTheDocument()
    expect(requested).toHaveLength(2)
    expect(requested.every((url) => !url.searchParams.has('orgId'))).toBe(true)
    expect(within(drawer).queryByText('미적용')).not.toBeInTheDocument()
    expect(within(drawer).queryByText('연결 정책 원문을 조회할 권한이 없습니다.')).not.toBeInTheDocument()
  })

  test('publication operation obtains its exact current policy reference and saves without a metadata grant', async () => {
    vi.stubEnv('VITE_PUBLIC_SOURCE_POLICY_ENABLED', '1')
    const row = domain({ kind: 'PLATFORM', allowedWorkIds: ['vm.publication.operate'], routeStatus: 'APPLIED' })
    domainHandlers(row)
    const route: AdminRouteView = { id: uuid(5101), domainId: row.id, fqdn: row.fqdn, domainKind: row.kind,
      vmId: uuid(101), vmName: '연결 VM', workspaceId: WS, workspaceName: '대상 공간', orgId: ORG, orgName: '실제 기관',
      status: 'APPLIED', metadataVisible: false, allowedWorkIds: ['vm.publication.operate'] }
    const policy = { allowedCidrs: ['192.0.2.0/24'], revision: 8, explicit: true, applyState: 'APPLIED' }
    const sent: unknown[] = []
    server.use(http.get('*/api/v1/admin/routes', () => HttpResponse.json(page([route]))),
      http.get('*/api/v1/admin/routes/:routeId/source-policy', () => HttpResponse.json(policy)),
      http.get('*/api/v1/source-policy-presets/campus', () => HttpResponse.json({ target: 'DOMAIN', key: 'campus', allowedCidrs: [] })),
      http.put('*/api/v1/admin/routes/:routeId/source-policy', async ({ request }) => {
        const body = await request.json(); sent.push(body); return HttpResponse.json({ ...policy, revision: 9, allowedCidrs: ['198.51.100.0/24'] })
      }))
    renderPage(selected(['vm.publication.operate']), `/admin/domains?domainId=${row.id}`)
    const drawer = await screen.findByRole('dialog', { name: '도메인 상세' })
    await within(drawer).findByRole('button', { name: '재적용' })
    await waitFor(() => expect(within(drawer).queryByRole('region', { name: '출발지 정책' })).toBeInTheDocument(), { timeout: 1500 })
    const field = await within(drawer).findByRole('textbox', { name: '허용할 출발지' })
    await userEvent.clear(field)
    await userEvent.type(field, '198.51.100.0/24')
    await userEvent.click(within(drawer).getByRole('button', { name: '출발지 정책 저장' }))
    await waitFor(() => expect(sent).toEqual([{ expectedRevision: 8, allowedCidrs: ['198.51.100.0/24'] }]))
  })

  test('global VM metadata support does not read an unrelated raw route policy', async () => {
    vi.stubEnv('VITE_PUBLIC_SOURCE_POLICY_ENABLED', '1')
    const row = domain({ kind: 'PLATFORM', orgId: OTHER_ORG, metadataVisible: true,
      allowedWorkIds: ['vm.metadata.support.read'], routeStatus: 'APPLIED' })
    domainHandlers(row)
    const route: AdminRouteView = { id: uuid(5101), domainId: row.id, fqdn: row.fqdn, domainKind: row.kind,
      vmId: uuid(101), vmName: '연결 VM', workspaceId: WS, workspaceName: '대상 공간', orgId: OTHER_ORG, orgName: '실제 기관',
      status: 'APPLIED', metadataVisible: true, allowedWorkIds: ['vm.metadata.support.read'] }
    let rawReads = 0
    server.use(http.get('*/api/v1/admin/routes', () => HttpResponse.json(page([route]))),
      http.get('*/api/v1/admin/routes/:routeId/source-policy', () => { rawReads++; return HttpResponse.json({ allowedCidrs: ['192.0.2.0/24'], revision: 8, explicit: true, applyState: 'APPLIED' }) }))
    renderPage(selected(['vm.metadata.support.read']), `/admin/domains?domainId=${row.id}`)
    const drawer = await screen.findByRole('dialog', { name: '도메인 상세' })
    expect(await within(drawer).findByText('연결 정책 원문을 조회할 권한이 없습니다.')).toBeInTheDocument()
    expect(rawReads).toBe(0)
  })

  test('global root catalogue read cannot toggle a foreign institution policy or invent zero counts', async () => {
    const root: AdminDomainRootView = { rootDomain: 'catalogue.example.test', orgId: OTHER_ORG, orgName: '다른 기관',
      autoApprove: true, issuedNames: null, metadataVisible: false, allowedWorkIds: ['root-domain.catalogue.read'] }
    server.use(http.get('*/api/v1/admin/domain-roots', () => HttpResponse.json([root])))
    renderPage(selected(['root-domain.catalogue.read']), '/admin/domains?tab=roots')
    expect(await screen.findByText(root.rootDomain)).toBeInTheDocument()
    expect(screen.getByText('조회 권한 없음')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '승인 필요로' })).not.toBeInTheDocument()
    expect(screen.queryByText('0개')).not.toBeInTheDocument()
  })

  test('shared certificate-only readers issue no domain query and see no unrelated control tabs', async () => {
    let domains = 0
    server.use(http.get('*/api/v1/admin/domains', () => { domains++; return HttpResponse.json(page([])) }),
      http.get('*/api/v1/admin/certificates', () => HttpResponse.json(page([{ id: uuid(8), kind: 'ORIGIN_CA_WILDCARD', status: 'ACTIVE', scope: '*.example.test', domainId: null }]))))
    renderPage(selected(['shared-certificate.read']), '/admin/domains')
    expect(await screen.findByText('*.example.test')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '도메인' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '루트 도메인' })).not.toBeInTheDocument()
    expect(domains).toBe(0)
  })

  test('keyboard tab navigation stays within the explicitly admitted read surfaces', async () => {
    server.use(http.get('*/api/v1/admin/certificates', () => HttpResponse.json(page([]))),
      http.get('*/api/v1/admin/domain-roots', () => HttpResponse.json([])))
    renderPage(selected(['shared-certificate.read', 'root-domain.catalogue.read']), '/admin/domains')
    const certificates = await screen.findByRole('tab', { name: '인증서' })
    const user = userEvent.setup()
    await user.click(certificates)
    await user.keyboard('{End}')
    await waitFor(() => expect(screen.getByRole('tab', { name: '루트 도메인' })).toHaveFocus())
    expect(screen.queryByRole('tab', { name: '도메인' })).not.toBeInTheDocument()
    expect(await screen.findByText('등록된 루트 도메인이 없습니다. 루트는 등록 절차가 넣습니다.')).toBeInTheDocument()
  })

  test('period-only GPU commands remain usable when connection metadata is hidden', async () => {
    const row = gpuAllocationFixture({ metadataVisible: false, allowedWorkIds: ['gpu.period'], connectionStatus: null,
      gpu: null, ownerNames: null, error: 'unavailable-gpu-diagnostic', grantedLeaseHours: 48, leaseEndsAt: '2027-01-01T00:00:00Z' })
    server.use(http.get('*/api/v1/admin/gpu-allocations/:allocationId', () => HttpResponse.json(row)))
    renderPage(selected(['gpu.period']), `/admin/gpus/${row.id}`)
    const extend = await screen.findByRole('button', { name: '임대 연장' })
    expect(screen.queryByRole('button', { name: '회수' })).not.toBeInTheDocument()
    expect(screen.queryByText('미할당')).not.toBeInTheDocument()
    expect(screen.queryByText('unavailable-gpu-diagnostic')).not.toBeInTheDocument()
    await userEvent.click(extend)
    expect(await screen.findByRole('dialog', { name: 'GPU 임대 연장' })).toBeInTheDocument()
  })

  test('GPU observation-only admission hides the queue filter and unrelated metadata', async () => {
    const row = gpuAllocationFixture({ metadataVisible: false, allowedWorkIds: ['gpu.observe'], connectionStatus: 'ATTACHED', gpu: null,
      vmId: null, vmName: null, queuePosition: null, utilizationPercent: 0, sampleObservedAt: new Date().toISOString() })
    server.use(http.get('*/api/v1/admin/gpu-allocations', () => HttpResponse.json(page([row]))))
    renderPage(selected(['gpu.observe']), '/admin/gpus')
    const allocationLink = await screen.findByRole('link', { name: row.name })
    const cells = within(allocationLink.closest('tr')!).getAllByRole('cell')
    expect(cells[5]).toHaveTextContent('조회 권한 없음')
    expect(screen.queryByRole('combobox', { name: 'GPU 할당 필터' })).not.toBeInTheDocument()
    expect(screen.queryByText('미할당')).not.toBeInTheDocument()
    expect(screen.queryByText('GPU 인벤토리')).not.toBeInTheDocument()
  })

  test('an authorized measured GPU zero is displayed distinctly from unavailable metadata', async () => {
    const row = gpuAllocationFixture({ metadataVisible: false, allowedWorkIds: ['gpu.observe'], connectionStatus: 'ATTACHED',
      gpu: null, queuePosition: null, utilizationPercent: 0, sampleObservedAt: new Date().toISOString() })
    server.use(http.get('*/api/v1/admin/gpu-allocations/:allocationId', () => HttpResponse.json(row)))
    renderPage(selected(['gpu.observe']), `/admin/gpus/${row.id}`)
    const label = await screen.findByText('GPU 이용률')
    expect(label.nextElementSibling).toHaveTextContent('0%')
    expect(screen.getByText('GPU', { selector: 'dt' }).nextElementSibling).toHaveTextContent('조회 권한 없음')
    expect(screen.queryByText('미할당')).not.toBeInTheDocument()
  })

  test('metadata-only GPU access does not display an ungranted observation field', async () => {
    const row = gpuAllocationFixture({ allowedWorkIds: ['gpu.metadata.read'], utilizationPercent: 57, sampleObservedAt: new Date().toISOString() })
    server.use(http.get('*/api/v1/admin/gpu-allocations/:allocationId', () => HttpResponse.json(row)))
    renderPage(selected(['gpu.metadata.read']), `/admin/gpus/${row.id}`)
    const label = await screen.findByText('GPU 이용률')
    expect(label.nextElementSibling).toHaveTextContent('조회 권한 없음')
    expect(screen.queryByText('57%')).not.toBeInTheDocument()
  })

  test('GPU source scope and the server row mask must both allow the action', async () => {
    const row = gpuAllocationFixture({ workspaceId: OTHER_WS, allowedWorkIds: ['gpu.period'] })
    server.use(http.get('*/api/v1/admin/gpu-allocations/:allocationId', () => HttpResponse.json(row)))
    renderPage(selected(['gpu.period'], { GPU: { mode: 'LISTED', workspaceIds: [WS] } }), `/admin/gpus/${row.id}`)
    await screen.findByRole('heading', { name: row.name })
    expect(screen.queryByRole('button', { name: '임대 연장' })).not.toBeInTheDocument()
  })

  test('same-role source revocation closes an open GPU command and clears prior projection', async () => {
    const row = gpuAllocationFixture({ allowedWorkIds: ['gpu.period'] })
    server.use(http.get('*/api/v1/admin/gpu-allocations/:allocationId', () => HttpResponse.json(row)))
    const view = renderPage(selected(['gpu.period']), `/admin/gpus/${row.id}`)
    await userEvent.click(await screen.findByRole('button', { name: '임대 연장' }))
    await screen.findByRole('dialog', { name: 'GPU 임대 연장' })
    const next = selected(['institution.request-mail.configure'])
    expect(next.role).toBe('ORG_MANAGER')
    view.rerenderActor(next)
    expect(await screen.findByText('GPU 할당을 조회할 권한이 없습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(gpuActions).toHaveLength(0)
  })

  test('a changed server row mask closes an open command even without an authority fingerprint change', async () => {
    let row = gpuAllocationFixture({ allowedWorkIds: ['gpu.period', 'gpu.metadata.support.read'] })
    server.use(http.get('*/api/v1/admin/gpu-allocations/:allocationId', () => HttpResponse.json(row)))
    const view = renderPage(selected(['gpu.period', 'gpu.metadata.support.read']), `/admin/gpus/${row.id}`)
    await userEvent.click(await screen.findByRole('button', { name: '임대 연장' }))
    await screen.findByRole('dialog', { name: 'GPU 임대 연장' })
    row = { ...row, allowedWorkIds: ['gpu.metadata.support.read'] }
    await view.client.invalidateQueries({ queryKey: ['admin', 'gpu-allocations'] })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '임대 연장' })).not.toBeInTheDocument()
    expect(gpuActions).toHaveLength(0)
  })

  test('terminal metadata grants never add the system-only force termination command', async () => {
    renderPage(selected(['vm.terminal-session.read']), '/admin/terminal-sessions')
    expect(await screen.findByText('algo-judge')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강제 종료' })).not.toBeInTheDocument()
  })

  test.each([sysManagerProfile, sysAdminProfile])('preserves explicit SYS terminal subsets for $role', async (actor) => {
    renderPage(actor, '/admin/terminal-sessions')
    await screen.findByText('algo-judge')
    expect(screen.queryAllByRole('button', { name: '강제 종료' }).length > 0).toBe(actor.role === 'SYS_ADMIN')
  })

  test('expiry direct URLs cannot issue another kind metadata query using a coarse role', async () => {
    let requests = 0
    server.use(http.get('*/api/v1/admin/resource-deadlines', () => { requests++; return HttpResponse.json(page([])) }))
    renderPage(selected(['vm.metadata.read']), '/admin/expiry?type=GPU')
    expect(await screen.findByText('선택한 종류의 자원 기한을 조회할 권한이 없습니다.')).toBeInTheDocument()
    expect(requests).toBe(0)
  })

  test('a staff account with personal VM editing standing continues using personal domain APIs', async () => {
    let personal = 0, admin = 0
    server.use(http.get('*/api/v1/domains', () => { personal++; return HttpResponse.json(page([])) }),
      http.get('*/api/v1/admin/domains', () => { admin++; return HttpResponse.json(page([])) }))
    renderPage({ ...orgAdminProfile, institutionAuthority: undefined }, '/fixture/domains', { vm: { ...vmStore[0], publications: [], settingsEditAllowed: true } })
    expect(await screen.findByRole('button', { name: '＋ 플랫폼 서브도메인 추가' })).toBeInTheDocument()
    expect(personal).toBe(1)
    expect(admin).toBe(0)
  })

  test('an explicit admin domain surface never falls back to personal APIs or owner controls', async () => {
    let personal = 0
    server.use(http.get('*/api/v1/domains', () => { personal++; return HttpResponse.json(page([])) }))
    renderPage(selected(['vm.publication.operate']), '/fixture/domains', { vm: { ...vmStore[0], publications: null, settingsEditAllowed: true }, surface: 'admin' })
    expect(await screen.findByRole('link', { name: '공개 서비스에서 확인' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '＋ 플랫폼 서브도메인 추가' })).not.toBeInTheDocument()
    expect(personal).toBe(0)
  })

  test('hidden personal publications are not converted to an empty list', async () => {
    renderPage({ ...orgAdminProfile, institutionAuthority: undefined }, '/fixture/domains', { vm: { ...vmStore[0], publications: null } })
    expect(await screen.findByText('게시 세부 정보가 제공되지 않았습니다. 개인 접근 권한을 확인해 주세요.')).toBeInTheDocument()
    expect(screen.queryByText('아직 연결된 도메인이 없습니다')).not.toBeInTheDocument()
  })
})
