import type { components } from '../api/schema'
import { savedBulkPreview } from '../test/msw/handlers/bulk-changes'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui'
import { orgManagerUser, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { workspaceDetails } from '../test/msw/handlers/announcements'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'

function renderBulk(targets = [{ id: uuid(57), name: '공유 VM' }]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<MemoryRouter initialEntries={[{ pathname: '/admin/bulk/vms', search: `?org=${uuid(2)}`, state: { targets } }]}>
    <QueryClientProvider client={client}><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></QueryClientProvider>
  </MemoryRouter>)
}
async function openAccessValues(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'VM 일괄 변경' })
  expect(screen.getByRole('radio', { name: '접근 권한' })).toBeInTheDocument()
  expect(screen.queryByRole('radio', { name: '사용 기간' })).not.toBeInTheDocument()
  expect(screen.queryByRole('radio', { name: '전원' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '다음' }))
}

test('a foreign support bulk picker offers active SYS member labels without loading profile inventory', async () => {
  const user = userEvent.setup()
  let profileReads = 0
  let preview: unknown
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser),
    http.get('*/api/v1/admin/users', () => { profileReads++; return HttpResponse.json({ content: [] }) }),
    http.get('*/api/v1/admin/users/:userId', () => { profileReads++; return HttpResponse.json({}) }),
    http.post('*/api/v1/admin/bulk-changes/preview', async ({ request }) => { preview = await request.json(); return HttpResponse.json(savedBulkPreview(preview as components['schemas']['AdminBulkChangeRequest'], [{ targetId: uuid(57), name: '공유 VM', applicable: true, fields: [{ field: 'role', oldValue: null, newValue: 'MEMBER' }], fingerprint: 'sys-member-target' }])) }))
  renderBulk()
  await openAccessValues(user)
  await user.type(screen.getByLabelText('대상 사용자'), '이시스템')
  const pick = await screen.findByRole('button', { name: /이시스템 sysadmin.lee/ })
  expect(screen.queryByRole('link', { name: '이시스템' })).not.toBeInTheDocument()
  await user.click(pick)
  await user.click(screen.getByRole('button', { name: '미리보기' }))
  await waitFor(() => expect(preview).toEqual({ targetType: 'VM', targetIds: [uuid(57)], change: { kind: 'ACCESS', access: { userId: uuid(5), action: 'GRANT', role: 'MEMBER' } } }))
  expect(profileReads).toBe(0)
})

test('bulk REVOKE selects an existing inactive former grantee and preserves target-specific refusal results', async () => {
  const user = userEvent.setup()
  const targetIds = [uuid(57), uuid(56)]
  let body: unknown
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser),
    http.get('*/api/v1/admin/resource-access/:resourceType/:resourceId', ({ params }) => HttpResponse.json({ resource: { id: params.resourceId, type: 'VM', name: '공유 VM', status: 'RUNNING', workspaceId: uuid(12), workspaceName: '캡스톤 3조' }, grants: params.resourceId === uuid(57) ? [{ id: uuid(9877), granteeType: 'USER', role: 'EDITOR', user: { userId: uuid(77), name: '박탈퇴', email: 'left.park@pusan.ac.kr' }, createdAt: '2026-10-13T00:00:00Z' }] : [], canManageAccess: true })),
    http.post('*/api/v1/admin/bulk-changes/preview', async ({ request }) => HttpResponse.json(savedBulkPreview(await request.json() as components['schemas']['AdminBulkChangeRequest'], [
      { targetId: uuid(57), name: '기존 개인 권한 VM', applicable: true, fields: [{ field: 'role', oldValue: 'EDITOR', newValue: null }], fingerprint: 'existing-grant' },
      { targetId: uuid(56), name: '개인 권한 없는 VM', applicable: false, reason: 'NO_GRANT', fields: [], fingerprint: 'no-grant' },
    ]))),
    http.post('*/api/v1/admin/bulk-changes', async ({ request }) => { body = await request.json(); return HttpResponse.json({ batchId: (body as components['schemas']['AdminBulkChangeRequest']).operationId, items: [
      { targetId: uuid(57), name: '기존 개인 권한 VM', result: 'APPLIED', reason: null, fields: [{ field: 'role', oldValue: 'EDITOR', newValue: null }] },
      { targetId: uuid(56), name: '개인 권한 없는 VM', result: 'SKIPPED', reason: 'NO_GRANT', fields: [] },
    ] }) }))
  renderBulk(targetIds.map((id) => ({ id, name: '합성 VM' })))
  await openAccessValues(user)
  await user.click(screen.getByRole('radio', { name: '회수' }))
  await user.type(screen.getByLabelText('대상 사용자'), '박탈퇴')
  await user.click(await screen.findByRole('button', { name: /박탈퇴 left.park/ }))
  expect(screen.queryByRole('link', { name: '박탈퇴' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '미리보기' }))
  await screen.findByRole('table', { name: '일괄 변경 미리보기' })
  await user.click(screen.getByRole('button', { name: '1개에 적용' }))
  await waitFor(() => expect(body).toEqual({ previewId: expect.any(String), operationId: expect.any(String), targetType: 'VM', targetIds, change: { kind: 'ACCESS', access: { userId: uuid(77), action: 'REVOKE', role: null } }, fingerprints: { [uuid(57)]: 'existing-grant', [uuid(56)]: 'no-grant' } }))
  const result = await screen.findByRole('table', { name: '일괄 변경 결과' })
  expect(within(result).getByText('기존 개인 권한 VM')).toBeInTheDocument()
  expect(within(result).getByText('개인 권한 없는 VM')).toBeInTheDocument()
  expect(within(result).getAllByRole('row')).toHaveLength(3)
})

test('bulk actor gains require a per-target confirmation map before the apply request', async () => {
  const user = userEvent.setup()
  const bodies: Record<string, unknown>[] = []
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser),
    http.get('*/api/v1/admin/workspaces/:workspaceId', () => HttpResponse.json({ ...workspaceDetails[uuid(12)], members: [...workspaceDetails[uuid(12)].members, { userId: orgManagerUser.id, name: orgManagerUser.name, email: orgManagerUser.email, workspaceRole: 'MEMBER', userStatus: 'ACTIVE', joinedAt: '2026-10-13T00:00:00Z', supportDetailVisible: true, canChangeRole: true, canRemove: true }] })),
    http.post('*/api/v1/admin/bulk-changes/preview', async ({ request }) => HttpResponse.json(savedBulkPreview(await request.json() as components['schemas']['AdminBulkChangeRequest'], [{ targetId: uuid(57), name: '공유 VM', applicable: true, fields: [{ field: 'role', oldValue: 'MEMBER', newValue: 'EDITOR' }], fingerprint: 'bulk-source-fingerprint', actorAccessImpact: { fingerprint: 'bulk-actor-increase', increases: [{ resourceType: 'VM', targetId: uuid(57), workspaceId: uuid(12), beforeRole: 'MEMBER', afterRole: 'EDITOR' }], pendingResourceOwners: [] } }]))),
    http.post('*/api/v1/admin/bulk-changes', async ({ request }) => { bodies.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ batchId: bodies.at(-1)!.operationId, items: [{ targetId: uuid(57), name: '공유 VM', result: 'APPLIED', fields: [{ field: 'role', oldValue: 'MEMBER', newValue: 'EDITOR' }] }] }) }))
  renderBulk()
  await openAccessValues(user)
  await user.click(screen.getByRole('radio', { name: '변경' }))
  await user.type(screen.getByLabelText('대상 사용자'), orgManagerUser.name)
  await user.click(await screen.findByRole('button', { name: /최운영 manager.choi/ }))
  await user.selectOptions(screen.getByLabelText('등급'), 'EDITOR')
  await user.click(screen.getByRole('button', { name: '미리보기' }))
  await user.click(await screen.findByRole('button', { name: '1개에 적용' }))
  const review = within(await screen.findByRole('dialog', { name: '회원님의 권한 증가 확인' }))
  expect(bodies).toHaveLength(0)
  expect(review.getByText('참여자 → 편집자')).toBeInTheDocument()
  await user.type(review.getByLabelText('권한을 얻는 목적'), '접수된 실습 조치')
  await user.click(review.getByRole('button', { name: '권한 증가 확인하고 계속' }))
  await waitFor(() => expect(bodies).toHaveLength(1))
  expect(bodies[0].accessConfirmations).toEqual({ [uuid(57)]: { purpose: '접수된 실습 조치', fingerprint: 'bulk-actor-increase', confirmed: true } })
  expect(bodies[0].fingerprints).toEqual({ [uuid(57)]: 'bulk-source-fingerprint' })
})
