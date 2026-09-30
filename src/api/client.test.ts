import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { api, getCsrfToken, refreshSession } from './client'
import type { Problem } from './problem'
import { onMaintenanceDetected } from './maintenance'
import { onMfaEnrollmentRequired, resetMfaEnrollmentRequired } from './mfa-enrollment'
import { clearAccessToken, getAccessToken, onSessionExpired, setAccessToken } from './token'
import { server } from '../test/msw/server'
import {
  refreshSuccessHandler,
  regularProfile,
} from '../test/msw/handlers/auth'

beforeEach(() => {
  setAccessToken(null)
  resetMfaEnrollmentRequired()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

describe('api client auth behavior', () => {
  test('attaches the bearer token to requests', async () => {
    setAccessToken('access-user')
    const { data, error } = await api.GET('/me')
    expect(error).toBeUndefined()
    expect(data).toEqual(regularProfile)
  })

  test('on 401, refreshes once and retries the original request', async () => {
    const refreshCalls = vi.fn()
    server.use(refreshSuccessHandler('access-user', undefined, refreshCalls))

    setAccessToken('stale-token')
    const { data, error } = await api.GET('/me')

    expect(error).toBeUndefined()
    expect(data).toEqual(regularProfile)
    expect(refreshCalls).toHaveBeenCalledTimes(1)
    expect(getAccessToken()).toBe('access-user')
  })

  test('parallel 401s share a single refresh (single-flight)', async () => {
    const refreshCalls = vi.fn()
    server.use(refreshSuccessHandler('access-user', undefined, refreshCalls))

    setAccessToken('stale-token')
    const [a, b] = await Promise.all([api.GET('/me'), api.GET('/me')])

    expect(a.data).toEqual(regularProfile)
    expect(b.data).toEqual(regularProfile)
    expect(refreshCalls).toHaveBeenCalledTimes(1)
  })

  test('a late refresh cannot restore the token after logout', async () => {
    const started = deferred<void>()
    const release = deferred<void>()
    server.use(http.post('*/api/v1/auth/refresh', async () => {
      started.resolve()
      await release.promise
      return HttpResponse.json({ accessToken: 'access-user', user: regularProfile })
    }))
    setAccessToken('stale-token')
    const refreshing = refreshSession()
    await started.promise

    clearAccessToken()
    release.resolve()

    expect(await refreshing).toBe(false)
    expect(getAccessToken()).toBeNull()
  })

  test('a failed refresh from the previous account does not expire a newer login', async () => {
    const started = deferred<void>()
    const release = deferred<void>()
    const expired = vi.fn()
    const unsubscribe = onSessionExpired(expired)
    server.use(http.post('*/api/v1/auth/refresh', async () => {
      started.resolve()
      await release.promise
      return new HttpResponse(null, { status: 401 })
    }))
    try {
      setAccessToken('stale-token')
      const previousRequest = api.GET('/me')
      await started.promise

      setAccessToken('access-user-b')
      release.resolve()

      expect((await previousRequest).error).toBeDefined()
      expect(expired).not.toHaveBeenCalled()
      expect(getAccessToken()).toBe('access-user-b')
    } finally {
      release.resolve()
      unsubscribe()
    }
  })

  test('a late 401 from the previous account does not refresh or expire a newer login', async () => {
    const started = deferred<void>()
    const release = deferred<void>()
    const refreshCalls = vi.fn()
    const expired = vi.fn()
    const unsubscribe = onSessionExpired(expired)
    server.use(
      http.get('*/api/v1/me', async () => {
        started.resolve()
        await release.promise
        return new HttpResponse(null, { status: 401 })
      }),
      refreshSuccessHandler('access-user', undefined, refreshCalls),
    )
    try {
      setAccessToken('stale-token')
      const previousRequest = api.GET('/me')
      await started.promise

      setAccessToken('access-user-b')
      release.resolve()
      await previousRequest

      expect(refreshCalls).not.toHaveBeenCalled()
      expect(expired).not.toHaveBeenCalled()
      expect(getAccessToken()).toBe('access-user-b')
    } finally {
      release.resolve()
      unsubscribe()
    }
  })

  test('a new session gets its own refresh while an older one is in flight', async () => {
    const started = deferred<void>()
    const release = deferred<void>()
    let refreshCalls = 0
    server.use(http.post('*/api/v1/auth/refresh', async () => {
      refreshCalls += 1
      if (refreshCalls === 1) {
        started.resolve()
        await release.promise
        return HttpResponse.json({ accessToken: 'access-user', user: regularProfile })
      }
      return HttpResponse.json({ accessToken: 'access-user-b', user: regularProfile })
    }))
    setAccessToken('stale-token')
    const previousRefresh = refreshSession()
    await started.promise

    setAccessToken('new-stale-token')
    const nextRefresh = refreshSession()
    await Promise.resolve()
    expect(refreshCalls).toBe(1)
    release.resolve()

    expect(await previousRefresh).toBe(false)
    expect(await nextRefresh).toBe(true)
    expect(refreshCalls).toBe(2)
    expect(getAccessToken()).toBe('access-user-b')
  })

  const sessionSignals = [
    { status: 403, code: 'MFA_ENROLLMENT_REQUIRED', subscribe: onMfaEnrollmentRequired },
    { status: 503, code: 'MAINTENANCE_MODE', subscribe: onMaintenanceDetected },
  ]

  test.each(sessionSignals)('ignores a late $code response from the previous session', async ({ status, code, subscribe }) => {
    const started = deferred<void>()
    const release = deferred<void>()
    const notified = vi.fn()
    const unsubscribe = subscribe(notified)
    server.use(http.get('*/api/v1/notifications/unread-count', async () => {
      started.resolve()
      await release.promise
      return HttpResponse.json({ type: 'about:blank', title: 'test', status, code }, { status })
    }))
    try {
      setAccessToken('access-user')
      const previousRequest = api.GET('/notifications/unread-count')
      await started.promise

      setAccessToken('access-user-b')
      release.resolve()
      await previousRequest

      expect(notified).not.toHaveBeenCalled()
    } finally {
      release.resolve()
      unsubscribe()
    }
  })

  test.each(sessionSignals)('ignores $code when the session changes during problem parsing', async ({ status, code, subscribe }) => {
    const problem = { type: 'about:blank', title: 'test', status, code }
    const response = HttpResponse.json(problem, { status })
    const clone = response.clone()
    const parsing = deferred<unknown>()
    vi.spyOn(response, 'clone').mockReturnValue(clone)
    vi.spyOn(clone, 'json').mockImplementation(() => parsing.promise)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
    const notified = vi.fn()
    const unsubscribe = subscribe(notified)
    try {
      setAccessToken('access-user')
      await api.GET('/notifications/unread-count')

      setAccessToken('access-user-b')
      parsing.resolve(problem)
      await parsing.promise

      expect(notified).not.toHaveBeenCalled()
    } finally {
      parsing.resolve(problem)
      fetchSpy.mockRestore()
      unsubscribe()
    }
  })

  test('failed refresh clears the token and notifies session expiry', async () => {
    const expired = vi.fn()
    const unsubscribe = onSessionExpired(expired)
    try {
      setAccessToken('stale-token')
      const { error } = await api.GET('/me')

      expect(error).toBeDefined()
      expect(expired).toHaveBeenCalledTimes(1)
      expect(getAccessToken()).toBeNull()
    } finally {
      unsubscribe()
    }
  })

  test('a 401 after a successful refresh also expires the session', async () => {
    const expired = vi.fn()
    const unsubscribe = onSessionExpired(expired)
    try {
      // Refresh "succeeds" but issues a token /me still rejects.
      server.use(refreshSuccessHandler('still-rejected-token'))
      setAccessToken('stale-token')
      const { error } = await api.GET('/me')

      expect(error).toBeDefined()
      expect(expired).toHaveBeenCalledTimes(1)
      expect(getAccessToken()).toBeNull()
    } finally {
      unsubscribe()
    }
  })

  test('a 401 from login does not trigger a refresh attempt', async () => {
    const refreshCalls = vi.fn()
    server.use(refreshSuccessHandler('access-user', undefined, refreshCalls))

    const { error } = await api.POST('/auth/login', {
      body: { email: 'example@pusan.ac.kr', password: 'wrong-password' },
    })

    // Compile-time contract: openapi-fetch derives the error channel from the
    // operation's `default` response, which the generated spec types as Problem.
    // This annotation fails to compile if the error shape is not Problem-shaped.
    const problemError: Problem | undefined = error
    expect(problemError?.code).toBe('AUTH_INVALID_CREDENTIALS')
    expect(refreshCalls).not.toHaveBeenCalled()
  })

  // 재시도는 원 요청이 아니라 미리 떠 둔 clone 을 보낸다. 본문을 이미 읽은
  // 스트림은 두 번 못 보내므로, clone 이 사라지면 GET 은 멀쩡한데 본문 있는
  // 요청만 조용히 빈 몸으로 나간다. 이 스위트의 나머지가 전부 GET 이라
  // 그 회귀를 잡는 것은 이 한 건뿐이다.
  test('본문이 있는 요청도 401 갱신 재시도에서 본문이 보존된다', async () => {
    const seen: unknown[] = []
    server.use(
      refreshSuccessHandler('access-user'),
      http.put('*/api/v1/me/profile', async ({ request }) => {
        const auth = request.headers.get('Authorization')
        seen.push(await request.json())
        if (auth !== 'Bearer access-user') {
          return HttpResponse.json({ code: 'AUTH_TOKEN_EXPIRED' }, { status: 401 })
        }
        return HttpResponse.json(regularProfile, { status: 200 })
      }),
    )

    setAccessToken('stale-token')
    const { error } = await api.PUT('/me/profile', { body: { name: '홍길동' } })

    expect(error).toBeUndefined()
    expect(seen).toEqual([{ name: '홍길동' }, { name: '홍길동' }])
  })
})

describe('getCsrfToken', () => {
  const setCookie = (value: string) => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => value,
    })
  }

  test('reads the __Host- prefixed CSRF cookie', () => {
    setCookie('other=1; __Host-pickle_csrf=abc123; another=2')
    expect(getCsrfToken()).toBe('abc123')
  })

  test('reads it when it is the only cookie', () => {
    setCookie('__Host-pickle_csrf=solo')
    expect(getCsrfToken()).toBe('solo')
  })

  test('percent-decodes the value', () => {
    setCookie('__Host-pickle_csrf=a%2Fb')
    expect(getCsrfToken()).toBe('a/b')
  })

  // The name is matched whole: a leftover unprefixed cookie is a different
  // cookie, and echoing its value would fail the server-side double-submit check.
  test('ignores an unprefixed pickle_csrf cookie', () => {
    setCookie('pickle_csrf=stale-value')
    expect(getCsrfToken()).toBe('')
  })
})
