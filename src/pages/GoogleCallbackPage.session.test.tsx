import { StrictMode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, test, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import { useAuth, type AuthContextValue } from '../auth/auth-context'
import { RequireRole } from '../auth/RequireRole'
import { getAccessToken } from '../api/token'
import { api, refreshSession, withSessionCookieOrder } from '../api/client'
import { ToastProvider } from '../components/ui'
import { regularProfile, regularUser } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { GoogleCallbackPage } from './GoogleCallbackPage'

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

let auth: AuthContextValue
let navigate: NavigateFunction

function Probe() {
  auth = useAuth()
  navigate = useNavigate()
  return null
}

function renderCallback(strict = false, initialPath = '/auth/google/callback?code=code-existing-account&state=state-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const app = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <ToastProvider>
            <Probe />
            <Routes>
              <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
              <Route path="/console" element={<h1>Home</h1>} />
              <Route path="/hold" element={<h1>Hold</h1>} />
              <Route path="/protected" element={<RequireRole roles={['USER']}><h1>Protected</h1></RequireRole>} />
              <Route path="/login" element={<h1>Logged out</h1>} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(strict ? <StrictMode>{app}</StrictMode> : app)
}

describe('Google callback session races', () => {
  test('issues callback credentials only after the initial refresh response', async () => {
    const started = deferred()
    const release = deferred()
    const callbacks = vi.fn()
    const order: string[] = []
    server.use(
      http.post('*/api/v1/auth/refresh', async () => {
        order.push('refresh started')
        started.resolve()
        await release.promise
        order.push('refresh finished')
        return new HttpResponse(null, { status: 401 })
      }),
      http.post('*/api/v1/auth/oauth/google/callback', () => {
        callbacks()
        order.push('callback')
        return HttpResponse.json({ accessToken: 'access-user', user: regularUser })
      }),
    )
    const refreshing = refreshSession()
    await started.promise
    renderCallback()
    expect(callbacks).not.toHaveBeenCalled()

    release.resolve()
    await refreshing
    await screen.findByRole('heading', { name: 'Home' })

    expect(order).toEqual(['refresh started', 'refresh finished', 'callback'])
    expect(getAccessToken()).toBe('access-user')
  })

  test('discards a callback response after logout and revokes its cookie afterward', async () => {
    const started = deferred()
    const release = deferred()
    const logoutCalls = vi.fn()
    server.use(
      http.post('*/api/v1/auth/oauth/google/callback', async () => {
        started.resolve()
        await release.promise
        return HttpResponse.json({ accessToken: 'access-user', user: regularUser })
      }),
      http.post('*/api/v1/auth/logout', () => {
        logoutCalls()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderCallback()
    await started.promise
    let loggingOut!: Promise<void>
    act(() => { loggingOut = auth.logout() })
    expect(auth.status).toBe('unauthenticated')
    expect(logoutCalls).not.toHaveBeenCalled()

    await act(async () => {
      release.resolve()
      await loggingOut
    })

    expect(logoutCalls).toHaveBeenCalledTimes(1)
    expect(auth.status).toBe('unauthenticated')
    expect(getAccessToken()).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Home' })).not.toBeInTheDocument()
  })

  test('skips callback issuance when logout invalidates it while queued', async () => {
    const started = deferred()
    const release = deferred()
    const callbacks = vi.fn()
    server.use(
      http.post('*/api/v1/auth/refresh', async () => {
        started.resolve()
        await release.promise
        return HttpResponse.json({ accessToken: 'access-user', user: regularUser })
      }),
      http.post('*/api/v1/auth/oauth/google/callback', () => {
        callbacks()
        return HttpResponse.json({ accessToken: 'access-user', user: regularUser })
      }),
    )
    const refreshing = refreshSession()
    await started.promise
    renderCallback()
    let loggingOut!: Promise<void>
    act(() => { loggingOut = auth.logout() })

    await act(async () => {
      release.resolve()
      await Promise.all([refreshing, loggingOut])
    })

    expect(callbacks).not.toHaveBeenCalled()
    expect(auth.status).toBe('unauthenticated')
    expect(getAccessToken()).toBeNull()
  })

  test('consumes the callback code once under StrictMode', async () => {
    const callbacks = vi.fn()
    server.use(http.post('*/api/v1/auth/oauth/google/callback', () => {
      callbacks()
      return HttpResponse.json({ accessToken: 'access-user', user: regularUser })
    }))

    renderCallback(true)
    await screen.findByRole('heading', { name: 'Home' })

    expect(callbacks).toHaveBeenCalledTimes(1)
    expect(auth.status).toBe('authenticated')
  })

  test('accepts callback credentials after the previous restore profile fails late', async () => {
    const profile = deferred<never>()
    const callbackStarted = deferred()
    const callbackRelease = deferred()
    const profileSpy = vi.spyOn(api, 'GET').mockImplementationOnce(() => profile.promise)
    server.use(
      http.post('*/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'access-user', user: regularUser })),
      http.post('*/api/v1/auth/oauth/google/callback', async () => {
        callbackStarted.resolve()
        await callbackRelease.promise
        return HttpResponse.json({ accessToken: 'access-user', user: regularUser })
      }),
    )
    try {
      renderCallback(false, '/hold')
      await waitFor(() => expect(profileSpy).toHaveBeenCalledTimes(1))
      act(() => { void navigate('/auth/google/callback?code=code-existing-account&state=state-1') })
      await callbackStarted.promise

      await act(async () => { profile.reject(new TypeError('Failed to fetch')) })
      expect(getAccessToken()).toBe('access-user')
      callbackRelease.resolve()

      await screen.findByRole('heading', { name: 'Home' })
      expect(auth.status).toBe('authenticated')
      expect(getAccessToken()).toBe('access-user')
    } finally {
      callbackRelease.resolve()
      profileSpy.mockRestore()
    }
  })

  test('settles initial auth loading after leaving an in-flight callback', async () => {
    const profile = deferred<never>()
    const callbackStarted = deferred()
    const callbackRelease = deferred()
    const profileSpy = vi.spyOn(api, 'GET').mockImplementationOnce(() => profile.promise)
    server.use(
      http.post('*/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'access-user', user: regularUser })),
      http.post('*/api/v1/auth/oauth/google/callback', async () => {
        callbackStarted.resolve()
        await callbackRelease.promise
        return HttpResponse.json({ accessToken: 'access-user', user: regularUser })
      }),
    )
    try {
      renderCallback(false, '/hold')
      await waitFor(() => expect(profileSpy).toHaveBeenCalledTimes(1))
      act(() => { void navigate('/auth/google/callback?code=code-existing-account&state=state-1') })
      await callbackStarted.promise
      act(() => { void navigate('/protected') })

      await act(async () => {
        profile.resolve({ data: regularProfile } as never)
        callbackRelease.resolve()
        await withSessionCookieOrder(() => Promise.resolve())
      })

      expect(auth.status).toBe('unauthenticated')
      expect(getAccessToken()).toBeNull()
      expect(await screen.findByRole('heading', { name: 'Logged out' })).toBeInTheDocument()
    } finally {
      callbackRelease.resolve()
      profileSpy.mockRestore()
    }
  })
})
