import { act, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from '../App'
import { AuthContext, type AuthContextValue, type UserProfile } from '../auth/auth-context'
import { setAccessToken } from '../api/token'
import type { NotificationView } from '../api/queries'
import { ToastProvider } from '../components/ui'
import { regularProfile, regularProfileB } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'

const OLD_TITLE = 'Synthetic private key observation'
const CURRENT_TITLE = '현재 읽을 수 있는 키 안내'
type Surface = 'inbox' | 'bell' | 'dashboard'

function gate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

function actor(profile: UserProfile, fingerprint: string): UserProfile {
  return { ...profile, institutionAuthority: { state: 'VALID_EMPTY', failure: null,
    accountRole: profile.role, catalogueRevision: 'current-catalogue', authorityFingerprint: fingerprint,
    assignments: [], catalogue: [] } }
}

function notice(title: string): NotificationView {
  return { id: uuid(9910), event: 'llm.usage.threshold', title,
    body: '키 전체 관측 사용량 80, 당시 한도 100. 개인 사용량이 아닙니다.',
    linkPath: `/console/llm-keys/${uuid(171)}`, importance: 'NORMAL',
    createdAt: '2026-11-02T00:00:00Z', readAt: null }
}

function harness(surface: Surface, client: QueryClient, profile: UserProfile) {
  const auth: AuthContextValue = { status: 'authenticated', user: profile,
    login: async () => { throw new Error('Unused credential exchange') },
    completeMfa: async () => { throw new Error('Unused credential exchange') },
    refreshProfile: async () => {}, logout: async () => {},
    beginCredentialExchange: () => { throw new Error('Unused credential exchange') } }
  // Deliberately isolate the consumers' ownership boundary from AuthProvider's
  // separate cache-clear and request-cancellation defenses.
  return <MemoryRouter initialEntries={[surface === 'inbox' ? '/console/notifications' : '/console']}>
    <QueryClientProvider client={client}><AuthContext.Provider value={auth}>
      <ToastProvider><App /></ToastProvider>
    </AuthContext.Provider></QueryClientProvider>
  </MemoryRouter>
}

async function openBell() {
  const existing = screen.queryByRole('dialog', { name: '알림' })
  if (existing) return within(existing)
  await userEvent.click(await screen.findByRole('button', { name: /알림/ }))
  return within(await screen.findByRole('dialog', { name: '알림' }))
}

const identities = ['account', 'authority'] as const
for (const surface of ['inbox', 'bell', 'dashboard'] as const) {
  test.each(identities)(`${surface} immediately hides a cached notification after an %s change`, async (identity) => {
    setAccessToken('access-user')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    const pending = gate()
    let changed = false
    server.use(http.get('*/api/v1/notifications', async ({ request }) => {
      const current = changed
      if (current) await pending.promise
      const url = new URL(request.url)
      return HttpResponse.json({ content: [notice(current ? CURRENT_TITLE : OLD_TITLE)],
        page: Number(url.searchParams.get('page') ?? 0), size: Number(url.searchParams.get('size') ?? 20), totalElements: 1, totalPages: 1 })
    }), http.get('*/api/v1/notifications/unread-count', async () => {
      const current = changed
      if (current) await pending.promise
      return HttpResponse.json({ unreadCount: current ? 1 : 7 })
    }))
    const view = render(harness(surface, client, actor(regularProfile, 'before')))
    if (surface === 'bell') await (await openBell()).findByText(OLD_TITLE)
    else await screen.findByText(OLD_TITLE)
    await screen.findByRole('button', { name: '읽지 않은 알림 7개' })
    try {
      changed = true
      if (identity === 'account') setAccessToken('access-user-b')
      view.rerender(harness(surface, client, actor(identity === 'account' ? regularProfileB : regularProfile,
        identity === 'authority' ? 'after' : 'before')))
      const oldTitle = surface === 'bell'
        ? screen.queryByRole('dialog', { name: '알림' }) && within(screen.getByRole('dialog', { name: '알림' })).queryByText(OLD_TITLE)
        : screen.queryByText(OLD_TITLE)
      expect(oldTitle).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '읽지 않은 알림 7개' })).not.toBeInTheDocument()
    } finally {
      pending.release()
    }
    await screen.findByRole('button', { name: '읽지 않은 알림 1개' })
    if (surface === 'bell') await (await openBell()).findByText(CURRENT_TITLE)
    else await screen.findByText(CURRENT_TITLE)
  })
}

test('a late inbox response cannot replace the current authority response', async () => {
  setAccessToken('access-user')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const first = gate()
  let requested = false
  let changed = false
  server.use(http.get('*/api/v1/notifications', async ({ request }) => {
    const old = !changed
    requested = true
    if (old) await first.promise
    return HttpResponse.json({ content: [notice(old ? OLD_TITLE : CURRENT_TITLE)], page: 0,
      size: Number(new URL(request.url).searchParams.get('size') ?? 20), totalElements: 1, totalPages: 1 })
  }), http.get('*/api/v1/notifications/unread-count', () => HttpResponse.json({ unreadCount: 0 })))
  const view = render(harness('inbox', client, actor(regularProfile, 'before')))
  await waitFor(() => expect(requested).toBe(true))
  changed = true
  view.rerender(harness('inbox', client, actor(regularProfile, 'after')))
  await act(async () => { first.release(); await first.promise })
  await waitFor(() => expect(client.isFetching()).toBe(0))
  expect(screen.queryByText(OLD_TITLE)).not.toBeInTheDocument()
  await screen.findByText(CURRENT_TITLE)
})

test('an unobserved unread count is not presented as a confirmed zero', async () => {
  setAccessToken('access-user')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const pending = gate()
  let requested = false
  server.use(http.get('*/api/v1/notifications/unread-count', async () => {
    requested = true
    await pending.promise
    return HttpResponse.json({ unreadCount: 0 })
  }))
  render(harness('inbox', client, actor(regularProfile, 'current')))
  try {
    await waitFor(() => expect(requested).toBe(true))
    expect(screen.queryByRole('button', { name: '읽지 않은 알림 0개' })).not.toBeInTheDocument()
  } finally { pending.release() }
  await screen.findByRole('button', { name: '읽지 않은 알림 0개' })
})

test('a failed current unread refresh exposes neither cached private count nor a false zero', async () => {
  setAccessToken('access-user')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let fail = false
  server.use(http.get('*/api/v1/notifications/unread-count', () => fail
    ? HttpResponse.json({ type: 'about:blank', title: '조회 실패', status: 503, code: 'SERVICE_UNAVAILABLE', detail: '현재 알림 수를 확인하지 못했습니다.' }, { status: 503 })
    : HttpResponse.json({ unreadCount: 7 })))
  render(harness('inbox', client, actor(regularProfile, 'current')))
  await screen.findByRole('button', { name: '읽지 않은 알림 7개' })
  fail = true
  await act(async () => { await client.invalidateQueries({ queryKey: ['notifications'] }) })
  await waitFor(() => {
    expect(screen.queryByRole('button', { name: '읽지 않은 알림 7개' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '읽지 않은 알림 0개' })).not.toBeInTheDocument()
  })
})


test.each(['same account', 'different account'] as const)('a failed authority check preserves legacy rows only for the %s', async (transition) => {
  setAccessToken('access-user')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const pending = gate()
  let changed = false
  const legacy = { ...notice('이전 일반 안내'), id: uuid(9911), event: 'announcement', body: '기존 수신 정책의 일반 안내 본문', linkPath: null }
  server.use(http.get('*/api/v1/notifications', async ({ request }) => {
    if (changed) {
      await pending.promise
      return HttpResponse.json({ type: 'about:blank', title: '조회 실패', status: 503, code: 'SERVICE_UNAVAILABLE',
        detail: '현재 알림 목록을 확인하지 못했습니다.' }, { status: 503 })
    }
    return HttpResponse.json({ content: [notice(OLD_TITLE), legacy], page: 0,
      size: Number(new URL(request.url).searchParams.get('size') ?? 20), totalElements: 2, totalPages: 1 })
  }), http.get('*/api/v1/notifications/unread-count', async () => {
    if (changed) { await pending.promise; return new HttpResponse(null, { status: 503 }) }
    return HttpResponse.json({ unreadCount: 7 })
  }))
  const view = render(harness('inbox', client, actor(regularProfile, 'before')))
  await screen.findByText('이전 일반 안내')
  await screen.findByText(OLD_TITLE)
  changed = true
  if (transition === 'different account') setAccessToken('access-user-b')
  try {
    view.rerender(harness('inbox', client, actor(transition === 'same account' ? regularProfile : regularProfileB, 'after')))
    if (transition === 'same account') expect(screen.queryByText('이전 일반 안내')).toBeInTheDocument()
    else expect(screen.queryByText('이전 일반 안내')).not.toBeInTheDocument()
    expect(screen.queryByText(OLD_TITLE)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '읽지 않은 알림 7개' })).not.toBeInTheDocument()
  } finally { pending.release() }
  await screen.findByText('현재 알림 목록을 확인하지 못했습니다.')
  if (transition === 'same account') expect(screen.getByText('이전 일반 안내')).toBeInTheDocument()
  else expect(screen.queryByText('이전 일반 안내')).not.toBeInTheDocument()
  expect(screen.queryByText(OLD_TITLE)).not.toBeInTheDocument()
})
