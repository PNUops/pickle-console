import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { orgAdminUser, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { renderApp } from '../test/render'

test('editing the confirmed profile access purpose requires a new acknowledgement before any save', async () => {
  const user = userEvent.setup()
  const patches: Record<string, unknown>[] = []
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser),
    http.post('*/api/v1/admin/users/:userId/profile-impact', () => HttpResponse.json({ action: 'PROFILE', userId: orgAdminUser.id, observedAt: '2026-10-13T00:00:00Z', candidateStatus: 'ACTIVE', claimsPossible: true, studentNoWillChange: true, invitations: [], actorAccessImpact: { fingerprint: 'purpose-bound-profile', increases: [{ resourceType: null, targetId: uuid(12), workspaceId: uuid(12), beforeRole: null, afterRole: 'MEMBER' }], pendingResourceOwners: [] } })),
    http.patch('*/api/v1/admin/users/:userId/profile', async ({ request }) => { const body = await request.json() as Record<string, unknown>; patches.push(body); return HttpResponse.json({ ...orgAdminUser, status: 'ACTIVE', memberships: [], activeVmCount: 0, statusChanges: [], supportCapabilities: { profileVisible: true, canCorrectProfile: true, canEnableAccount: false } }) }))
  renderApp(`/admin/users/${orgAdminUser.id}?org=${uuid(2)}`)
  await user.click(await screen.findByRole('button', { name: '정정' }))
  await user.selectOptions(screen.getByLabelText('직책'), 'STUDENT_UNDERGRAD')
  await user.type(screen.getByLabelText('학번'), '202088888')
  await user.type(screen.getByLabelText('사유'), '본인 확인')
  const review = within(await screen.findByRole('region', { name: '회원님의 권한 증가 확인' }))
  const purpose = review.getByLabelText('권한을 얻는 목적')
  const acknowledge = review.getByRole('checkbox', { name: '목적과 정확한 대상, 얻는 권한을 확인했습니다' })
  await user.type(purpose, '목적 A')
  await user.click(acknowledge)
  expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
  await user.clear(purpose)
  await user.type(purpose, '목적 B')
  expect(acknowledge).not.toBeChecked()
  expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  fireEvent.submit(purpose.closest('form')!)
  expect(patches).toHaveLength(0)
  await user.click(acknowledge)
  await user.click(screen.getByRole('button', { name: '저장' }))
  await waitFor(() => expect(patches).toHaveLength(1))
  expect(patches[0].confirmation).toEqual({ purpose: '목적 B', fingerprint: 'purpose-bound-profile', confirmed: true })
})
