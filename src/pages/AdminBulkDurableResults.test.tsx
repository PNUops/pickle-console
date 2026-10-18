import { startTransition } from 'react'
import { flushSync } from 'react-dom'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui'
import { adminPaths } from '../lib/paths'
import { renderApp } from '../test/render'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { orgManagerUser, refreshSuccessHandler, sysAdminUser, sysViewerUser } from '../test/msw/handlers/auth'
import { bulkApplyBodies, bulkSavedOperations, bulkSavedPreviews, failNextBulkResponse, holdNextBulkApply, savedBulkPreview } from '../test/msw/handlers/bulk-changes'
import { vmStore } from '../test/msw/handlers/vms'

async function periodPreview(ids = [uuid(56)], profile = sysAdminUser, token = 'access-sys-admin', heldNavigations?: Array<() => Promise<void>>, useTransitions?: boolean, syncNavigation = false) {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler(token, profile))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter([{ path: '*', element: <QueryClientProvider client={client}><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></QueryClientProvider> }], {
    initialEntries: [{ pathname: '/admin/bulk/vms', search: profile.role.startsWith('ORG_') ? `?org=${uuid(1)}` : '', state: { targets: ids.map((id) => ({ id, name: vmStore.find((vm) => vm.id === id)?.name ?? '선택 당시 숨길 이름' })) } }],
  })
  if (heldNavigations || syncNavigation) {
    const navigate = router.navigate.bind(router)
    router.navigate = ((to, options) => {
      if (heldNavigations && (typeof to === 'string' && to.startsWith('/admin/bulk/vms?') || to !== null && typeof to === 'object' && to.pathname === '/admin/bulk/vms' && !!to.search)) {
        heldNavigations.push(async () => { await navigate(to, options) })
        return Promise.resolve()
      }
      if (syncNavigation) {
        let result!: Promise<void>
        flushSync(() => { result = navigate(to, options) })
        return result
      }
      return navigate(to, options)
    }) as typeof router.navigate
  }
  const view = render(<RouterProvider router={router} useTransitions={useTransitions} />)
  await user.click(await screen.findByRole('radio', { name: '기간' }))
  await user.click(screen.getByRole('button', { name: '다음' }))
  fireEvent.change(screen.getByLabelText(/새 종료일/), { target: { value: '2030-01-01' } })
  await user.click(screen.getByRole('button', { name: '미리보기' }))
  await screen.findByRole('table', { name: '일괄 변경 미리보기' })
  return { user, router, view, client, path: () => router.state.location.pathname + router.state.location.search }
}

describe('durable bulk results', () => {
test('keeps the live apply when its URL commits before transition-priority ownership updates', async () => {
  const { user, router, client } = await periodPreview([uuid(56)], sysAdminUser, 'access-sys-admin', undefined, false, true)
  const held = holdNextBulkApply()
  const unsubscribe = client.getMutationCache().subscribe((event) => {
    if (event.type !== 'added') return
    const execute = event.mutation.options.mutationFn!
    event.mutation.setOptions({ ...event.mutation.options, mutationFn: (variables, context) => {
      let result!: ReturnType<typeof execute>
      startTransition(() => { result = execute(variables, context) })
      return result
    } })
  })
  try {
    await user.click(screen.getByRole('button', { name: '1개에 적용' }))
    await held.started
    expect(new URLSearchParams(router.state.location.search).get('operationId')).toBe(bulkApplyBodies[0].operationId)
    expect(bulkApplyBodies).toHaveLength(1)
    expect(bulkSavedOperations.size).toBe(0)
    expect(screen.getByRole('table', { name: '일괄 변경 미리보기' })).toBeInTheDocument()
    expect(screen.queryByText(/저장된 결과를 확인하지 못했습니다/)).not.toBeInTheDocument()
  } finally {
    unsubscribe()
    await act(async () => held.release())
  }
  await screen.findByText('적용 결과가 저장됐습니다')
  expect(bulkApplyBodies).toHaveLength(1)
  const operationId = bulkApplyBodies[0].operationId!
  expect(bulkSavedOperations.has(operationId)).toBe(true)
  await user.click(screen.getByRole('link', { name: '저장된 미리보기 링크' }))
  await screen.findByText('이 미리보기는 이미 적용에 사용됐습니다.')
  expect(screen.queryByRole('table', { name: '일괄 변경 결과' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: '저장된 결과 열기' }))
  await screen.findByText('적용 결과가 저장됐습니다')
  expect(bulkApplyBodies).toHaveLength(1)
  expect(new URLSearchParams(router.state.location.search).get('operationId')).toBe(operationId)
})

test.each([true, false])('keeps an in-flight apply when router transition mode is %s', async (useTransitions) => {
  const { user, router } = await periodPreview([uuid(56)], sysAdminUser, 'access-sys-admin', undefined, useTransitions)
  const held = holdNextBulkApply()
  await user.click(screen.getByRole('button', { name: '1개에 적용' }))
  await held.started
  expect(new URLSearchParams(router.state.location.search).get('operationId')).toBe(bulkApplyBodies[0].operationId)
  expect(screen.getByRole('button', { name: /1개에 적용$/ })).toBeInTheDocument()
  await act(async () => held.release())
  await screen.findByText('적용 결과가 저장됐습니다')
  expect(bulkApplyBodies).toHaveLength(1)
})

test('reads the saved operation after visiting an external URL with the same selection state', async () => {
  const { user, router } = await periodPreview()
  await user.click(screen.getByRole('button', { name: '1개에 적용' }))
  await screen.findByText('적용 결과가 저장됐습니다')
  const savedPath = router.state.location.pathname + router.state.location.search
  const selectionState = router.state.location.state
  await act(async () => { await router.navigate(adminPaths.bulkOperation('vms', uuid(99500)), { state: selectionState }) })
  await screen.findByText(/저장된 결과를 확인하지 못했습니다/)
  expect(screen.queryByRole('table', { name: '일괄 변경 결과' })).not.toBeInTheDocument()
  await act(async () => { await router.navigate(savedPath, { state: selectionState }) })
  await screen.findByText('적용 결과가 저장됐습니다')
  expect(screen.queryByRole('radio', { name: '기간' })).not.toBeInTheDocument()
  expect(bulkApplyBodies).toHaveLength(1)
})

test('keeps the active apply when its preview URL commits before the later operation URL', async () => {
  const navigations: Array<() => Promise<void>> = []
  const { user, router } = await periodPreview([uuid(56)], sysAdminUser, 'access-sys-admin', navigations)
  expect(navigations).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: '1개에 적용' }))
  await screen.findByText('적용 결과가 저장됐습니다')
  expect(navigations).toHaveLength(2)
  await act(async () => { await navigations[0]() })
  expect(screen.getByText('적용 결과가 저장됐습니다')).toBeInTheDocument()
  expect(screen.getByRole('table', { name: '일괄 변경 결과' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '이 미리보기로 적용 준비' })).not.toBeInTheDocument()
  await act(async () => { await navigations[1]() })
  expect(screen.getByText('적용 결과가 저장됐습니다')).toBeInTheDocument()
  expect(bulkApplyBodies).toHaveLength(1)
  await act(async () => { await router.navigate(adminPaths.bulkPreview('vms', bulkApplyBodies[0].previewId!)) })
  expect(navigations).toHaveLength(3)
  await act(async () => { await navigations[2]() })
  await screen.findByText('이 미리보기는 이미 적용에 사용됐습니다.')
  expect(screen.queryByRole('table', { name: '일괄 변경 결과' })).not.toBeInTheDocument()
  expect(bulkApplyBodies).toHaveLength(1)
})

test('does not restore a router target label in a masked server preview', async () => {
  server.use(http.post('*/api/v1/admin/bulk-changes/preview', async ({ request }) => HttpResponse.json(savedBulkPreview(
    await request.json() as import('../api/queries').AdminBulkChangeRequest,
    [{ targetId: uuid(56), name: null, applicable: false, reason: 'NOT_FOUND', fields: [], fingerprint: 'masked-preview' }],
  ))))
  await periodPreview()
  const table = within(screen.getByRole('table', { name: '일괄 변경 미리보기' }))
  expect(table.getByText(uuid(56))).toBeInTheDocument()
  expect(table.queryByText(vmStore.find((vm) => vm.id === uuid(56))!.name)).not.toBeInTheDocument()
  expect(table.getByText('찾을 수 없음')).toBeInTheDocument()
  const details = screen.getByText('대상 1개').closest('details')!
  fireEvent.click(within(details).getByText('대상 1개'))
  expect(screen.queryByText(vmStore.find((vm) => vm.id === uuid(56))!.name)).not.toBeInTheDocument()
})

test('retries a response lost before commit with exactly the same preview and operation body', async () => {
  const vm = vmStore.find((row) => row.id === uuid(56))!
  const original = vm.endDate
  const { user, router } = await periodPreview()
  failNextBulkResponse('BEFORE_COMMIT')
  await user.click(screen.getByRole('button', { name: '1개에 적용' }))
  await screen.findByText('적용 응답을 확인하지 못했습니다')
  const bookmarkBefore = router.state.location.search
  expect(vm.endDate).toBe(original)
  expect(bulkSavedOperations.size).toBe(0)
  const body = structuredClone(bulkApplyBodies[0])
  const originalButton = screen.getByRole('button', { name: '1개에 적용' })
  expect(originalButton).toBeDisabled()
  fireEvent.click(originalButton)
  expect(bulkApplyBodies).toEqual([body])
  expect(router.state.location.search).toBe(bookmarkBefore)
  await user.click(screen.getByRole('button', { name: '같은 ID로 동일 요청 재확인' }))
  await screen.findByText('적용 결과가 저장됐습니다')
  expect(bulkApplyBodies).toEqual([body, body])
  expect(bulkSavedOperations.size).toBe(1)
  expect(vm.endDate).toBe('2030-01-01')
})

test('recovers a committed response loss by reading the existing operation without another write', async () => {
  const { user, router } = await periodPreview()
  failNextBulkResponse('AFTER_COMMIT')
  await user.click(screen.getByRole('button', { name: '1개에 적용' }))
  await screen.findByText('적용 응답을 확인하지 못했습니다')
  const id = bulkApplyBodies[0].operationId!
  expect(new URLSearchParams(router.state.location.search).get('operationId')).toBe(id)
  await user.click(screen.getByRole('button', { name: '같은 적용 결과 다시 조회' }))
  await screen.findByText('적용 결과가 저장됐습니다')
  expect(bulkApplyBodies).toHaveLength(1)
  expect(bulkSavedOperations.size).toBe(1)
  expect(vmStore.find((row) => row.id === uuid(56))!.endDate).toBe('2030-01-01')
})

test('does not revive a local target label after a masked repeat and recovery', async () => {
  const vm = vmStore.find((row) => row.id === uuid(56))!
  const { user } = await periodPreview([vm.id], orgManagerUser, 'access-org-manager')
  failNextBulkResponse('AFTER_COMMIT')
  await user.click(screen.getByRole('button', { name: '1개에 적용' }))
  await screen.findByText('적용 응답을 확인하지 못했습니다')
  const submitted = structuredClone(bulkApplyBodies[0])
  vm.orgId = uuid(2)
  await user.click(screen.getByRole('button', { name: '같은 ID로 동일 요청 재확인' }))
  await screen.findByText('적용 결과가 저장됐습니다')
  expect(bulkApplyBodies).toEqual([submitted, submitted])
  const table = within(screen.getByRole('table', { name: '일괄 변경 결과' }))
  expect(table.getByText('적용됨')).toBeInTheDocument()
  expect(table.queryByText(vm.name)).not.toBeInTheDocument()
  expect(screen.queryByText(vm.name)).not.toBeInTheDocument()
  expect(screen.getByText(/현재 조회 불가: /)).toBeInTheDocument()
  expect(table.queryByText('2030-01-01')).not.toBeInTheDocument()
})

test('resolves a preview consumed by another tab using only its owned committed receipt', async () => {
  const { user, router } = await periodPreview()
  const saved = [...bulkSavedPreviews.values()][0]
  const existingId = uuid(99200)
  const response = await fetch('/api/v1/admin/bulk-changes', { method: 'POST', headers: { Authorization: 'Bearer access-sys-admin', 'Content-Type': 'application/json' }, body: JSON.stringify({
    ...saved.request, previewId: saved.response.previewId, operationId: existingId,
    fingerprints: Object.fromEntries(saved.response.items.map((item) => [item.targetId, item.fingerprint])),
  }) })
  expect(response.status).toBe(200)
  const previous = bulkSavedOperations.get(existingId)!
  for (let index = 0; index < 21; index++) {
    const id = uuid(99300 + index)
    const previewId = uuid(99400 + index)
    bulkSavedOperations.set(id, { ...previous, request: { ...previous.request, operationId: id, previewId }, response: { ...previous.response, operationId: id, previewId, result: { ...previous.response.result, batchId: id } } })
  }
  await user.click(screen.getByRole('button', { name: '1개에 적용' }))
  await screen.findByText('적용 결과가 저장됐습니다')
  expect(new URLSearchParams(router.state.location.search).get('operationId')).toBe(existingId)
  expect(bulkApplyBodies).toHaveLength(2)
  expect(bulkSavedOperations.size).toBe(22)
  expect(bulkApplyBodies[1].operationId).not.toBe(existingId)
  expect(screen.queryByRole('button', { name: '같은 ID로 동일 요청 재확인' })).not.toBeInTheDocument()
})

test('reopens an in-flight apply after remount and observes completion only after the commit', async () => {
  const { user, view, path } = await periodPreview()
  const held = holdNextBulkApply()
  await user.click(screen.getByRole('button', { name: '1개에 적용' }))
  await held.started
  const bookmark = path()
  view.unmount()
  renderApp(bookmark)
  await screen.findByText(/저장된 결과를 확인하지 못했습니다/)
  expect(bulkApplyBodies).toHaveLength(1)
  expect(bulkSavedOperations.size).toBe(0)
  expect(screen.queryByText('적용 결과가 저장됐습니다')).not.toBeInTheDocument()
  await act(async () => held.release())
  await waitFor(() => expect(bulkSavedOperations.size).toBe(1))
  await user.click(screen.getByRole('button', { name: '같은 적용 결과 다시 조회' }))
  await screen.findByText('적용 결과가 저장됐습니다')
  expect(bulkApplyBodies).toHaveLength(1)
})

test('retains partial committed outcomes after response loss and bookmark reentry', async () => {
  const { user, view, path } = await periodPreview([uuid(56), uuid(999999)])
  failNextBulkResponse('AFTER_COMMIT')
  await user.click(screen.getByRole('button', { name: '1개에 적용' }))
  await screen.findByText('적용 응답을 확인하지 못했습니다')
  const bookmark = path()
  view.unmount()
  renderApp(bookmark)
  const table = within(await screen.findByRole('table', { name: '일괄 변경 결과' }))
  expect(table.getByText('적용됨')).toBeInTheDocument()
  expect(table.getByText('건너뜀')).toBeInTheDocument()
  expect(table.queryByText('선택 당시 숨길 이름')).not.toBeInTheDocument()
  expect(bulkApplyBodies).toHaveLength(1)
  expect(bulkSavedOperations.size).toBe(1)
})

test('opens a saved preview from a bookmark and prevents a second operation after consumption', async () => {
  const { user, view, path } = await periodPreview()
  const bookmark = path()
  view.unmount()
  renderApp(bookmark)
  await user.click(await screen.findByRole('button', { name: '이 미리보기로 적용 준비' }))
  await user.click(screen.getByRole('button', { name: '1개에 적용' }))
  await screen.findByText('적용 결과가 저장됐습니다')
  const id = bulkApplyBodies[0].operationId!
  const record = bulkSavedOperations.get(id)!
  for (let index = 0; index < 21; index++) {
    const anotherId = uuid(88000 + index)
    const anotherPreview = uuid(89000 + index)
    bulkSavedOperations.set(anotherId, { ...record, request: { ...record.request, operationId: anotherId, previewId: anotherPreview }, response: { ...record.response, operationId: anotherId, previewId: anotherPreview, result: { ...record.response.result, batchId: anotherId } } })
  }
  const recent = await fetch('/api/v1/admin/bulk-changes/operations', { headers: { Authorization: 'Bearer access-sys-admin' } }).then((response) => response.json()) as Array<{ operationId: string }>
  expect(recent).toHaveLength(20)
  expect(recent.some((item) => item.operationId === id)).toBe(false)
  const previewId = bulkApplyBodies[0].previewId!
  const current = screen.getByRole('link', { name: '저장된 적용 결과 링크' })
  expect(current).toHaveAttribute('href', adminPaths.bulkOperation('vms', id, undefined, previewId))
  await user.click(screen.getByRole('link', { name: '저장된 미리보기 링크' }))
  await screen.findByText('이 미리보기는 이미 적용에 사용됐습니다.')
  expect(screen.getByRole('link', { name: '저장된 결과 열기' })).toHaveAttribute('href', adminPaths.bulkOperation('vms', id, undefined, previewId))
  expect(screen.queryByRole('button', { name: '이 미리보기로 적용 준비' })).not.toBeInTheDocument()
  expect(bulkApplyBodies).toHaveLength(1)
})

test('preserves a committed receipt beyond preview expiry while preventing new expired apply', async () => {
  const { user, view, path } = await periodPreview()
  const previewPath = path()
  await user.click(screen.getByRole('button', { name: '1개에 적용' }))
  await screen.findByText('적용 결과가 저장됐습니다')
  const operationPath = path()
  bulkSavedPreviews.get(bulkApplyBodies[0].previewId!)!.response.expiresAt = new Date(Date.now() - 1).toISOString()
  view.unmount()
  const reopened = renderApp(operationPath)
  await screen.findByText('적용 결과가 저장됐습니다')
  reopened.unmount()
  const saved = bulkSavedPreviews.get(bulkApplyBodies[0].previewId!)!
  const expiredId = uuid(99110)
  bulkSavedPreviews.set(expiredId, { ...saved, response: { ...saved.response, previewId: expiredId, consumedOperationId: null } })
  renderApp(previewPath.replace(saved.response.previewId, expiredId))
  await screen.findByText(/미리보기의 새 적용 가능 시간이 지났습니다/)
  expect(screen.queryByRole('button', { name: '이 미리보기로 적용 준비' })).not.toBeInTheDocument()
  expect(bulkApplyBodies).toHaveLength(1)
})

test('separates a masked historical applied outcome from current inaccessible values and references', async () => {
  const operationId = uuid(99100)
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/bulk-changes/operations/:operationId', () => HttpResponse.json({
    operationId, previewId: uuid(99101), committedAt: '2026-10-13T00:00:00Z', status: 'COMMITTED', targetType: 'VM', change: null,
    result: { batchId: operationId, items: [{ targetId: uuid(56), name: null, result: 'APPLIED', reason: null, fields: [] }] },
    effects: [{ id: uuid(99102), targetId: uuid(56), kind: 'QUEUE', outcome: 'ACCEPTED', externalReference: 'hidden-job-reference', registeredAt: '2026-10-13T00:00:00Z', queueState: 'SUCCEEDED', queueObservedAt: '2026-10-13T00:01:00Z' }],
    observations: [{ targetId: uuid(56), observedAt: '2026-10-13T00:01:00Z', refusal: 'NOT_FOUND', values: { endDate: 'hidden-value' } }],
  })))
  renderApp(adminPaths.bulkReceipt(operationId))
  expect(await screen.findByText('적용 결과가 저장됐습니다')).toBeInTheDocument()
  expect(within(screen.getByRole('table', { name: '일괄 변경 결과' })).getByText('적용됨')).toBeInTheDocument()
  expect(screen.getByText(/현재 조회 불가: /)).toBeInTheDocument()
  expect(screen.queryByText('hidden-value')).not.toBeInTheDocument()
  expect(screen.queryByText('hidden-job-reference')).not.toBeInTheDocument()
  expect(screen.queryByText('작업 성공(외부 완료 별도)')).not.toBeInTheDocument()
  expect(within(screen.getByRole('main')).queryByRole('link', { name: /감사|작업 상세/ })).not.toBeInTheDocument()
})

test('rejects malformed identifiers and viewer receipt access without reading or writing an operation', async () => {
  let reads = 0
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get('*/api/v1/admin/bulk-changes/operations/:operationId', () => { reads++; return HttpResponse.json({}) }))
  const view = renderApp('/admin/bulk/operations/invalid')
  await screen.findByText('올바르지 않은 주소입니다. 주소를 확인해 주세요.')
  expect(reads).toBe(0)
  view.unmount()
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser))
  renderApp(adminPaths.bulkReceipt(uuid(99100)))
  await screen.findByRole('heading', { name: '관리자 대시보드' })
  expect(reads).toBe(0)
  expect(bulkApplyBodies).toHaveLength(0)
})
})

test('a fresh masked change never reuses the locally submitted draft for continuation', async () => {
  server.use(http.post('*/api/v1/admin/bulk-changes/preview', async ({ request }) => {
    const preview = savedBulkPreview(await request.json() as import('../api/queries').AdminBulkChangeRequest,
      [{ targetId: uuid(56), name: null, applicable: false, reason: 'FORBIDDEN', fields: [], fingerprint: '' }])
    return HttpResponse.json({ ...preview, change: null })
  }))
  await periodPreview()
  expect(await screen.findByText('현재 권한으로 이 변경안을 제공할 수 없습니다. 업무 권한을 다시 확인한 뒤 목록에서 새로 선택해 주세요.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '이전' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /개에 적용$/ })).not.toBeInTheDocument()
})
