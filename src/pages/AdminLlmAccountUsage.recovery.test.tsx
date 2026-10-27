import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from '../App'
import type { AdminLlmAccountUsage } from '../api/queries'
import { setAccessToken } from '../api/token'
import { AuthContext, type AuthContextValue, type UserProfile } from '../auth/auth-context'
import { ToastProvider } from '../components/ui'
import { ACCESS_TOKENS, problemResponse, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { accountUsageFixture } from '../test/account-usage-fixture'

const ACCOUNT = uuid(410)
const OLD_KEY = 'Synthetic retained account consumer'

function usage(name = OLD_KEY): AdminLlmAccountUsage {
  return accountUsageFixture({
    from: '2026-09-01', to: '2026-09-30', attributedCostUsd: 1.25,
    requests: 9, pricedRequests: 3, keysUsed: 1, keysLinked: 1,
    points: [{ day: '2026-09-30', attributedCostUsd: 1.25, pricedRequests: 3, requests: 9 }],
    keys: [{ keyId: uuid(171), keyName: name, requests: 9, inputTokens: 12,
      outputTokens: 8, attributedCostUsd: 1.25, pricedRequests: 3 }],
  })
}

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

function renderAccount() {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  return renderApp(`/admin/llm/accounts/${ACCOUNT}?org=${uuid(1)}`)
}

function section() {
  return within(screen.getByRole('heading', { name: '쓰임새' }).closest('section')!)
}

test('retained account usage identifies its actual response window while another window is pending', async () => {
  const user = userEvent.setup()
  const gate = deferred()
  let sevenRequested = false
  server.use(http.get('*/api/v1/admin/llm/accounts/:accountId/usage', async ({ request }) => {
    if (new URL(request.url).searchParams.get('days') === '7') {
      sevenRequested = true
      await gate.promise
    }
    return HttpResponse.json(usage())
  }))
  renderAccount()
  await screen.findByText(OLD_KEY)
  try {
    await user.click(section().getByRole('button', { name: '7일' }))
    await waitFor(() => expect(sevenRequested).toBe(true))
    expect(section().getByText(OLD_KEY)).toBeInTheDocument()
    expect(section().getByText(/2026-09-01.*2026-09-30/)).toBeInTheDocument()
  } finally {
    gate.release()
  }
})

test('a failed new account window preserves the last successful window and offers an explicit retry', async () => {
  const user = userEvent.setup()
  server.use(http.get('*/api/v1/admin/llm/accounts/:accountId/usage', ({ request }) => {
    if (new URL(request.url).searchParams.get('days') === '7') {
      return problemResponse({ type: 'about:blank', title: '조회 실패', status: 503,
        code: 'SERVICE_UNAVAILABLE', detail: '선택한 기간을 조회하지 못했습니다.' })
    }
    return HttpResponse.json(usage())
  }))
  renderAccount()
  await screen.findByText(OLD_KEY)
  await user.click(section().getByRole('button', { name: '7일' }))
  await screen.findByText('선택한 기간을 조회하지 못했습니다.')
  expect.soft(section().queryByText(OLD_KEY)).toBeInTheDocument()
  expect.soft(section().queryByText(/2026-09-01.*2026-09-30/)).toBeInTheDocument()
  expect.soft(section().queryByRole('button', { name: /다시 조회|재시도/ })).toBeInTheDocument()
  const detail = new URL(section().getByRole('link', { name: OLD_KEY }).getAttribute('href')!, 'https://pickle.invalid')
  expect(detail.searchParams.get('days')).toBe('30')
  const origin = new URL(detail.searchParams.get('returnTo')!, 'https://pickle.invalid')
  expect(origin.searchParams.get('days')).toBe('7')
})

test('account usage distinguishes the console GET success moment from producer observation freshness', async () => {
  server.use(http.get('*/api/v1/admin/llm/accounts/:accountId/usage', () => HttpResponse.json(usage())))
  renderAccount()
  await screen.findByText(OLD_KEY)
  expect(section().getByText('콘솔 마지막 GET 성공')).toBeInTheDocument()
})

test('the account consumer does not reuse another reader response in the same institution', async () => {
  setAccessToken('access-sys-admin')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const gate = deferred()
  let requests = 0
  server.use(http.get('*/api/v1/admin/llm/accounts/:accountId/usage', async () => {
    requests += 1
    if (requests > 1) await gate.promise
    return HttpResponse.json(usage(requests === 1 ? OLD_KEY : 'Synthetic next reader consumer'))
  }))
  // This isolates the page's reader boundary. AuthProvider cache cancellation
  // is a separate defense and is deliberately not replaced or judged here.
  const renderReader = (profile: UserProfile) => {
    const auth: AuthContextValue = {
      status: 'authenticated', user: profile,
      login: async () => { throw new Error('Unused credential exchange') },
      completeMfa: async () => { throw new Error('Unused credential exchange') },
      refreshProfile: async () => {}, logout: async () => {},
      beginCredentialExchange: () => { throw new Error('Unused credential exchange') },
    }
    return <MemoryRouter initialEntries={[`/admin/llm/accounts/${ACCOUNT}?org=${uuid(1)}`]}>
      <QueryClientProvider client={client}><AuthContext.Provider value={auth}>
        <ToastProvider><App /></ToastProvider>
      </AuthContext.Provider></QueryClientProvider>
    </MemoryRouter>
  }
  const view = render(renderReader(ACCESS_TOKENS['access-sys-admin']))
  await screen.findByText(OLD_KEY)
  try {
    setAccessToken('access-sys-viewer')
    view.rerender(renderReader(ACCESS_TOKENS['access-sys-viewer']))
    expect(screen.queryByText(OLD_KEY)).not.toBeInTheDocument()
  } finally {
    gate.release()
  }
})

test('a late account usage response cannot cross the actual institution guard', async () => {
  const gate = deferred()
  let requested = false
  let completed = false
  server.use(http.get('*/api/v1/admin/llm/accounts/:accountId/usage', async () => {
    requested = true
    await gate.promise
    completed = true
    return HttpResponse.json(usage('Synthetic late institution consumer'))
  }))
  renderAccount()
  await screen.findByRole('heading', { name: 'AI 교육 사업 A' })
  await waitFor(() => expect(requested).toBe(true))
  fireEvent.change(screen.getByLabelText('관리 기관 선택'), { target: { value: uuid(2) } })
  await screen.findByText('현재 관리 범위에서 이 OpenRouter 사업 계정을 찾을 수 없습니다.')
  await act(async () => { gate.release(); await gate.promise })
  await waitFor(() => expect(completed).toBe(true))
  expect(screen.queryByText('Synthetic late institution consumer')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '쓰임새' })).not.toBeInTheDocument()
})
