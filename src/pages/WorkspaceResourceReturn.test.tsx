import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { renderApp } from '../test/render'
import { refreshSuccessHandler, orgManagerUser } from '../test/msw/handlers/auth'
import { gpuAllocationFixture, gpuAllocationStore } from '../test/msw/handlers/gpu'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'

afterEach(() => vi.unstubAllEnvs())

test.each([
  [`/console/vms/${uuid(55)}`, false, '접근'],
  [`/console/llm-keys/${uuid(70)}`, false, '접근'],
  [`/console/domains/${uuid(9101)}`, false, '레코드'],
  [`/console/gpus/${uuid(901)}`, false, null],
  [`/admin/vms/${uuid(55)}?org=${uuid(1)}`, true, null],
  [`/admin/llm/keys/${uuid(170)}?org=${uuid(1)}`, true, null],
  [`/admin/domains?domainId=${uuid(9101)}&org=${uuid(1)}`, true, null],
  [`/admin/gpus/${uuid(901)}?org=${uuid(1)}`, true, null],
] as const)('an exact resource retains its workspace origin on %s', async (route, admin, tab) => {
  vi.stubEnv('VITE_GPU_PREVIEW', '1')
  gpuAllocationStore.push(gpuAllocationFixture())
  const user = userEvent.setup()
  const source = admin ? `/admin/workspaces?org=${uuid(2)}&workspaceId=${uuid(12)}&tab=resources&inspect=1` : `/console/workspaces/${uuid(12)}`
  server.use(admin ? refreshSuccessHandler('access-org-manager', orgManagerUser) : refreshSuccessHandler('access-user'))
  renderApp(`${route}${route.includes('?') ? '&' : '?'}returnTo=${encodeURIComponent(source)}`)
  const back = await screen.findByRole('link', { name: '← 워크스페이스' })
  expect(back).toHaveAttribute('href', source)
  if (tab) {
    await user.click(await screen.findByRole('tab', { name: tab }))
    expect(screen.getByRole('link', { name: '← 워크스페이스' })).toHaveAttribute('href', source)
  }
  await user.click(screen.getByRole('link', { name: '← 워크스페이스' }))
  expect(await screen.findByRole('heading', { name: '캡스톤 3조' })).toBeInTheDocument()
  if (admin) expect(screen.getByRole('tab', { name: '자원과 신청' })).toHaveAttribute('aria-selected', 'true')
})

test('a resource never trusts the origin of another workspace', async () => {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/vms/${uuid(55)}?returnTo=${encodeURIComponent(`/console/workspaces/${uuid(15)}`)}`)
  await screen.findByRole('link', { name: '← 가상머신' })
  expect(screen.queryByRole('link', { name: '← 워크스페이스' })).not.toBeInTheDocument()
})
