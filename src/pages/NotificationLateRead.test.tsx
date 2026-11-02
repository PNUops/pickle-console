import { StrictMode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from '../App'
import { AuthContext, type AuthContextValue, type UserProfile } from '../auth/auth-context'
import { setAccessToken } from '../api/token'
import { ToastProvider } from '../components/ui'
import { regularProfile, regularProfileB } from '../test/msw/handlers/auth'
import { PathnameProbe } from '../test/PathnameProbe'
import { server } from '../test/msw/server'
import { usageAlertFixture } from '../test/usage-alert-fixture'

function gate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

function reader(client: QueryClient, profile: UserProfile, route = '/console/notifications') {
  const auth: AuthContextValue = { status: 'authenticated', user: profile,
    login: async () => { throw new Error('Unused') }, completeMfa: async () => { throw new Error('Unused') },
    refreshProfile: async () => {}, logout: async () => {}, beginCredentialExchange: () => { throw new Error('Unused') } }
  return <MemoryRouter initialEntries={[route]}><QueryClientProvider client={client}>
    <AuthContext.Provider value={auth}><ToastProvider><App /><PathnameProbe /></ToastProvider></AuthContext.Provider>
  </QueryClientProvider></MemoryRouter>
}

// The real consumer and transport remain active. AuthProvider's separate cache
// clearing is not used to hide a stale callback from an unmounted consumer.
test('a late successful usage read cannot navigate the next account to the old key', async () => {
  setAccessToken('access-user')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const pending = gate()
  const notification = usageAlertFixture()
  let changed = false
  let requested = false
  let completed = false
  server.use(http.get('*/api/v1/notifications', ({ request }) => HttpResponse.json({
    content: changed ? [] : [notification], page: 0,
    size: Number(new URL(request.url).searchParams.get('size') ?? 20), totalElements: changed ? 0 : 1, totalPages: 1,
  })), http.get('*/api/v1/notifications/unread-count', () => HttpResponse.json({ unreadCount: changed ? 0 : 1 })),
  http.post('*/api/v1/notifications/:id/read', async () => {
    requested = true
    await pending.promise
    completed = true
    return HttpResponse.json({ ...notification, readAt: '2026-11-01T17:00:00Z' })
  }))
  const view = render(reader(client, regularProfile))
  await userEvent.click(await screen.findByText(notification.title))
  await waitFor(() => expect(requested).toBe(true))
  changed = true
  setAccessToken('access-user-b')
  view.rerender(reader(client, regularProfileB))
  expect(screen.queryByText(notification.title)).not.toBeInTheDocument()
  expect(screen.getByTestId('app-pathname')).toHaveTextContent('/console/notifications')
  await act(async () => { pending.release(); await pending.promise })
  await waitFor(() => expect(completed).toBe(true))
  await waitFor(() => expect(client.isMutating()).toBe(0))
  await waitFor(() => expect(client.isFetching()).toBe(0))
  expect(screen.getByTestId('app-pathname').textContent).toBe('/console/notifications')
  expect(screen.queryByRole('heading', { name: 'capstone-chatbot' })).not.toBeInTheDocument()
})


test('the current StrictMode reader remains live after effect replay', async () => {
  setAccessToken('access-user')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const notification = usageAlertFixture()
  server.use(http.get('*/api/v1/notifications', ({ request }) => HttpResponse.json({
    content: [notification], page: 0, size: Number(new URL(request.url).searchParams.get('size') ?? 20), totalElements: 1, totalPages: 1,
  })), http.get('*/api/v1/notifications/unread-count', () => HttpResponse.json({ unreadCount: 1 })),
  http.post('*/api/v1/notifications/:id/read', () => HttpResponse.json({ ...notification, readAt: '2026-11-01T17:00:00Z' })))
  render(<StrictMode>{reader(client, regularProfile)}</StrictMode>)
  await userEvent.click(await screen.findByText(notification.title))
  await screen.findByRole('heading', { name: 'capstone-chatbot' })
  expect(screen.getByTestId('app-pathname').textContent).toBe(notification.linkPath)
})
