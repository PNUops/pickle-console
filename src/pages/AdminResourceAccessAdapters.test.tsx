import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { orgManagerUser, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { renderApp } from '../test/render'

test.each(['VM', 'LLM_API_KEY', 'DOMAIN', 'GPU'] as const)('the %s support adapter sends exact named add/change/revoke bodies for every grade', async (type) => {
  const user = userEvent.setup()
  const resourceId = uuid(9981), grantId = uuid(9982)
  const grants: { id: string; granteeType: 'USER'; role: string; user: { userId: string; name: string; email: string }; createdAt: string }[] = []
  const writes: { method: string; type: unknown; target: unknown; grant: unknown; body: unknown }[] = []
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser),
    http.get('*/api/v1/admin/resource-access/:resourceType/:resourceId', ({ params }) => {
      expect(params.resourceType).toBe(type)
      expect(params.resourceId).toBe(resourceId)
      return HttpResponse.json({ resource: { id: resourceId, type, name: '합성 공유 자원', status: 'ACTIVE', workspaceId: uuid(12), workspaceName: '캡스톤 3조' }, grants, canManageAccess: true, eligibleMembers: [{ userId: uuid(5), name: '이시스템', workspaceRole: 'MEMBER', userStatus: 'ACTIVE' }] })
    }),
    http.post('*/api/v1/admin/resource-access/:resourceType/:resourceId/preview', () => HttpResponse.json({ fingerprint: 'other-user-no-increase', increases: [], pendingResourceOwners: [] })),
    http.post('*/api/v1/admin/resource-access/:resourceType/:resourceId', async ({ request, params }) => {
      const body = await request.json() as { role: string }
      writes.push({ method: 'ADD', type: params.resourceType, target: params.resourceId, grant: null, body })
      const grant = { id: grantId, granteeType: 'USER' as const, role: body.role, user: { userId: uuid(5), name: '이시스템', email: 'sysadmin.lee@pusan.ac.kr' }, createdAt: '2026-10-13T00:00:00Z' }
      grants.push(grant)
      return HttpResponse.json(grant, { status: 201 })
    }),
    http.patch('*/api/v1/admin/resource-access/:resourceType/:resourceId/:grantId', async ({ request, params }) => {
      const body = await request.json() as { role: string }
      writes.push({ method: 'UPDATE', type: params.resourceType, target: params.resourceId, grant: params.grantId, body })
      grants[0].role = body.role
      return HttpResponse.json(grants[0])
    }),
    http.delete('*/api/v1/admin/resource-access/:resourceType/:resourceId/:grantId', ({ params }) => {
      writes.push({ method: 'REMOVE', type: params.resourceType, target: params.resourceId, grant: params.grantId, body: null })
      grants.splice(0)
      return new HttpResponse(null, { status: 204 })
    }))
  renderApp(`/admin/resource-access/${type}/${resourceId}?org=${uuid(2)}`)
  await screen.findByRole('option', { name: /이시스템/ })
  await user.selectOptions(screen.getByLabelText('대상'), uuid(5))
  await user.selectOptions(screen.getByLabelText('등급'), 'OWNER')
  await user.click(screen.getByRole('button', { name: '부여' }))
  await waitFor(() => expect(writes).toHaveLength(1))
  for (const role of ['VIEWER', 'MEMBER', 'EDITOR', 'OWNER']) {
    const name = await screen.findByText('이시스템', { selector: 'p' })
    await user.selectOptions(within(name.closest('li')!).getByRole('combobox'), role)
    await waitFor(() => expect(writes.at(-1)?.body).toEqual({ role }))
  }
  const row = (await screen.findByText('이시스템', { selector: 'p' })).closest('li')!
  await user.click(within(row).getByRole('button', { name: '회수' }))
  const dialog = within(await screen.findByRole('dialog', { name: '접근 권한 회수' }))
  expect(writes).toHaveLength(5)
  await user.click(dialog.getByRole('button', { name: '회수' }))
  await waitFor(() => expect(writes).toHaveLength(6))
  expect(writes).toEqual([
    { method: 'ADD', type, target: resourceId, grant: null, body: { granteeType: 'USER', userId: uuid(5), role: 'OWNER' } },
    ...['VIEWER', 'MEMBER', 'EDITOR', 'OWNER'].map((role) => ({ method: 'UPDATE', type, target: resourceId, grant: grantId, body: { role } })),
    { method: 'REMOVE', type, target: resourceId, grant: grantId, body: null },
  ])
  expect(screen.queryByRole('link', { name: '이시스템' })).not.toBeInTheDocument()
})
