import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { fetchOpenRouterAccounts } from '../api/queries'
import { useAuth } from '../auth/auth-context'
import { adminLlmKeyStore } from '../test/msw/handlers/llm-keys'
import { adminRequestStore } from '../test/msw/handlers/admin'
import { ToastProvider } from '../components/ui'
import { ACCESS_TOKENS, orgManagerUser, orgViewerUser, refreshSuccessHandler, sysAdminUser, sysViewerUser } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { renderApp } from '../test/render'

test('an actual institution viewer reads account filters without gaining key actions', async () => {
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
  renderApp(`/admin/llm/keys?org=${uuid(1)}`)
  await screen.findByRole('link', { name: 'active-admin-key' })
  expect((await fetchOpenRouterAccounts(uuid(1))).some((account) => account.name === 'AI 교육 사업 A')).toBe(true)
  const filter = screen.getByLabelText('OpenRouter 사업 계정 필터')
  expect(await within(filter).findByRole('option', { name: 'AI 교육 사업 A' })).toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '일괄 변경' })).not.toBeInTheDocument()
})

test('a foreign support filter does not load provider account inventory', async () => {
  let reads = 0
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser),
    http.get('*/api/v1/admin/llm/accounts', () => { reads += 1 }))
  renderApp(`/admin/llm/keys?org=${uuid(2)}`)
  await screen.findByRole('link', { name: 'other-org-key' })
  expect(reads).toBe(0)
  expect(screen.getByRole('checkbox', { name: 'other-org-key 선택' })).toBeInTheDocument()
})

test('a late VM power result never appears on a different target in the same institution', async () => {
  const user = userEvent.setup()
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => { release = resolve })
  let started = false
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.post('*/api/v1/admin/vms/:vmId/start', async () => { started = true; await pending; return HttpResponse.json({ message: '이전 VM의 늦은 시작 접수' }) }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '*', element: <QueryClientProvider client={client}><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></QueryClientProvider> }], { initialEntries: [`/admin/vms/${uuid(57)}?org=${uuid(1)}`] })
  render(<RouterProvider router={router} />)
  const invalidations = vi.spyOn(client, 'invalidateQueries')
  try {
    await user.click(await screen.findByRole('button', { name: '시작' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'VM 시작' })).getByRole('button', { name: '시작' }))
    await waitFor(() => expect(started).toBe(true))
    await act(() => router.navigate(`/admin/vms/${uuid(56)}?org=${uuid(1)}`))
    await screen.findByRole('heading', { name: 'algo-judge' })
    await act(async () => { release(); await pending })
    await waitFor(() => expect(invalidations).toHaveBeenCalledWith({ queryKey: ['admin', 'vms'] }))
    expect(screen.queryByText('이전 VM의 늦은 시작 접수')).not.toBeInTheDocument()
  } finally { release(); invalidations.mockRestore() }
})


test.each([
  ['ORG_VIEWER own institution', 'access-org-viewer', orgViewerUser, 171, 1, true],
  ['ORG_VIEWER foreign global', 'access-org-viewer', orgViewerUser, 175, 2, false],
  ['ORG_MANAGER foreign filter', 'access-org-manager', orgManagerUser, 175, 2, false],
  ['SYS_VIEWER foreign global', 'access-sys-viewer', sysViewerUser, 175, 2, true],
] as const)('account links follow actual read authority in %s', async (_name, token, profile, keyNumber, orgNumber, allowed) => {
  const key = adminLlmKeyStore.find((row) => row.id === uuid(keyNumber))!
  if (keyNumber === 175) { key.openrouterAccountId = uuid(412); key.openrouterAccountName = '테스트 유료 모델 사업' }
  server.use(refreshSuccessHandler(token, profile))
  const filter = token === 'access-org-manager' ? `?org=${uuid(orgNumber)}` : ''
  const detail = renderApp(`/admin/llm/keys/${key.id}${filter}`)
  await screen.findByRole('heading', { name: key.name })
  expect(screen.getByText(key.openrouterAccountName!)).toBeInTheDocument()
  const link = screen.queryByRole('link', { name: key.openrouterAccountName! })
  if (allowed) expect(link).toHaveAttribute('href', `/admin/llm/accounts/${key.openrouterAccountId}?org=${uuid(orgNumber)}`)
  else expect(link).not.toBeInTheDocument()
  detail.unmount()
  renderApp(`/admin/llm/keys${filter}`)
  await screen.findByRole('link', { name: key.name })
  const accountLinks = screen.queryAllByRole('link', { name: key.openrouterAccountName! })
  if (allowed) {
    expect(accountLinks.length).toBeGreaterThan(0)
    expect(accountLinks.every((item) => item.getAttribute('href') === `/admin/llm/accounts/${key.openrouterAccountId}?org=${uuid(orgNumber)}`)).toBe(true)
  } else expect(accountLinks).toHaveLength(0)
})

function RefreshActor() {
  const { refreshProfile, user } = useAuth()
  return <><button onClick={() => void refreshProfile()}>Refresh actor context</button><output data-testid="actor-role-union">{user?.managedOrgs.map((org) => `${org.orgId}:${org.role}`).join(';')}</output></>
}

function renderAdministrativeWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '*', element: <QueryClientProvider client={client}><AuthProvider><ToastProvider><App /><RefreshActor /></ToastProvider></AuthProvider></QueryClientProvider> }], { initialEntries: ['/admin/requests/new?kind=LLM_API_KEY'] })
  render(<RouterProvider router={router} />)
  return { client, router }
}

function assignTwoOperatingInstitutions() {
  const original = ACCESS_TOKENS['access-org-manager']
  ACCESS_TOKENS['access-org-manager'] = { ...original, managedOrgs: [...original.managedOrgs, { orgId: uuid(2), orgName: '테스트 기관', role: 'ORG_MANAGER', requestMail: false }] }
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser))
  return original
}

async function downgradeFirstInstitution() {
  const current = ACCESS_TOKENS['access-org-manager']
  ACCESS_TOKENS['access-org-manager'] = { ...current, managedOrgs: current.managedOrgs.map((org) => org.orgId === uuid(1) ? { ...org, role: 'ORG_VIEWER' } : org) }
  // Browser history and external context updates can occur while a modal is open.
  fireEvent.click(screen.getByRole('button', { name: 'Refresh actor context', hidden: true }))
  await waitFor(() => expect(screen.getByTestId('actor-role-union')).toHaveTextContent(`${uuid(1)}:ORG_VIEWER`))
}

test('a partial institution-role downgrade resets the administrative form while other authority remains', async () => {
  const original = assignTwoOperatingInstitutions()
  const user = userEvent.setup()
  try {
    renderAdministrativeWizard()
    await user.type(await screen.findByLabelText('이름'), '이전 기관의 초안')
    await downgradeFirstInstitution()
    await waitFor(() => expect(screen.getByLabelText('이름')).toHaveValue(''))
    expect(ACCESS_TOKENS['access-org-manager'].role).toBe('ORG_MANAGER')
    expect(ACCESS_TOKENS['access-org-manager'].managedOrgs.some((org) => org.orgId === uuid(2) && org.role === 'ORG_MANAGER')).toBe(true)
  } finally { ACCESS_TOKENS['access-org-manager'] = original }
})

test('a late administrative submission preserves the newer wizard URL and hides the old receipt', async () => {
  const original = assignTwoOperatingInstitutions()
  const user = userEvent.setup()
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => { release = resolve })
  let started = false
  server.use(http.post('*/api/v1/requests', async () => { started = true; await pending; return HttpResponse.json({ ...adminRequestStore.find((row) => row.type === 'LLM_API_KEY'), status: 'APPROVED', displayName: '이전 기관의 승인 결과' }) }))
  const { client, router } = renderAdministrativeWizard()
  const invalidations = vi.spyOn(client, 'invalidateQueries')
  try {
    await user.type(await screen.findByLabelText('이름'), '실습 키')
    await user.click(screen.getByRole('checkbox', { name: /Pickle LLM/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))
    await user.click(await screen.findByRole('radio', { name: '정보컴퓨터공학부 실습지원센터' }))
    await user.click(await screen.findByRole('radio', { name: '캡스톤 3조' }))
    await user.type(screen.getByLabelText('사용 목적'), '실습 수업')
    await user.click(screen.getByRole('radio', { name: /이번 학기/ }))
    await user.click(await within(await screen.findByRole('group', { name: /대상자/ })).findByRole('checkbox', { name: /홍길동/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))
    await user.click(await screen.findByRole('button', { name: '제출하고 승인' }))
    await user.click(within(await screen.findByRole('dialog', { name: '신청 승인' })).getByRole('button', { name: '제출하고 승인' }))
    await waitFor(() => expect(started).toBe(true))
    await downgradeFirstInstitution()
    await act(() => router.navigate('/admin/requests/new?kind=LLM_API_KEY&step=resource'))
    await waitFor(() => expect(new URL(router.state.location.search, 'https://pickle.invalid').searchParams.get('step')).toBe('resource'))
    await act(async () => { release(); await pending })
    await waitFor(() => expect(invalidations).toHaveBeenCalledWith({ queryKey: ['admin', 'requests'] }))
    expect(new URL(router.state.location.search, 'https://pickle.invalid').searchParams.get('step')).toBe('resource')
    expect(screen.queryByText('이전 기관의 승인 결과')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '신청을 승인했습니다' })).not.toBeInTheDocument()
  } finally { release(); invalidations.mockRestore(); ACCESS_TOKENS['access-org-manager'] = original }
})
