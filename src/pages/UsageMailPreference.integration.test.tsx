import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from '../App'
import { AuthContext, type AuthContextValue, type UserProfile } from '../auth/auth-context'
import { setAccessToken } from '../api/token'
import { ToastProvider } from '../components/ui'
import { regularProfile, regularProfileB, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { renderApp } from '../test/render'
import { server } from '../test/msw/server'
import { usageAlertFixture } from '../test/usage-alert-fixture'

function gate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

function listFixture(axis: 'TOKEN' | 'CREDIT' = 'TOKEN') {
  const notification = usageAlertFixture(axis)
  server.use(http.get('*/api/v1/notifications', ({ request }) => HttpResponse.json({
    content: [notification], page: 0, size: Number(new URL(request.url).searchParams.get('size') ?? 20), totalElements: 1, totalPages: 1,
  })))
  return notification
}

function preferences(enabled = true) {
  server.use(http.get('*/api/v1/me/notification-preferences', () => HttpResponse.json({ usageMailEnabled: enabled })))
}

function normalPage() {
  server.use(refreshSuccessHandler('access-user'))
  return renderApp('/console/notifications')
}

function controlled(client: QueryClient, profile: UserProfile) {
  const auth: AuthContextValue = { status: 'authenticated', user: profile,
    login: async () => { throw new Error('Unused') }, completeMfa: async () => { throw new Error('Unused') },
    refreshProfile: async () => {}, logout: async () => {}, beginCredentialExchange: () => { throw new Error('Unused') } }
  return <MemoryRouter initialEntries={['/console/notifications']}><QueryClientProvider client={client}>
    <AuthContext.Provider value={auth}><ToastProvider><App /></ToastProvider></AuthContext.Provider>
  </QueryClientProvider></MemoryRouter>
}

test('personal preference reads ON and writes only its usage-mail boolean', async () => {
  listFixture(); preferences(true)
  const writes: unknown[] = []
  server.use(http.put('*/api/v1/me/notification-preferences', async ({ request }) => {
    const body = await request.json(); writes.push(body); return HttpResponse.json(body)
  }))
  normalPage()
  const checkbox = await screen.findByRole('checkbox', { name: '사용량 알림 메일 받기' })
  expect(checkbox).toBeChecked()
  expect(screen.getByText('키 한도를 모두 사용하면 메일로 알려드려요. 꺼도 알림함에서는 확인할 수 있어요.')).toBeInTheDocument()
  await userEvent.click(checkbox)
  await userEvent.click(screen.getByRole('button', { name: '메일 설정 저장' }))
  await waitFor(() => expect(writes).toEqual([{ usageMailEnabled: false }]))
  await screen.findByText('사용량 알림 메일 설정을 저장했습니다.')
  expect(screen.getByText('키 사용량 알림')).toBeInTheDocument()
})

test('missing preference does not become an unchecked known setting', async () => {
  listFixture()
  server.use(http.get('*/api/v1/me/notification-preferences', () => HttpResponse.json({ usageMailEnabled: null })))
  normalPage()
  await screen.findByText('메일 설정 응답을 확인하지 못했어요.')
  expect(screen.queryByRole('checkbox', { name: '사용량 알림 메일 받기' })).not.toBeInTheDocument()
  expect(screen.getByText('키 사용량 알림')).toBeInTheDocument()
})

test('late preference GET cannot replace another account setting', async () => {
  setAccessToken('access-user')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const first = gate()
  let requested = false
  let changed = false
  server.use(http.get('*/api/v1/me/notification-preferences', async () => {
    const old = !changed
    if (old) { requested = true; await first.promise }
    return HttpResponse.json({ usageMailEnabled: old })
  }))
  const view = render(controlled(client, regularProfile))
  try {
    await waitFor(() => expect(requested).toBe(true))
    changed = true; setAccessToken('access-user-b')
    view.rerender(controlled(client, regularProfileB))
    expect(await screen.findByRole('checkbox', { name: '사용량 알림 메일 받기' })).not.toBeChecked()
  } finally { first.release() }
  await waitFor(() => expect(client.isFetching()).toBe(0))
  expect(screen.getByRole('checkbox', { name: '사용량 알림 메일 받기' })).not.toBeChecked()
})

test('late preference PUT cannot change or announce success in another account', async () => {
  setAccessToken('access-user')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  preferences(true)
  const pending = gate()
  let saving = false
  server.use(http.put('*/api/v1/me/notification-preferences', async () => {
    saving = true; await pending.promise; return HttpResponse.json({ usageMailEnabled: false })
  }))
  const view = render(controlled(client, regularProfile))
  await userEvent.click(await screen.findByRole('checkbox', { name: '사용량 알림 메일 받기' }))
  await userEvent.click(screen.getByRole('button', { name: '메일 설정 저장' }))
  try {
    await waitFor(() => expect(saving).toBe(true))
    setAccessToken('access-user-b'); view.rerender(controlled(client, regularProfileB))
    expect(await screen.findByRole('checkbox', { name: '사용량 알림 메일 받기' })).toBeChecked()
  } finally { pending.release() }
  await act(async () => { await pending.promise })
  await waitFor(() => expect(client.isMutating()).toBe(0))
  expect(screen.getByRole('checkbox', { name: '사용량 알림 메일 받기' })).toBeChecked()
  expect(screen.queryByText('사용량 알림 메일 설정을 저장했습니다.')).not.toBeInTheDocument()
})


test('a failed preference save preserves its draft without announcing success', async () => {
  listFixture(); preferences(true)
  server.use(http.put('*/api/v1/me/notification-preferences', () => HttpResponse.json({
    type: 'about:blank', title: '저장 실패', status: 503, code: 'SERVICE_UNAVAILABLE', detail: '메일 설정을 저장하지 못했습니다.',
  }, { status: 503 })))
  normalPage()
  await userEvent.click(await screen.findByRole('checkbox', { name: '사용량 알림 메일 받기' }))
  await userEvent.click(screen.getByRole('button', { name: '메일 설정 저장' }))
  await screen.findByText('메일 설정을 저장하지 못했습니다.')
  expect(screen.getByRole('checkbox', { name: '사용량 알림 메일 받기' })).not.toBeChecked()
  expect(screen.getByRole('button', { name: '메일 설정 저장' })).toBeEnabled()
  expect(screen.queryByText('사용량 알림 메일 설정을 저장했습니다.')).not.toBeInTheDocument()
})


test('an older preference GET cannot overwrite a successful current save', async () => {
  setAccessToken('access-user')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const oldRead = gate()
  let reads = 0
  let backgroundStarted = false
  let saved = false
  server.use(http.get('*/api/v1/me/notification-preferences', async () => {
    reads += 1
    const snapshot = { usageMailEnabled: true }
    if (reads === 2) { backgroundStarted = true; await oldRead.promise }
    return HttpResponse.json(snapshot)
  }), http.put('*/api/v1/me/notification-preferences', async ({ request }) => {
    const body = await request.json()
    expect(body).toEqual({ usageMailEnabled: false })
    saved = true
    return HttpResponse.json({ usageMailEnabled: false })
  }))
  render(controlled(client, regularProfile))
  const checkbox = await screen.findByRole('checkbox', { name: '사용량 알림 메일 받기' })
  expect(checkbox).toBeChecked()
  const pendingRead = client.refetchQueries({ queryKey: ['notification-preferences'], type: 'active' })
  try {
    await waitFor(() => expect(backgroundStarted).toBe(true))
    await userEvent.click(checkbox)
    await userEvent.click(screen.getByRole('button', { name: '메일 설정 저장' }))
    await waitFor(() => expect(saved).toBe(true))
    await screen.findByText('사용량 알림 메일 설정을 저장했습니다.')
    expect(screen.getByRole('checkbox', { name: '사용량 알림 메일 받기' })).not.toBeChecked()
  } finally { oldRead.release() }
  await act(async () => { await pendingRead })
  await waitFor(() => expect(client.isFetching()).toBe(0))
  expect(screen.getByRole('checkbox', { name: '사용량 알림 메일 받기' })).not.toBeChecked()
  expect(screen.getByText('사용량 알림 메일 설정을 저장했습니다.')).toBeInTheDocument()
})
