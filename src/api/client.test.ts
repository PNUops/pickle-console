import { beforeEach, describe, expect, test, vi } from 'vitest'
import { api } from './client'
import { getAccessToken, onSessionExpired, setAccessToken } from './token'
import { server } from '../test/msw/server'
import {
  refreshSuccessHandler,
  studentProfile,
} from '../test/msw/handlers/auth'

beforeEach(() => {
  setAccessToken(null)
})

describe('api client auth behavior', () => {
  test('attaches the bearer token to requests', async () => {
    setAccessToken('access-student')
    const { data, error } = await api.GET('/me')
    expect(error).toBeUndefined()
    expect(data).toEqual(studentProfile)
  })

  test('on 401, refreshes once and retries the original request', async () => {
    const refreshCalls = vi.fn()
    server.use(refreshSuccessHandler('access-student', undefined, refreshCalls))

    setAccessToken('stale-token')
    const { data, error } = await api.GET('/me')

    expect(error).toBeUndefined()
    expect(data).toEqual(studentProfile)
    expect(refreshCalls).toHaveBeenCalledTimes(1)
    expect(getAccessToken()).toBe('access-student')
  })

  test('parallel 401s share a single refresh (single-flight)', async () => {
    const refreshCalls = vi.fn()
    server.use(refreshSuccessHandler('access-student', undefined, refreshCalls))

    setAccessToken('stale-token')
    const [a, b] = await Promise.all([api.GET('/me'), api.GET('/me')])

    expect(a.data).toEqual(studentProfile)
    expect(b.data).toEqual(studentProfile)
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

  test('a 401 from login does not trigger a refresh attempt', async () => {
    const refreshCalls = vi.fn()
    server.use(refreshSuccessHandler('access-student', undefined, refreshCalls))

    const { error } = await api.POST('/auth/login', {
      body: { email: 'gildong.hong@pusan.ac.kr', password: 'wrong-password' },
    })

    expect(error?.code).toBe('AUTH_INVALID_CREDENTIALS')
    expect(refreshCalls).not.toHaveBeenCalled()
  })
})
