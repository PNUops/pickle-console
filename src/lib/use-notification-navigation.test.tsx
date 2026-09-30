import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { AuthContext } from '../auth/auth-context'
import { setAccessToken } from '../api/token'
import { orgAdminDualProfile } from '../test/msw/handlers/auth'
import { adminRequestStore } from '../test/msw/handlers/admin'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { useNotificationNavigation } from './use-notification-navigation'

function Probe() {
  const { openNotification, navigationError } = useNotificationNavigation()
  const location = useLocation()
  return <>
    <button onClick={() => void openNotification(`/admin/requests/${uuid(201)}`)}>first</button>
    <button onClick={() => void openNotification(`/admin/requests/${uuid(202)}`)}>second</button>
    <output data-testid="path">{location.pathname}{location.search}</output>
    {navigationError && <p>{navigationError}</p>}
  </>
}

test.each(['route change', 'newer notification'])('late notification lookup cannot override a %s', async (transition) => {
  const user = userEvent.setup()
  setAccessToken('access-org-admin-dual')
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  let started = false
  server.use(http.get('*/api/v1/admin/requests/:requestId', async ({ params }) => {
    if (params.requestId === uuid(201)) {
      started = true
      await held
    }
    return HttpResponse.json({ ...adminRequestStore[0], id: params.requestId, orgId: uuid(2) })
  }))
  const router = createMemoryRouter([{ path: '*', element: <Probe /> }], {
    initialEntries: [`/admin/notifications?org=${uuid(1)}`],
  })
  render(<AuthContext.Provider value={{
    status: 'authenticated', user: orgAdminDualProfile,
    login: async () => ({ kind: 'authenticated', user: orgAdminDualProfile }),
    completeMfa: async () => orgAdminDualProfile, refreshProfile: async () => {}, logout: async () => {},
    beginCredentialExchange: () => ({ generation: 0, settle: () => {} }),
  }}><RouterProvider router={router} /></AuthContext.Provider>)
  await user.click(screen.getByRole('button', { name: 'first' }))
  await waitFor(() => expect(started).toBe(true))
  const expected = transition === 'route change'
    ? '/admin/users'
    : `/admin/requests/${uuid(202)}?org=${uuid(2)}`
  if (transition === 'route change') await act(() => router.navigate(expected))
  else await user.click(screen.getByRole('button', { name: 'second' }))
  await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(expected))
  await act(async () => { release(); await held })
  await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(expected))
})
