import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, refreshSession } from '../api/client'
import { toApiError } from '../api/problem'
import { clearAccessToken, onSessionExpired, setAccessToken } from '../api/token'
import { AuthContext, type AuthStatus, type UserProfile } from './auth-context'

interface AuthState {
  status: AuthStatus
  user: UserProfile | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null })

  // Session restore on app load: refresh-cookie → access token → /me.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const restored = await refreshSession()
      if (!restored) {
        if (!cancelled) setState({ status: 'unauthenticated', user: null })
        return
      }
      const { data } = await api.GET('/me')
      if (cancelled) return
      if (data) {
        setState({ status: 'authenticated', user: data })
      } else {
        clearAccessToken()
        setState({ status: 'unauthenticated', user: null })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Fired by the API client when a 401 could not be recovered by a refresh.
  // 세션이 끊기면 캐시도 함께 비워 공용 PC에서 이전 사용자의 데이터가 남지 않게 한다.
  useEffect(
    () =>
      onSessionExpired(() => {
        queryClient.clear()
        setState({ status: 'unauthenticated', user: null })
      }),
    [queryClient],
  )

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await api.POST('/auth/login', { body: { email, password } })
    if (!data) {
      throw toApiError(error, '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    }
    setAccessToken(data.accessToken)
    const me = await api.GET('/me')
    if (!me.data) {
      clearAccessToken()
      throw toApiError(me.error, '사용자 정보를 불러오지 못했습니다. 다시 로그인해 주세요.')
    }
    // 직전 세션(다른 계정)의 캐시가 새 세션 화면에 렌더링되지 않도록 비운다.
    queryClient.clear()
    setState({ status: 'authenticated', user: me.data })
    return me.data
  }, [queryClient])

  const logout = useCallback(async () => {
    // Revoke the refresh cookie server-side; the endpoint is idempotent, and a
    // network failure must not keep the user "logged in" client-side.
    try {
      await api.POST('/auth/logout')
    } finally {
      clearAccessToken()
      queryClient.clear()
      setState({ status: 'unauthenticated', user: null })
    }
  }, [queryClient])

  const value = useMemo(
    () => ({ status: state.status, user: state.user, login, logout }),
    [state, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
