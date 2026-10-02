import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'
import { forwardingStore } from '../test/msw/handlers/network'
import { campusIpStore } from '../test/msw/handlers/campusip'
import { adminRequestStore } from '../test/msw/handlers/admin'
import {
  sysAdminUser, sysManagerUser, sysViewerUser, orgAdminUser, orgManagerUser, orgViewerUser,
  refreshSuccessHandler,
} from '../test/msw/handlers/auth'

const sysRoles = [sysAdminUser, sysManagerUser, sysViewerUser]
const orgRoles = [orgAdminUser, orgManagerUser, orgViewerUser]

test.each(sysRoles)('$role reads stored guards; only SYS_ADMIN edits', async (role) => {
  const user = userEvent.setup()
  forwardingStore.find((record) => record.id === uuid(103))!.guards = {
    ctMax: 128, newConnRate: 0, newConnBurst: null, perSourceRate: null, perSourceBurst: null,
  }
  server.use(refreshSuccessHandler(`access-${role.role.toLowerCase().replace('_', '-')}`, role))
  renderApp('/admin/network?tab=forwardings')
  await user.click(await screen.findByRole('button', { name: 'expiring-api' }))
  const drawer = within(await screen.findByRole('dialog', { name: '포트 매핑 상세' }))
  expect(drawer.getByText('128')).toBeInTheDocument()
  expect(drawer.getByText('해제 (0)')).toBeInTheDocument()
  expect(drawer.getAllByText('릴레이 기본값 사용')).toHaveLength(3)
  expect(drawer.queryByLabelText('동시 연결 상한')).not.toBeInTheDocument()
  expect(!!drawer.queryByRole('button', { name: '가드 편집' })).toBe(role.role === 'SYS_ADMIN')
  expect(!!drawer.queryByRole('button', { name: '정지' })).toBe(role.role !== 'SYS_VIEWER')
  expect(drawer.getByText('반영 보고됨')).toBeInTheDocument()
  expect(drawer.getByText(/실제 서비스 접속 성공이나 새로 저장한 연결 가드/)).toBeInTheDocument()
})

test.each(orgRoles)('$role cannot enter the SYS network surface', async (role) => {
  let calls = 0
  server.use(refreshSuccessHandler(`access-${role.role.toLowerCase().replace('_', '-')}`, role),
    http.get('*/api/v1/admin/port-mappings', () => { calls++; return undefined }))
  renderApp('/admin/network?tab=forwardings')
  await screen.findByRole('button', { name: `${role.name} 계정 메뉴` })
  expect(screen.queryByRole('heading', { name: '네트워크', level: 1 })).not.toBeInTheDocument()
  expect(screen.queryByText('저장된 연결 가드')).not.toBeInTheDocument()
  expect(calls).toBe(0)
})

test('guard edits are canceled without saving, and errors stay inside the editor', async () => {
  const user = userEvent.setup()
  let writes = 0
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.patch('*/api/v1/admin/port-mappings/:id/guards', () => {
      writes++
      return HttpResponse.json({ status: 503, code: 'TEST_FAILURE', detail: '합성 저장 실패' }, { status: 503 })
    }))
  renderApp('/admin/network?tab=forwardings')
  await user.click(await screen.findByRole('button', { name: 'expiring-api' }))
  await user.click(screen.getByRole('button', { name: '가드 편집' }))
  let editor = within(await screen.findByRole('dialog', { name: '연결 가드 편집' }))
  expect(editor.queryByText('저장됨')).not.toBeInTheDocument()
  await user.type(editor.getByLabelText('동시 연결 상한'), '256')
  await user.click(editor.getByRole('button', { name: '취소' }))
  expect(writes).toBe(0)
  await user.click(screen.getByRole('button', { name: '가드 편집' }))
  editor = within(await screen.findByRole('dialog', { name: '연결 가드 편집' }))
  expect(editor.getByLabelText('동시 연결 상한')).toHaveValue('')
  await user.type(editor.getByLabelText('동시 연결 상한'), '1000001')
  await user.click(editor.getByRole('button', { name: '가드 저장' }))
  expect(writes).toBe(0)
  expect(editor.getByText(/1000000 이하/)).toBeInTheDocument()
  await user.clear(editor.getByLabelText('동시 연결 상한'))
  await user.type(editor.getByLabelText('동시 연결 상한'), '256')
  await user.click(editor.getByRole('button', { name: '가드 저장' }))
  expect(await editor.findByText('합성 저장 실패')).toBeInTheDocument()
  expect(screen.queryByText(/연결 가드가 저장되었습니다/)).not.toBeInTheDocument()
})

test('mapping deletion acknowledgment is not removal completion', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.delete('*/api/v1/admin/port-mappings/:id', () => HttpResponse.json({ message: '삭제 완료' }, { status: 202 })))
  renderApp('/admin/network?tab=forwardings')
  await user.click(await screen.findByRole('button', { name: 'expiring-api' }))
  await user.click(screen.getByRole('button', { name: '삭제' }))
  await user.click(within(await screen.findByRole('dialog', { name: '포트 매핑 삭제' })).getByRole('button', { name: '삭제' }))
  expect(await screen.findByText('작업 접수')).toBeInTheDocument()
  expect(screen.getByText(/이 응답만으로 실제 연결 정리 완료/)).toBeInTheDocument()
  expect(screen.queryByText('삭제 완료')).not.toBeInTheDocument()
})

test('revoked campus address is historical and its status is a manual record', async () => {
  const user = userEvent.setup()
  campusIpStore[0].status = 'REVOKED'
  campusIpStore[0].grantedAddress = '10.20.30.40'
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser))
  renderApp('/admin/network?tab=campus')
  await user.click(await screen.findByRole('button', { name: 'shop-app' }))
  const drawer = within(await screen.findByRole('dialog', { name: '캠퍼스 IP 신청 상세' }))
  expect(drawer.getByText('이전 할당 주소')).toBeInTheDocument()
  expect(drawer.getByText(/실제 외부 연결 상태를 자동으로 측정한 결과는 아닙니다/)).toBeInTheDocument()
  expect(drawer.queryByRole('button', { name: '회수' })).not.toBeInTheDocument()
})

test('bulk registration links use the actual organization from a global request', async () => {
  const base = adminRequestStore.find((request) => request.id === uuid(202))!
  adminRequestStore.push({ ...base, id: uuid(299), orgId: uuid(2), orgName: '테스트 기관', recipients: [{
    id: uuid(901), userId: uuid(57), name: '합성 대상자', invitee: null, status: 'CREATED',
    resourceId: uuid(8801), reason: null,
  }] })
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(`/admin/requests/${uuid(299)}`)
  const table = await screen.findByRole('table', { name: '대상자' })
  expect(within(table).getByText('리소스 등록됨')).toBeInTheDocument()
  expect(within(table).getByRole('link', { name: '상세 보기' })).toHaveAttribute('href', `/admin/vms/${uuid(8801)}?org=${uuid(2)}`)
  expect(screen.getByText(/VM 프로비저닝 완료를 뜻하지 않습니다/)).toBeInTheDocument()
  expect(screen.getByText(/승인과 부여 내용이 저장되었습니다/)).toBeInTheDocument()
})

test('loading then list failure shows no stale result or edit form', async () => {
  let finish!: () => void
  const gate = new Promise<void>((resolve) => { finish = resolve })
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/port-mappings', async () => {
      await gate
      return HttpResponse.json({ status: 503, code: 'TEST_FAILURE', detail: '합성 목록 실패' }, { status: 503 })
    }))
  renderApp('/admin/network?tab=forwardings')
  await screen.findByLabelText('포트 매핑 목록 불러오는 중')
  expect(screen.queryByText('저장된 연결 가드')).not.toBeInTheDocument()
  finish()
  expect(await screen.findByText('합성 목록 실패')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '가드 편집' })).not.toBeInTheDocument()
})

test('a delayed decision result cannot appear on another cached request', async () => {
  const user = userEvent.setup()
  let started = false
  let finish!: () => void
  const gate = new Promise<void>((resolve) => { finish = resolve })
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.post('*/api/v1/admin/requests/:id/approve', async () => {
      started = true
      await gate
      return HttpResponse.json({})
    }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  client.setQueryData(['admin', 'requests', uuid(203), { orgId: null }], adminRequestStore.find((request) => request.id === uuid(203)))
  const router = createMemoryRouter([{ path: '*', element:
    <QueryClientProvider client={client}><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></QueryClientProvider>,
  }], { initialEntries: [`/admin/requests/${uuid(201)}`] })
  render(<RouterProvider router={router} />)
  await user.click(await screen.findByRole('button', { name: '승인하기' }))
  await user.click(within(await screen.findByRole('dialog', { name: '신청 승인' })).getByRole('button', { name: '승인 확정' }))
  await waitFor(() => expect(started).toBe(true))
  await act(() => router.navigate(`/admin/requests/${uuid(203)}`))
  await screen.findByText('개인 실험용 서버')
  await act(async () => { finish(); await gate })
  await waitFor(() => expect(client.isMutating()).toBe(0))
  expect(screen.queryByText(/승인 내용이 저장되었습니다/)).not.toBeInTheDocument()
  expect(screen.getByText('개인 실험용 서버')).toBeInTheDocument()
})

test('a late guard save cannot report success over another mapping', async () => {
  const user = userEvent.setup()
  let started = false
  let finish!: () => void
  const gate = new Promise<void>((resolve) => { finish = resolve })
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.patch('*/api/v1/admin/port-mappings/:id/guards', async () => {
      started = true
      await gate
      return HttpResponse.json({})
    }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter([{ path: '*', element:
    <QueryClientProvider client={client}><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></QueryClientProvider>,
  }], { initialEntries: ['/admin/network?tab=forwardings'] })
  render(<RouterProvider router={router} />)
  await user.click(await screen.findByRole('button', { name: 'expiring-api' }))
  await user.click(screen.getByRole('button', { name: '가드 편집' }))
  const editor = within(await screen.findByRole('dialog', { name: '연결 가드 편집' }))
  await user.type(editor.getByLabelText('동시 연결 상한'), '128')
  await user.click(editor.getByRole('button', { name: '가드 저장' }))
  await waitFor(() => expect(started).toBe(true))
  await act(() => router.navigate('/admin/requests'))
  await screen.findByRole('heading', { name: '신청 검토', level: 1 })
  await act(() => router.navigate('/admin/network?tab=forwardings'))
  await user.click(await screen.findByRole('button', { name: 'stuck-vm' }))
  const next = within(await screen.findByRole('dialog', { name: '포트 매핑 상세' }))
  await act(async () => { finish(); await gate })
  await waitFor(() => expect(client.isMutating()).toBe(0))
  expect(next.getByText('stuck-vm')).toBeInTheDocument()
  expect(screen.queryByText(/연결 가드가 저장되었습니다/)).not.toBeInTheDocument()
})

test('a dismissed delete request cannot close a newly selected mapping', async () => {
  const user = userEvent.setup()
  let reads = 0
  let started = false
  let finish!: () => void
  const gate = new Promise<void>((resolve) => { finish = resolve })
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/port-mappings', () => { reads++; return undefined }),
    http.delete('*/api/v1/admin/port-mappings/:id', async () => {
      started = true
      await gate
      return HttpResponse.json({ message: '합성 접수' }, { status: 202 })
    }))
  renderApp('/admin/network?tab=forwardings')
  await user.click(await screen.findByRole('button', { name: 'expiring-api' }))
  await user.click(screen.getByRole('button', { name: '삭제' }))
  const confirmation = within(await screen.findByRole('dialog', { name: '포트 매핑 삭제' }))
  await user.click(confirmation.getByRole('button', { name: '삭제' }))
  await waitFor(() => expect(started).toBe(true))
  await user.click(confirmation.getByRole('button', { name: '돌아가기' }))
  await user.click(within(screen.getByRole('dialog', { name: '포트 매핑 상세' })).getByRole('button', { name: '닫기' }))
  await user.click(screen.getByRole('button', { name: 'stuck-vm' }))
  await act(async () => { finish(); await gate })
  await waitFor(() => expect(reads).toBeGreaterThan(1))
  expect(screen.getByRole('dialog', { name: '포트 매핑 상세' })).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByText('작업 접수')).not.toBeInTheDocument())
  expect(within(screen.getByRole('dialog', { name: '포트 매핑 상세' })).getByText('stuck-vm')).toBeInTheDocument()
})
