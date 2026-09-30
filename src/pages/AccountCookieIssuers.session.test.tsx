import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, test, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import { useAuth, type AuthContextValue } from '../auth/auth-context'
import { RequireRole } from '../auth/RequireRole'
import { withSessionCookieOrder } from '../api/client'
import { getAccessToken } from '../api/token'
import { ToastProvider } from '../components/ui'
import { refreshSuccessHandler, regularUser, regularUserB, USER_PASSWORD } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { AccountPage } from './AccountPage'
import { GoogleOnboardingPage } from './GoogleOnboardingPage'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => { resolve = res })
  return { promise, resolve }
}

let auth: AuthContextValue
let navigate: NavigateFunction
function Probe() {
  auth = useAuth()
  navigate = useNavigate()
  return null
}

type Issuer = 'password' | 'registration'
const issuers: Issuer[] = ['password', 'registration']

async function prepare(issuer: Issuer) {
  if (issuer === 'password') server.use(refreshSuccessHandler())
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[issuer === 'password' ? '/console/account' : {
        pathname: '/google-onboarding',
        state: { registration: { registrationToken: 'registration-token-1', email: 'new.google@pusan.ac.kr', name: '가입자' } },
      }]}>
        <AuthProvider>
          <ToastProvider>
            <Probe />
            <Routes>
              <Route path="/console/account" element={<AccountPage />} />
              <Route path="/google-onboarding" element={<GoogleOnboardingPage />} />
              <Route path="/console" element={<h1>Home</h1>} />
              <Route path="/protected" element={<RequireRole roles={['USER']}><h1>Protected</h1></RequireRole>} />
              <Route path="/login" element={<h1>Logged out</h1>} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  if (issuer === 'password') {
    await screen.findByRole('heading', { name: '계정 설정' })
    const row = screen.getByText('비밀번호').closest('div')?.parentElement as HTMLElement
    await user.click(within(row).getByRole('button'))
    await user.type(screen.getByLabelText('현재 비밀번호'), USER_PASSWORD)
    await user.type(screen.getByLabelText('새 비밀번호'), 'brand-new-pass-9!')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'brand-new-pass-9!')
  } else {
    await screen.findByRole('heading', { name: '가입 정보 입력' })
    for (const box of await screen.findAllByRole('checkbox')) await user.click(box)
  }
  return () => user.click(screen.getByRole('button', { name: issuer === 'password' ? '비밀번호 변경' : '가입 완료' }))
}

function handlerFor(issuer: Issuer, operation: () => Promise<Response> | Response) {
  return issuer === 'password'
    ? http.put('*/api/v1/me/password', operation)
    : http.post('*/api/v1/auth/oauth/google/complete', operation)
}

describe('Account credential issuer session races', () => {
  test.each(issuers)('discards a late %s token and revokes its cookie after issuance', async (issuer) => {
    const started = deferred()
    const release = deferred()
    const order: string[] = []
    server.use(
      handlerFor(issuer, async () => {
        started.resolve()
        await release.promise
        order.push('issued')
        return HttpResponse.json({ accessToken: 'access-user', user: regularUser })
      }),
      http.post('*/api/v1/auth/logout', () => {
        order.push('logout')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const submit = await prepare(issuer)
    await submit()
    await started.promise
    let loggingOut!: Promise<void>
    act(() => { loggingOut = auth.logout() })
    expect(getAccessToken()).toBeNull()
    expect(order).toEqual([])

    await act(async () => {
      release.resolve()
      await loggingOut
    })

    expect(order).toEqual(['issued', 'logout'])
    expect(getAccessToken()).toBeNull()
    expect(auth.status).toBe('unauthenticated')
    expect(screen.queryByRole('heading', { name: 'Home' })).not.toBeInTheDocument()
    expect(screen.queryByText(/비밀번호를 변경했습니다/)).not.toBeInTheDocument()
  })

  test.each(issuers)('skips a queued %s issuer after logout', async (issuer) => {
    const issuerCalls = vi.fn()
    server.use(handlerFor(issuer, () => {
      issuerCalls()
      return HttpResponse.json({ accessToken: 'access-user', user: regularUser })
    }))
    const submit = await prepare(issuer)
    const release = deferred()
    const blocking = withSessionCookieOrder(() => release.promise)
    await submit()
    expect(issuerCalls).not.toHaveBeenCalled()
    let loggingOut!: Promise<void>
    act(() => { loggingOut = auth.logout() })

    await act(async () => {
      release.resolve()
      await Promise.all([blocking, loggingOut])
    })

    expect(issuerCalls).not.toHaveBeenCalled()
    expect(getAccessToken()).toBeNull()
    expect(auth.status).toBe('unauthenticated')
  })

  test.each(issuers)('preserves a newer account after a late %s response', async (issuer) => {
    const started = deferred()
    const release = deferred()
    server.use(handlerFor(issuer, async () => {
      started.resolve()
      await release.promise
      return HttpResponse.json({ accessToken: 'access-user', user: regularUser })
    }))
    const submit = await prepare(issuer)
    await submit()
    await started.promise
    let loggingIn!: Promise<unknown>
    act(() => { loggingIn = auth.login(regularUserB.email, USER_PASSWORD) })

    await act(async () => {
      release.resolve()
      await loggingIn
    })

    expect(auth.user?.id).toBe(regularUserB.id)
    expect(getAccessToken()).toBe('access-user-b')
    expect(screen.queryByText(/비밀번호를 변경했습니다/)).not.toBeInTheDocument()
  })

  test('recovers an expired password request through refresh without holding the cookie queue', async () => {
    let passwordCalls = 0
    server.use(http.put('*/api/v1/me/password', () => {
      passwordCalls += 1
      return passwordCalls === 1
        ? HttpResponse.json({ code: 'AUTH_TOKEN_INVALID' }, { status: 401 })
        : HttpResponse.json({ accessToken: 'access-user', user: regularUser })
    }))
    const submit = await prepare('password')
    await submit()

    await screen.findByText(/비밀번호를 변경했습니다/)
    await waitFor(() => expect(passwordCalls).toBe(2))
    expect(getAccessToken()).toBe('access-user')
    expect(auth.status).toBe('authenticated')
  })

  test('settles initial auth loading after leaving an in-flight registration', async () => {
    const profileStarted = deferred()
    const profileRelease = deferred()
    const registrationStarted = deferred()
    const registrationRelease = deferred()
    server.use(
      refreshSuccessHandler(),
      http.get('*/api/v1/me', async () => {
        profileStarted.resolve()
        await profileRelease.promise
        return HttpResponse.json({ ...regularUser, profileComplete: true })
      }),
      handlerFor('registration', async () => {
        registrationStarted.resolve()
        await registrationRelease.promise
        return HttpResponse.json({ accessToken: 'access-user', user: regularUser })
      }),
    )
    const submit = await prepare('registration')
    await profileStarted.promise
    await submit()
    await registrationStarted.promise
    act(() => { void navigate('/protected') })

    await act(async () => {
      profileRelease.resolve()
      registrationRelease.resolve()
      await withSessionCookieOrder(() => Promise.resolve())
    })

    expect(auth.status).toBe('unauthenticated')
    expect(getAccessToken()).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Logged out' })).toBeInTheDocument()
  })
})
