import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { currentPath, renderApp } from '../test/render'
import { refreshSuccessHandler, orgManagerUser } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'

test('an owner follows an exact request result back to its workspace', async () => {
  const user = userEvent.setup()
  const source = `/console/workspaces/${uuid(12)}`
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/requests/${uuid(102)}?returnTo=${encodeURIComponent(source)}`)
  const back = await screen.findByRole('link', { name: '← 워크스페이스' })
  expect(back).toHaveAttribute('href', source)
  await user.click(back)
  expect(currentPath()).toBe(source)
  expect(await screen.findByRole('heading', { name: '캡스톤 3조' })).toBeInTheDocument()
})

test('a support request returns to its original workspace drawer across source and actual institutions', async () => {
  const user = userEvent.setup()
  const source = `/admin/workspaces?org=${uuid(2)}&q=캡스톤&sort=name-desc&workspaceId=${uuid(12)}&tab=invitations&inspect=1`
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser))
  renderApp(`/admin/requests/${uuid(201)}?org=${uuid(1)}&returnTo=${encodeURIComponent(source)}`)
  const back = await screen.findByRole('link', { name: '← 워크스페이스' })
  const canonical = `/admin/workspaces?org=${uuid(2)}&q=${encodeURIComponent('캡스톤')}&sort=name-desc&workspaceId=${uuid(12)}&tab=invitations&inspect=1`
  expect(back).toHaveAttribute('href', canonical)
  await user.click(back)
  expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('org')).toBe(uuid(2))
  expect(await screen.findByRole('tab', { name: '대기 초대' })).toHaveAttribute('aria-selected', 'true')
})

test('an unrelated workspace source never appears as a request return link', async () => {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/requests/${uuid(102)}?returnTo=${encodeURIComponent(`/console/workspaces/${uuid(15)}`)}`)
  await screen.findByRole('heading', { name: '신청 상세' })
  expect(screen.queryByRole('link', { name: '← 워크스페이스' })).not.toBeInTheDocument()
})
