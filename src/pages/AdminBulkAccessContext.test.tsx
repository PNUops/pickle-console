import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui'
import { orgManagerUser, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'

const state = { targets: [{ id: uuid(57), name: '합성 공유 VM' }] }
function renderBulk() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '*', element: <QueryClientProvider client={client}><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></QueryClientProvider> }], { initialEntries: [{ pathname: '/admin/bulk/vms', search: `?org=${uuid(1)}`, state }] })
  render(<RouterProvider router={router} />)
  return router
}
async function draftAccess(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('radio', { name: '접근 권한' }))
  await user.click(screen.getByRole('button', { name: '다음' }))
  await user.type(screen.getByLabelText('대상 사용자'), '이시스템')
  await user.click(await screen.findByRole('button', { name: /이시스템 sysadmin.lee/ }))
  await user.selectOptions(screen.getByLabelText('등급'), 'EDITOR')
}

const preview = { items: [{ targetId: uuid(57), name: '합성 공유 VM', applicable: true, fields: [{ field: 'role', oldValue: 'MEMBER', newValue: 'EDITOR' }], fingerprint: 'old-scope-preview', actorAccessImpact: { fingerprint: 'old-scope-gain', increases: [{ resourceType: 'VM', targetId: uuid(57), workspaceId: uuid(12), beforeRole: 'MEMBER', afterRole: 'EDITOR' }], pendingResourceOwners: [] } }] }

test('a late bulk preview cannot become the new institution filter preview or erase its draft', async () => {
  const user = userEvent.setup()
  let release: () => void = () => {}
  const pending = new Promise<void>((done) => { release = done })
  let started = false, writes = 0
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser), http.post('*/api/v1/admin/bulk-changes/preview', async () => { started = true; await pending; return HttpResponse.json(preview) }), http.post('*/api/v1/admin/bulk-changes', () => { writes++; return HttpResponse.json({}) }))
  const router = renderBulk()
  try {
    await draftAccess(user)
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await waitFor(() => expect(started).toBe(true))
    await act(() => router.navigate({ pathname: '/admin/bulk/vms', search: `?org=${uuid(2)}` }, { state }))
    await user.click(await screen.findByRole('button', { name: '다음' }))
    await user.type(screen.getByLabelText('대상 사용자'), '홍길동')
    await act(async () => { release(); await pending })
    expect(screen.getByLabelText('대상 사용자')).toHaveValue('홍길동')
    expect(screen.queryByRole('table', { name: '일괄 변경 미리보기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '회원님의 권한 증가 확인' })).not.toBeInTheDocument()
    expect(writes).toBe(0)
  } finally { release() }
})

test('an institution filter change discards a pending bulk access confirmation for the same actor and targets', async () => {
  const user = userEvent.setup()
  let writes = 0
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser), http.post('*/api/v1/admin/bulk-changes/preview', () => HttpResponse.json(preview)), http.post('*/api/v1/admin/bulk-changes', () => { writes++; return HttpResponse.json({}) }))
  const router = renderBulk()
  await draftAccess(user)
  await user.click(screen.getByRole('button', { name: '미리보기' }))
  await user.click(await screen.findByRole('button', { name: '1개에 적용' }))
  const review = within(await screen.findByRole('dialog', { name: '회원님의 권한 증가 확인' }))
  await user.type(review.getByLabelText('권한을 얻는 목적'), '이전 기관의 확인')
  await act(() => router.navigate({ pathname: '/admin/bulk/vms', search: `?org=${uuid(2)}` }, { state }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '회원님의 권한 증가 확인' })).not.toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: '다음' }))
  expect(screen.getByLabelText('대상 사용자')).toHaveValue('')
  expect(writes).toBe(0)
})
