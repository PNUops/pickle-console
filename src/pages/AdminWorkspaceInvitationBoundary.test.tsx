import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { orgManagerUser, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { renderApp } from '../test/render'

test('support invitations never use the owner roster directory and review actor gains before writes', async () => {
  const user = userEvent.setup()
  let rosterReads = 0
  const writes: unknown[] = []
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser),
    http.post('*/api/v1/workspaces/:workspaceId/roster/resolve', () => { rosterReads++; return HttpResponse.json({ status: 403 }, { status: 403 }) }),
    http.post('*/api/v1/admin/workspaces/:workspaceId/invitations/preview', () => HttpResponse.json({ fingerprint: 'support-invitation-only', increases: [{ resourceType: null, targetId: uuid(12), workspaceId: uuid(12), beforeRole: null, afterRole: 'MEMBER' }], pendingResourceOwners: [] })),
    http.post('*/api/v1/admin/workspaces/:workspaceId/invitations', async ({ request }) => { writes.push(await request.json()); return HttpResponse.json({ results: [{ email: orgManagerUser.email, outcome: 'ADDED', userId: orgManagerUser.id }] }) }))
  renderApp(`/admin/workspaces?org=${uuid(2)}&workspaceId=${uuid(12)}&inspect=1&tab=members`)
  await user.type(await screen.findByLabelText('이메일 또는 학번'), orgManagerUser.email)
  expect(screen.queryByRole('button', { name: '미리보기' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '초대' }))
  const dialog = within(await screen.findByRole('dialog', { name: '회원님의 권한 증가 확인' }))
  expect(rosterReads).toBe(0)
  expect(writes).toHaveLength(0)
  await user.type(dialog.getByLabelText('권한을 얻는 목적'), '워크스페이스 실습 지원')
  await user.click(dialog.getByRole('button', { name: '권한 증가 확인하고 계속' }))
  await waitFor(() => expect(writes).toEqual([{ entries: [{ email: orgManagerUser.email }], confirmation: { purpose: '워크스페이스 실습 지원', fingerprint: 'support-invitation-only', confirmed: true } }]))
  expect(rosterReads).toBe(0)
})

test('an ordinary workspace owner retains the existing student-number roster preview', async () => {
  const user = userEvent.setup()
  let roster: unknown
  server.use(refreshSuccessHandler('access-user'),
    http.post('*/api/v1/workspaces/:workspaceId/roster/resolve', async ({ request }) => { roster = await request.json(); return HttpResponse.json({ results: [{ studentNo: '202312345', name: '합성 학생', userId: uuid(58), status: 'ACTIVE', eligible: true, member: true, invited: false }] }) }))
  renderApp(`/console/workspaces/${uuid(12)}`)
  await user.type(await screen.findByLabelText('이메일 또는 학번'), '202312345')
  await user.click(screen.getByRole('button', { name: '미리보기' }))
  await waitFor(() => expect(roster).toEqual({ studentNos: ['202312345'], orgId: null }))
  expect(await screen.findByRole('table', { name: '명단 미리보기' })).toBeInTheDocument()
})
