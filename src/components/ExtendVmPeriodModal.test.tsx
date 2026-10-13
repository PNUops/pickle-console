import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import { ExtendVmPeriodModal } from './ExtendVmPeriodModal'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { localDateStr } from '../test/msw/handlers/vms'

test.each(['success', 'refusal'] as const)('isolates a late period %s after target replacement', async (outcome) => {
  const user = userEvent.setup()
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const done = vi.fn()
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  let writes = 0
  let body: unknown
  server.use(http.patch('*/api/v1/admin/vms/:vmId/period', async ({ request, params }) => {
    expect(params.vmId).toBe(uuid(501))
    body = await request.json()
    writes += 1
    await held
    return outcome === 'success'
      ? HttpResponse.json({ id: uuid(501) })
      : HttpResponse.json({ status: 409, detail: '삭제가 예약된 VM은 기간을 변경할 수 없습니다.' }, { status: 409 })
  }))
  const modal = (id: string, name: string) => <QueryClientProvider client={client}>
    <ExtendVmPeriodModal key={id} vm={{ id, name, endDate: null }} onClose={() => {}} onDone={done} />
  </QueryClientProvider>
  const view = render(modal(uuid(501), '이전 VM'))
  const old = within(screen.getByRole('dialog', { name: '기간 연장 — 이전 VM' }))
  expect(old.getByText('무기한', { selector: 'strong' })).toBeInTheDocument()
  fireEvent.change(old.getByLabelText(/새 종료일/), { target: { value: localDateStr(30) } })
  await user.click(old.getByRole('button', { name: '연장' }))
  await waitFor(() => expect(writes).toBe(1))
  expect(body).toEqual({ endDate: localDateStr(30) })
  view.rerender(modal(uuid(502), '현재 VM'))
  const current = within(screen.getByRole('dialog', { name: '기간 연장 — 현재 VM' }))
  fireEvent.change(current.getByLabelText(/새 종료일/), { target: { value: localDateStr(60) } })
  release()
  await waitFor(() => expect(client.getMutationCache().getAll()[0].state.status).toBe(outcome === 'success' ? 'success' : 'error'))
  expect(current.getByLabelText(/새 종료일/)).toHaveValue(localDateStr(60))
  expect(current.queryByText('삭제가 예약된 VM은 기간을 변경할 수 없습니다.')).not.toBeInTheDocument()
  expect(done).not.toHaveBeenCalled()
  expect(writes).toBe(1)
  if (outcome === 'success') {
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['resources'] }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'vms'] })
  } else expect(invalidate).not.toHaveBeenCalled()
})

test('describes the submitted period when the draft changes during a held write', async () => {
  const user = userEvent.setup()
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const done = vi.fn()
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  let body: unknown
  server.use(http.patch('*/api/v1/admin/vms/:vmId/period', async ({ request }) => {
    body = await request.json()
    await held
    return HttpResponse.json({ id: uuid(501) })
  }))
  render(<QueryClientProvider client={client}>
    <ExtendVmPeriodModal vm={{ id: uuid(501), name: '대기 중인 VM', endDate: null }} onClose={() => {}} onDone={done} />
  </QueryClientProvider>)
  const dialog = within(screen.getByRole('dialog', { name: '기간 연장 — 대기 중인 VM' }))
  fireEvent.change(dialog.getByLabelText(/새 종료일/), { target: { value: localDateStr(30) } })
  await user.click(dialog.getByRole('button', { name: '연장' }))
  await waitFor(() => expect(body).toEqual({ endDate: localDateStr(30) }))
  await user.click(dialog.getByRole('checkbox', { name: /무기한/ }))
  expect(dialog.queryByLabelText(/새 종료일/)).not.toBeInTheDocument()
  release()
  await waitFor(() => expect(done).toHaveBeenCalledWith('새 종료일을 저장했습니다. 중지된 VM은 VM 관리에서 다시 시작해 주세요.'))
  expect(done).toHaveBeenCalledTimes(1)
  expect(body).toEqual({ endDate: localDateStr(30) })
})
