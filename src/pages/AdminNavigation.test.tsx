import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui'
import { server } from '../test/msw/server'
import { renderApp, currentPath } from '../test/render'
import { uuid } from '../test/msw/ids'
import { INVALID_ID_MESSAGE } from '../lib/validation'
import { submittedAdminRequest, adminRequestStore } from '../test/msw/handlers/admin'
import {
  orgAdminUser, orgManagerUser, orgViewerUser, sysAdminUser, sysManagerUser, sysViewerUser, refreshSuccessHandler,
} from '../test/msw/handlers/auth'

function workspaceFixture() {
  const rows = Array.from({ length: 25 }, (_, index) => ({
    id: uuid(700 + index), name: `수업${String(index + 1).padStart(2, '0')}`,
    kind: index % 2 ? 'COURSE' : 'PROJECT', memberCount: index + 1, createdAt: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
  }))
  server.use(
    http.get('*/api/v1/admin/workspaces', () => HttpResponse.json(rows)),
    http.get('*/api/v1/admin/workspaces/:workspaceId', ({ params }) => {
      const row = rows.find((item) => item.id === params.workspaceId)!
      return HttpResponse.json({ ...row, description: '읽기 확인', vmCount: 3, members: [] })
    }),
  )
  return rows
}

function renderHistory(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter([{ path: '*', element: <QueryClientProvider client={client}><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></QueryClientProvider> }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

test('workspace paging, selection, tab and Back/Forward use the same URL state', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  workspaceFixture()
  const router = renderHistory('/admin/workspaces')
  await screen.findByRole('button', { name: '수업01' })
  await user.click(screen.getByRole('button', { name: '2 페이지' }))
  await user.click(await screen.findByRole('button', { name: '수업11' }))
  const drawer = within(screen.getByRole('dialog', { name: '워크스페이스 상세' }))
  await user.click(await drawer.findByRole('tab', { name: '구성원' }))
  expect(router.state.location.search).toContain('page=1')
  expect(router.state.location.search).toContain(`workspaceId=${uuid(710)}`)
  expect(router.state.location.search).toContain('tab=members')
  await act(() => router.navigate(-1))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '수업11' })).toHaveFocus()
  await act(() => router.navigate(1))
  expect(await screen.findByRole('tab', { name: '구성원' })).toHaveAttribute('aria-selected', 'true')
})

test('shared workspace URL restores all conditions and filtering resets page and target', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  workspaceFixture()
  renderApp(`/admin/workspaces?q=수업&kind=PROJECT&sort=members-desc&page=1&workspaceId=${uuid(700)}&tab=members`)
  const drawer = await screen.findByRole('dialog', { name: '워크스페이스 상세' })
  expect(await within(drawer).findByRole('tab', { name: '구성원' })).toHaveAttribute('aria-selected', 'true')
  await user.keyboard('{Escape}')
  expect(screen.getByLabelText('워크스페이스 이름 검색')).toHaveValue('수업')
  expect(screen.getByLabelText('워크스페이스 유형 필터')).toHaveValue('PROJECT')
  expect(screen.getByLabelText('워크스페이스 정렬')).toHaveValue('members-desc')
  expect(await screen.findByRole('button', { name: '수업05' })).toBeInTheDocument()
  await user.type(screen.getByLabelText('워크스페이스 이름 검색'), '없는값')
  await screen.findByText('조회 조건에 맞는 워크스페이스가 없습니다.')
  expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.has('page')).toBe(false)
  expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.has('workspaceId')).toBe(false)
})

test('workspace selection outside its scoped source and malformed IDs do not fetch detail', async () => {
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
  let reads = 0
  server.use(http.get('*/api/v1/admin/workspaces/:workspaceId', () => { reads += 1; return HttpResponse.json({}) }))
  const view = renderApp(`/admin/workspaces?org=${uuid(1)}&workspaceId=${uuid(21)}`)
  await screen.findByText('현재 관리 범위의 목록에 이 워크스페이스가 없습니다.')
  expect(reads).toBe(0)
  view.unmount()
  renderApp('/admin/workspaces?workspaceId=invalid')
  await screen.findByText(INVALID_ID_MESSAGE)
  expect(reads).toBe(0)
})

test.each([
  ['access-org-admin', orgAdminUser], ['access-org-manager', orgManagerUser], ['access-org-viewer', orgViewerUser],
  ['access-sys-admin', sysAdminUser], ['access-sys-manager', sysManagerUser], ['access-sys-viewer', sysViewerUser],
] as const)('workspace inspection remains read-only for %s', async (token, profile) => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler(token, profile))
  renderApp('/admin/workspaces')
  await user.click(await screen.findByRole('button', { name: '캡스톤 3조' }))
  const drawer = await screen.findByRole('dialog', { name: '워크스페이스 상세' })
  await within(drawer).findByText('조회 전용')
  expect(within(drawer).queryByRole('button', { name: /수정|저장|삭제|구성원 추가/ })).not.toBeInTheDocument()
})

test('request filters and server page restore through detail and explicit return to a SYS global list', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser))
  for (let n = 600; n < 623; n += 1) adminRequestStore.push(submittedAdminRequest(n))
  renderApp('/admin/requests?status=all&type=VM&page=1')
  const table = await screen.findByRole('table', { name: '관리자 신청 목록' })
  const link = within(table).getAllByRole('link')[0]
  expect(link.getAttribute('href')).toContain(`org=${uuid(1)}`)
  await user.click(link)
  await screen.findByRole('heading', { name: '신청 상세' })
  expect(screen.queryByRole('button', { name: '승인하기' })).not.toBeInTheDocument()
  const back = screen.getByRole('link', { name: '← 신청 목록' })
  expect(back).toHaveAttribute('href', '/admin/requests?status=all&type=VM&page=1')
  await user.click(back)
  await screen.findByRole('table', { name: '관리자 신청 목록' })
  expect(screen.getByRole('button', { name: '전체', pressed: true })).toBeInTheDocument()
  expect(screen.getByLabelText('리소스 종류 필터')).toHaveValue('VM')
  expect(screen.getByRole('button', { name: '2 페이지' })).toHaveAttribute('aria-current', 'page')
  await user.selectOptions(screen.getByLabelText('리소스 종류 필터'), 'DOMAIN')
  await waitFor(() => expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.has('page')).toBe(false))
})

test('rapid search and sort updates preserve both URL values', async () => {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  workspaceFixture()
  renderApp('/admin/workspaces')
  await screen.findByRole('button', { name: '수업01' })
  const search = screen.getByLabelText('워크스페이스 이름 검색')
  const sort = screen.getByLabelText('워크스페이스 정렬')
  act(() => {
    fireEvent.change(search, { target: { value: '수업2' } })
    fireEvent.change(sort, { target: { value: 'members-desc' } })
  })
  await waitFor(() => expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('q')).toBe('수업2'))
  expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('sort')).toBe('members-desc')
  expect(screen.queryByRole('button', { name: '수업01' })).not.toBeInTheDocument()
})

test('upper-case institution and workspace UUIDs retain the requested target and scope', async () => {
  const id = 'deadbeef-0000-4000-8000-000000000001'
  const org = 'deadbeef-0000-4000-8000-000000000002'
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser))
  const rows = workspaceFixture()
  rows[0].id = id
  server.use(http.get('*/api/v1/orgs', () => HttpResponse.json([{ id: org, name: '시험 기관' }])))
  renderApp(`/admin/workspaces?org=${org.toUpperCase()}&workspaceId=${id.toUpperCase()}`)
  const drawer = await screen.findByRole('dialog', { name: '워크스페이스 상세' })
  await within(drawer).findByRole('heading', { name: '수업01' })
  expect(screen.getByLabelText('관리 기관 선택')).toHaveValue(org)
  await waitFor(() => expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('workspaceId')).toBe(id))
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.getByRole('button', { name: '수업01' })).toHaveFocus())
})

test('institution transition drops page, selected target and prior return context', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  workspaceFixture()
  renderApp(`/admin/workspaces?page=1&workspaceId=${uuid(710)}&returnTo=ignored`)
  await screen.findByRole('dialog', { name: '워크스페이스 상세' })
  await user.keyboard('{Escape}')
  await user.selectOptions(screen.getByLabelText('관리 기관 선택'), uuid(2))
  await waitFor(() => expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('org')).toBe(uuid(2)))
  expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.has('page')).toBe(false)
  expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.has('workspaceId')).toBe(false)
  expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.has('returnTo')).toBe(false)
})
