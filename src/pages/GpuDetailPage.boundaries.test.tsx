import { act, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ReauthProvider } from '../auth/ReauthProvider'
import { ToastProvider } from '../components/ui'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { gpuAllocationFixture, gpuAllocationStore } from '../test/msw/handlers/gpu'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'

beforeEach(() => vi.stubEnv('VITE_GPU_PREVIEW', '1'))
afterEach(() => vi.unstubAllEnvs())

function renderRoute(route: string, admin = false) {
  server.use(admin ? refreshSuccessHandler('access-sys-admin', sysAdminUser) : refreshSuccessHandler('access-user'))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter([{ path: '*', element: <QueryClientProvider client={client}><AuthProvider><ToastProvider><ReauthProvider><App /></ReauthProvider></ToastProvider></AuthProvider></QueryClientProvider> }], { initialEntries: [route] })
  render(<RouterProvider router={router} />)
  return { router, client }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

test('a late user mutation cannot close another allocation modal or publish its old notice', async () => {
  const user = userEvent.setup()
  const first = gpuAllocationFixture({ name: '첫 GPU' })
  const second = gpuAllocationFixture({ id: uuid(903), name: '둘째 GPU' })
  gpuAllocationStore.push(first, second)
  const started = deferred(), response = deferred()
  server.use(http.post(`*/api/v1/gpu-allocations/${first.id}/extend`, async () => { started.resolve(); await response.promise; return HttpResponse.json(first) }))
  const { router, client } = renderRoute(`/console/gpus/${first.id}`)
  await user.click(await screen.findByRole('button', { name: '임대 연장' }))
  const oldModal = await screen.findByRole('dialog', { name: 'GPU 임대 연장' })
  await user.type(within(oldModal).getByLabelText('추가 임대 기간'), '1')
  await user.click(within(oldModal).getByRole('button', { name: 'GPU 임대 연장' }))
  await started.promise
  await act(() => router.navigate(`/console/gpus/${second.id}`))
  await screen.findByRole('heading', { name: '둘째 GPU' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'GPU 반납' }))
  await screen.findByRole('dialog', { name: 'GPU 반납' })
  response.resolve()
  await waitFor(() => expect(client.isMutating()).toBe(0))
  expect(screen.getByRole('dialog', { name: 'GPU 반납' })).toBeInTheDocument()
  expect(screen.queryByText('GPU 임대 연장 요청을 접수했습니다.')).not.toBeInTheDocument()
})

test('a late administrator mutation cannot affect the next allocation controls', async () => {
  const user = userEvent.setup()
  const first = gpuAllocationFixture({ name: '첫 GPU', status: 'QUEUED', gpu: null, queuePosition: 1 })
  const second = gpuAllocationFixture({ id: uuid(903), name: '둘째 GPU', status: 'QUEUED', gpu: null, queuePosition: 2 })
  gpuAllocationStore.push(first, second)
  const started = deferred(), response = deferred()
  server.use(http.post(`*/api/v1/admin/gpu-allocations/${first.id}/priority`, async () => { started.resolve(); await response.promise; return HttpResponse.json(first) }))
  const { router, client } = renderRoute(`/admin/gpus/${first.id}`, true)
  await user.click(await screen.findByRole('button', { name: '우선순위 변경' }))
  const oldModal = await screen.findByRole('dialog', { name: '대기 우선순위 변경' })
  await user.type(within(oldModal).getByLabelText('처리 사유'), '수업 배정')
  await user.click(within(oldModal).getByRole('button', { name: '대기 우선순위 변경' }))
  await started.promise
  await act(() => router.navigate(`/admin/gpus/${second.id}`))
  await screen.findByRole('heading', { name: '둘째 GPU' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '회수' }))
  await screen.findByRole('dialog', { name: 'GPU 회수' })
  response.resolve()
  await waitFor(() => expect(client.isMutating()).toBe(0))
  expect(screen.getByRole('dialog', { name: 'GPU 회수' })).toBeInTheDocument()
  expect(screen.queryByText('대기 우선순위 변경 요청을 접수했습니다.')).not.toBeInTheDocument()
})

test('switching workspace leaves the unscoped detail and removes the previous allocation', async () => {
  const user = userEvent.setup()
  gpuAllocationStore.push(gpuAllocationFixture())
  const { router } = renderRoute(`/console/gpus/${uuid(901)}`)
  await screen.findByRole('heading', { name: '학습 GPU' })
  await user.click(screen.getByRole('button', { name: '워크스페이스 선택' }))
  await user.click(await screen.findByRole('menuitem', { name: /데이터베이스 실습/ }))
  await waitFor(() => expect(router.state.location.pathname).toBe(`/console/${uuid(14)}`))
  expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '학습 GPU' })).not.toBeInTheDocument()
})

test('administrator scope changes hide a detail from another organization', async () => {
  const user = userEvent.setup()
  gpuAllocationStore.push(gpuAllocationFixture())
  renderRoute(`/admin/gpus/${uuid(901)}`, true)
  await screen.findByRole('heading', { name: '학습 GPU' })
  await user.selectOptions(screen.getByLabelText('관리 기관 선택'), uuid(2))
  expect(await screen.findByText('선택한 기관의 GPU 할당이 아닙니다.')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '학습 GPU' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '회수' })).not.toBeInTheDocument()
})

test('an open queued detail follows allocation and release, then stops polling', async () => {
  const originalInterval = globalThis.setInterval
  const timer = vi.spyOn(globalThis, 'setInterval').mockImplementation((callback, delay, ...args) => originalInterval(callback, delay === 30_000 ? 20 : delay, ...args))
  const allocation = gpuAllocationFixture({ status: 'QUEUED', gpu: null, allocatedAt: null, leaseEndsAt: null, queuePosition: 1 })
  let reads = 0
  server.use(http.get(`*/api/v1/gpu-allocations/${allocation.id}`, () => { reads++; return HttpResponse.json(allocation) }))
  try {
    renderRoute(`/console/gpus/${allocation.id}`)
    expect(await screen.findByText('대기')).toBeInTheDocument()
    allocation.status = 'ALLOCATED'
    allocation.queuePosition = null
    expect(await screen.findByRole('button', { name: 'VM 연결' })).toBeInTheDocument()
    allocation.status = 'RELEASED'
    expect(await screen.findByText('반납 완료')).toBeInTheDocument()
    const terminalReads = reads
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(reads).toBe(terminalReads)
  } finally { timer.mockRestore() }
})
