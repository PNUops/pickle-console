import { beforeEach, describe, expect, test, vi } from 'vitest'
import { api } from './client'
import type { Problem } from './problem'
import { getAccessToken, onSessionExpired, setAccessToken } from './token'
import { server } from '../test/msw/server'
import {
  refreshSuccessHandler,
  regularProfile,
} from '../test/msw/handlers/auth'

beforeEach(() => {
  setAccessToken(null)
})

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
})
