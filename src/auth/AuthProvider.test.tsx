import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { api, getCsrfToken, refreshSession, withSessionCookieOrder } from '../api/client'
import { clearAccessToken, getAccessToken, notifySessionExpired, setAccessToken } from '../api/token'
import { regularProfile, regularProfileB } from '../test/msw/handlers/auth'
import { AuthProvider } from './AuthProvider'
import { useAuth, type AuthContextValue, type UserProfile } from './auth-context'

vi.mock('../api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/client')>(),
  api: { GET: vi.fn(), POST: vi.fn() },
  getCsrfToken: vi.fn(() => ''),
  refreshSession: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let auth: AuthContextValue

function Probe() {
  auth = useAuth()
  return <output data-testid="auth-state">{auth.status}:{auth.user?.id ?? ''}</output>
}

function renderAuth() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider><Probe /></AuthProvider>
    </QueryClientProvider>,
  )
  return { ...view, queryClient }
}

async function authenticate(profile = regularProfile, token = 'access-user') {
  vi.mocked(api.POST).mockResolvedValueOnce({ data: { accessToken: token, user: profile } } as never)
  vi.mocked(api.GET).mockResolvedValueOnce({ data: profile } as never)
  await act(async () => { await auth.login(profile.email, 'password') })
  expect(auth.user).toEqual(profile)
}

beforeEach(() => {
  vi.mocked(refreshSession).mockReset().mockResolvedValue(false)
  vi.mocked(api.GET).mockReset()
  vi.mocked(api.POST).mockReset().mockResolvedValue({} as never)
  vi.mocked(getCsrfToken).mockReset().mockReturnValue('')
})

describe('AuthProvider session transitions', () => {
  test('updates the profile in the current authenticated session', async () => {
    renderAuth()
    await waitFor(() => expect(auth.status).toBe('unauthenticated'))
    await authenticate()
    const updated = { ...regularProfile, mfaEnabled: true }
    vi.mocked(api.GET).mockResolvedValueOnce({ data: updated } as never)

    await act(async () => { await auth.refreshProfile() })

    expect(auth.status).toBe('authenticated')
    expect(auth.user).toEqual(updated)
    expect(getAccessToken()).toBe('access-user')
  })

  test('clears account caches when external credentials refresh a different profile', async () => {
    const { queryClient } = renderAuth()
    await waitFor(() => expect(auth.status).toBe('unauthenticated'))
    await authenticate()
    queryClient.setQueryData(['previous-account'], 'private data')
    setAccessToken('access-user-b')
    vi.mocked(api.GET).mockResolvedValueOnce({ data: regularProfileB } as never)

    await act(async () => { await auth.refreshProfile() })

    expect(auth.user).toEqual(regularProfileB)
    expect(queryClient.getQueryData(['previous-account'])).toBeUndefined()
    expect(getAccessToken()).toBe('access-user-b')
  })

  test('discards a late profile as soon as logout starts', async () => {
    const { queryClient } = renderAuth()
    await waitFor(() => expect(auth.status).toBe('unauthenticated'))
    await authenticate()
    queryClient.setQueryData(['previous-account'], 'private data')
    const profile = deferred<{ data: UserProfile }>()
    const revocation = deferred<never>()
    vi.mocked(api.GET).mockImplementationOnce(() => profile.promise as never)
    vi.mocked(api.POST).mockImplementationOnce(() => revocation.promise)
    let refreshing!: Promise<void>
    act(() => { refreshing = auth.refreshProfile() })
    const options = vi.mocked(api.GET).mock.lastCall?.[1] as { signal?: AbortSignal } | undefined
    const signal = options?.signal
    let loggingOut!: Promise<void>

    act(() => { loggingOut = auth.logout() })

    expect(signal?.aborted).toBe(true)
    expect(auth.status).toBe('unauthenticated')
    expect(auth.user).toBeNull()
    expect(getAccessToken()).toBeNull()
    expect(queryClient.getQueryData(['previous-account'])).toBeUndefined()
    await act(async () => {
      profile.resolve({ data: regularProfile })
      await refreshing
      revocation.resolve({} as never)
      await loggingOut
    })
    expect(screen.getByTestId('auth-state')).toHaveTextContent('unauthenticated:')
  })

  test('discards a late profile after session expiry', async () => {
    renderAuth()
    await waitFor(() => expect(auth.status).toBe('unauthenticated'))
    await authenticate()
    const profile = deferred<{ data: UserProfile }>()
    vi.mocked(api.GET).mockImplementationOnce(() => profile.promise as never)
    let refreshing!: Promise<void>
    act(() => { refreshing = auth.refreshProfile() })

    act(() => {
      clearAccessToken()
      notifySessionExpired()
    })
    await act(async () => {
      profile.resolve({ data: regularProfile })
      await refreshing
    })

    expect(auth.status).toBe('unauthenticated')
    expect(auth.user).toBeNull()
    expect(getAccessToken()).toBeNull()
  })

  test('does not replace a new account with a late profile from the previous one', async () => {
    renderAuth()
    await waitFor(() => expect(auth.status).toBe('unauthenticated'))
    await authenticate()
    const profile = deferred<{ data: UserProfile }>()
    vi.mocked(api.GET).mockImplementationOnce(() => profile.promise as never)
    let refreshing!: Promise<void>
    act(() => { refreshing = auth.refreshProfile() })

    await authenticate(regularProfileB, 'access-user-b')
    await act(async () => {
      profile.resolve({ data: regularProfile })
      await refreshing
    })

    expect(auth.user).toEqual(regularProfileB)
    expect(getAccessToken()).toBe('access-user-b')
  })

  test('does not install a late login token after logout', async () => {
    renderAuth()
    await waitFor(() => expect(auth.status).toBe('unauthenticated'))
    const login = deferred<never>()
    vi.mocked(api.POST).mockImplementationOnce(() => login.promise)
    let loggingIn!: Promise<unknown>
    act(() => { loggingIn = auth.login(regularProfile.email, 'password').catch((error: unknown) => error) })
    await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(1))

    let loggingOut!: Promise<void>
    act(() => { loggingOut = auth.logout() })
    await act(async () => {
      login.resolve({ data: { accessToken: 'access-user', user: regularProfile } } as never)
      expect(await loggingIn).toBeInstanceOf(Error)
      await loggingOut
    })

    expect(auth.status).toBe('unauthenticated')
    expect(getAccessToken()).toBeNull()
    expect(api.GET).not.toHaveBeenCalled()
  })

  test('does not clear a new login when an earlier login profile fails late', async () => {
    renderAuth()
    await waitFor(() => expect(auth.status).toBe('unauthenticated'))
    const profile = deferred<never>()
    vi.mocked(api.POST).mockResolvedValueOnce({ data: { accessToken: 'access-user', user: regularProfile } } as never)
    vi.mocked(api.GET).mockImplementationOnce(() => profile.promise)
    let loggingIn!: Promise<unknown>
    act(() => { loggingIn = auth.login(regularProfile.email, 'password').catch((error: unknown) => error) })
    await waitFor(() => expect(api.GET).toHaveBeenCalledTimes(1))

    await authenticate(regularProfileB, 'access-user-b')
    await act(async () => {
      profile.reject(new TypeError('Failed to fetch'))
      expect(await loggingIn).toBeInstanceOf(Error)
    })

    expect(auth.user).toEqual(regularProfileB)
    expect(getAccessToken()).toBe('access-user-b')
  })

  test('ignores session restore after an explicit login completes', async () => {
    const restore = deferred<boolean>()
    vi.mocked(refreshSession).mockImplementationOnce(() => restore.promise)
    renderAuth()
    expect(auth.status).toBe('loading')

    await authenticate(regularProfileB, 'access-user-b')
    await act(async () => { restore.resolve(false) })

    expect(auth.user).toEqual(regularProfileB)
    expect(getAccessToken()).toBe('access-user-b')
    expect(api.GET).toHaveBeenCalledTimes(1)
  })

  test('does not clear a new session on a late restore profile error', async () => {
    vi.mocked(refreshSession).mockResolvedValueOnce(true)
    const profile = deferred<never>()
    vi.mocked(api.GET).mockImplementationOnce(() => profile.promise)
    renderAuth()
    await waitFor(() => expect(api.GET).toHaveBeenCalledTimes(1))

    await authenticate(regularProfileB, 'access-user-b')
    await act(async () => { profile.reject(new TypeError('Failed to fetch')) })

    expect(auth.user).toEqual(regularProfileB)
    expect(getAccessToken()).toBe('access-user-b')
  })

  test('does not install a late MFA token after logout', async () => {
    renderAuth()
    await waitFor(() => expect(auth.status).toBe('unauthenticated'))
    const mfa = deferred<never>()
    vi.mocked(api.POST).mockImplementationOnce(() => mfa.promise)
    let completing!: Promise<unknown>
    act(() => { completing = auth.completeMfa({ mfaToken: 'challenge', code: '123456' }).catch((error: unknown) => error) })
    await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(1))

    let loggingOut!: Promise<void>
    act(() => { loggingOut = auth.logout() })
    await act(async () => {
      mfa.resolve({ data: { accessToken: 'access-user', user: regularProfile } } as never)
      expect(await completing).toBeInstanceOf(Error)
      await loggingOut
    })

    expect(auth.status).toBe('unauthenticated')
    expect(getAccessToken()).toBeNull()
  })

  test.each(['login', 'MFA'])('waits for cookie revocation before a new %s POST', async (method) => {
    renderAuth()
    await waitFor(() => expect(auth.status).toBe('unauthenticated'))
    await authenticate()
    vi.mocked(api.POST).mockClear()
    const revocation = deferred<never>()
    vi.mocked(api.POST).mockImplementationOnce(() => revocation.promise)
    let loggingOut!: Promise<void>
    act(() => { loggingOut = auth.logout() })
    vi.mocked(api.POST).mockResolvedValueOnce({ data: { accessToken: 'access-user-b', user: regularProfileB } } as never)
    vi.mocked(api.GET).mockResolvedValueOnce({ data: regularProfileB } as never)
    let authenticating!: Promise<unknown>

    await act(async () => {
      authenticating = method === 'login'
        ? auth.login(regularProfileB.email, 'password')
        : auth.completeMfa({ mfaToken: 'challenge', code: '123456' })
      await Promise.resolve()
    })
    expect(api.POST).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.POST).mock.calls[0]?.[0]).toBe('/auth/logout')
    expect(auth.status).toBe('unauthenticated')
    expect(getAccessToken()).toBeNull()
    await act(async () => {
      revocation.resolve({} as never)
      await Promise.all([loggingOut, authenticating])
    })

    expect(vi.mocked(api.POST).mock.calls[1]?.[0]).toBe(method === 'login' ? '/auth/login' : '/auth/mfa')
    expect(auth.user).toEqual(regularProfileB)
    expect(getAccessToken()).toBe('access-user-b')
  })

  test('allows a queued login after logout network failure without restoring the old session', async () => {
    renderAuth()
    await waitFor(() => expect(auth.status).toBe('unauthenticated'))
    await authenticate()
    const revocation = deferred<never>()
    vi.mocked(api.POST).mockImplementationOnce(() => revocation.promise)
    let loggingOut!: Promise<unknown>
    act(() => { loggingOut = auth.logout().catch((error: unknown) => error) })
    vi.mocked(api.POST).mockResolvedValueOnce({ data: { accessToken: 'access-user-b', user: regularProfileB } } as never)
    vi.mocked(api.GET).mockResolvedValueOnce({ data: regularProfileB } as never)
    let loggingIn!: Promise<unknown>
    act(() => { loggingIn = auth.login(regularProfileB.email, 'password') })
    expect(auth.status).toBe('unauthenticated')

    await act(async () => {
      revocation.reject(new TypeError('Failed to fetch'))
      expect(await loggingOut).toBeInstanceOf(Error)
      await loggingIn
    })

    expect(auth.user).toEqual(regularProfileB)
    expect(getAccessToken()).toBe('access-user-b')
  })

  test('skips a cancelled login before issuing its queued credentials', async () => {
    renderAuth()
    await waitFor(() => expect(auth.status).toBe('unauthenticated'))
    const revocation = deferred<never>()
    vi.mocked(api.POST).mockImplementationOnce(() => revocation.promise)
    let loggingOut!: Promise<void>
    act(() => { loggingOut = auth.logout() })
    await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(1))
    let previousLogin!: Promise<unknown>
    let nextLogin!: Promise<unknown>
    act(() => { previousLogin = auth.login(regularProfile.email, 'password').catch((error: unknown) => error) })
    vi.mocked(api.POST).mockResolvedValueOnce({ data: { accessToken: 'access-user-b', user: regularProfileB } } as never)
    vi.mocked(api.GET).mockResolvedValueOnce({ data: regularProfileB } as never)
    act(() => { nextLogin = auth.login(regularProfileB.email, 'password') })

    await act(async () => {
      revocation.resolve({} as never)
      await Promise.all([loggingOut, nextLogin])
      expect(await previousLogin).toBeInstanceOf(Error)
    })

    expect(api.POST).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.POST).mock.calls[1]?.[1]).toMatchObject({ body: { email: regularProfileB.email } })
    expect(auth.user).toEqual(regularProfileB)
  })

  test('waits for existing cookie rotation and reads CSRF only when logout is issued', async () => {
    renderAuth()
    await waitFor(() => expect(auth.status).toBe('unauthenticated'))
    await authenticate()
    vi.mocked(api.POST).mockClear()
    const rotation = deferred<void>()
    const refreshing = withSessionCookieOrder(() => rotation.promise)
    let loggingOut!: Promise<void>
    act(() => { loggingOut = auth.logout() })
    expect(auth.status).toBe('unauthenticated')
    expect(getAccessToken()).toBeNull()
    expect(api.POST).not.toHaveBeenCalled()

    vi.mocked(getCsrfToken).mockReturnValue('rotated-csrf')
    await act(async () => {
      rotation.resolve()
      await Promise.all([refreshing, loggingOut])
    })

    expect(vi.mocked(api.POST).mock.lastCall?.[1]).toMatchObject({
      params: { header: { 'X-Pickle-Csrf': 'rotated-csrf' } },
    })
  })
})
