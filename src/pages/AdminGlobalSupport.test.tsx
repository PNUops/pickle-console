import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { useAuth } from '../auth/auth-context'
import { fetchAdminVm } from '../api/queries'
import { ToastProvider } from '../components/ui'
import { ACCESS_TOKENS, orgManagerUser, orgViewerUser, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { externalDomains } from '../test/msw/handlers/publishing'
import { vmStore } from '../test/msw/handlers/vms'
import { adminUserStore } from '../test/msw/handlers/users'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { renderApp } from '../test/render'

function RefreshProfile() {
  const { refreshProfile } = useAuth()
  return <button onClick={() => void refreshProfile()}>Refresh actor</button>
}

function renderSupport() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<MemoryRouter initialEntries={[`/admin/users/${uuid(42)}?org=${uuid(2)}`]}>
    <QueryClientProvider client={client}><AuthProvider><ToastProvider><App /><RefreshProfile /></ToastProvider></AuthProvider></QueryClientProvider>
  </MemoryRouter>)
}

test('a foreign support filter exposes profiles without institution operations or account enable', async () => {
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
  renderApp(`/admin/users/${uuid(42)}?org=${uuid(2)}`)
  expect(await screen.findByText('202012345')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '정정' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '계정 재활성화' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('관리 기관 선택')).toHaveValue(uuid(2))
})

test('a role downgrade discards a profile editor and an in-flight correction result', async () => {
  const user = userEvent.setup()
  const original = ACCESS_TOKENS['access-org-manager']
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => { release = resolve })
  let submitted = false
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser),
    http.patch('*/api/v1/admin/users/:userId/profile', async () => {
      submitted = true
      await pending
      return HttpResponse.json({ ...adminUserStore.find((row) => row.id === uuid(42)), studentNo: '202054321',
        supportCapabilities: { profileVisible: true, canCorrectProfile: true, canEnableAccount: false } })
    }))
  try {
    renderSupport()
    await user.click(await screen.findByRole('button', { name: '정정' }))
    await user.clear(screen.getByLabelText('학번'))
    await user.type(screen.getByLabelText('학번'), '202054321')
    await user.type(screen.getByLabelText('사유'), '본인 확인')
    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(submitted).toBe(true))
    ACCESS_TOKENS['access-org-manager'] = { ...original, role: 'ORG_VIEWER', managedOrgs: original.managedOrgs.map((org) => ({ ...org, role: 'ORG_VIEWER' })) }
    fireEvent.click(screen.getByRole('button', { name: 'Refresh actor' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '정정' })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: '프로필 정정' })).not.toBeInTheDocument()
    await act(async () => { release(); await pending })
    await screen.findByText('202012345')
    expect(screen.queryByText(/프로필을 정정했습니다/)).not.toBeInTheDocument()
    expect(screen.queryByText('계정 변경 후 연결 결과')).not.toBeInTheDocument()
  } finally {
    ACCESS_TOKENS['access-org-manager'] = original
    release()
  }
})


test('foreign domain metadata does not fetch DNS record content', async () => {
  const domain = externalDomains[0]
  domain.orgId = uuid(2)
  let rawReads = 0
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser),
    http.get('*/api/v1/admin/domains/:domainId/records', () => { rawReads += 1; return HttpResponse.json([]) }))
  renderApp(`/admin/domains?org=${uuid(2)}&domainId=${domain.id}`)
  await screen.findByRole('heading', { name: domain.fqdn })
  expect(await screen.findByText('레코드 원문을 조회할 권한이 없습니다.')).toBeInTheDocument()
  expect(rawReads).toBe(0)
  expect(screen.queryByRole('button', { name: '강제 해제' })).not.toBeInTheDocument()
})

test('foreign VM metadata never loads network policy even when its feature is enabled', async () => {
  vi.stubEnv('VITE_VM_NETWORK_POLICY_ENABLED', '1')
  const vm = vmStore.find((row) => row.id === uuid(64))!
  let rawReads = 0
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser),
    http.get('*/api/v1/admin/vms/:vmId/network-policy', () => { rawReads += 1; return HttpResponse.json({}) }))
  try {
    renderApp(`/admin/vms/${vm.id}?org=${uuid(2)}&tab=network-policy`)
    await screen.findByRole('heading', { name: vm.displayName || vm.name })
    expect(screen.queryByRole('tab', { name: '연결 정책' })).not.toBeInTheDocument()
    expect(rawReads).toBe(0)
    const metadata = await fetchAdminVm(vm.id)
    expect(metadata.publications!.length).toBeGreaterThan(0)
    expect(metadata.publications!.every((publication) => publication.domain?.verification == null)).toBe(true)
    expect(screen.queryByRole('button', { name: '시작' })).not.toBeInTheDocument()
  } finally { vi.unstubAllEnvs() }
})


test('foreign served-domain support reads safe routes while withholding source CIDRs', async () => {
  vi.stubEnv('VITE_PUBLIC_SOURCE_POLICY_ENABLED', '1')
  let policyReads = 0
  let routeReads = 0
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser),
    http.get('*/api/v1/admin/routes', () => { routeReads += 1 }),
    http.get('*/api/v1/admin/routes/:routeId/source-policy', () => { policyReads += 1; return HttpResponse.json({}) }))
  try {
    renderApp(`/admin/domains?org=${uuid(2)}&domainId=${uuid(36)}`)
    await screen.findByRole('heading', { name: 'api.example.org' })
    expect(await screen.findByText('연결 정책 원문을 조회할 권한이 없습니다.')).toBeInTheDocument()
    expect(routeReads).toBeGreaterThan(0)
    expect(policyReads).toBe(0)
    expect(screen.queryByRole('button', { name: '재검증' })).not.toBeInTheDocument()
  } finally { vi.unstubAllEnvs() }
})
