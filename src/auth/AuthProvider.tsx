import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, getCsrfToken, refreshSession } from '../api/client'
import { toApiError } from '../api/problem'
import { guardNetwork } from '../api/queries'
import { resetMfaEnrollmentRequired } from '../api/mfa-enrollment'
import { clearReauthToken } from '../api/reauth'
import { clearAccessToken, onSessionExpired, setAccessToken } from '../api/token'
import { OAUTH_RETURN_TO_KEY } from '../lib/google-oauth'
import { clearDraft } from '../lib/request-draft'
import {
  MFA_NUDGE_DISMISS_KEY,
  POST_LOGIN_OVERLAY_KEY,
} from '../lib/storage-keys'
import { closeTerminalWindows } from '../terminal/openTerminalWindow'
import { AuthContext, type AuthStatus, type LoginResult, type UserProfile } from './auth-context'

interface AuthState {
  status: AuthStatus
  user: UserProfile | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  // 'unauthenticated'로 가는 전환은 예외 없이 상태를 뒤집기 전에 액세스 토큰을
  // 버린다 — 세션 만료 경로는 client.ts의 expireSession이 그 순서를 지킨다.
  // 이 status를 '자격 없음'과 같은 뜻으로 읽는 소비자가 있어서다: NoticeImage는
  // 비로그인일 때만 인증 헤더 없는 <img>로 되돌아가므로, 토큰을 쥔 채 상태만
  // 먼저 뒤집히면 볼 자격이 있는 이미지가 404로 돌아온다.
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null })

  // Session restore on app load: refresh-cookie → access token → /me.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
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
      } catch {
        // /me의 fetch 단계 예외(네트워크 단절 등) — 거부가 밖으로 새면 상태가
        // 'loading'에 영원히 머문다. 토큰을 정리하고 비로그인으로 마감한다.
        clearAccessToken()
        if (!cancelled) setState({ status: 'unauthenticated', user: null })
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
        clearReauthToken()
        resetMfaEnrollmentRequired()
        queryClient.clear()
        setState({ status: 'unauthenticated', user: null })
      }),
    [queryClient],
  )

  // Shared tail for both stage-1 (no 2FA) and stage-2 (/auth/mfa) success: the
  // access token is already set, so fetch /me and flip to authenticated.
  const finishLogin = useCallback(async (): Promise<UserProfile> => {
    const me = await guardNetwork(() => api.GET('/me')).catch((err: unknown) => {
      clearAccessToken()
      throw err
    })
    if (!me.data) {
      clearAccessToken()
      throw toApiError(me.error, '사용자 정보를 불러오지 못했습니다. 다시 로그인해 주세요.')
    }
    // 직전 세션(다른 계정)의 캐시가 새 세션 화면에 렌더링되지 않도록 비운다.
    // 재인증 토큰도 세션에 매인 값이므로 계정이 바뀌면 반드시 버린다.
    clearReauthToken()
    resetMfaEnrollmentRequired()
    queryClient.clear()
    setState({ status: 'authenticated', user: me.data })
    return me.data
  }, [queryClient])

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const { data, error } = await api.POST('/auth/login', { body: { email, password } })
    if (!data) {
      throw toApiError(error, '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    }
    if ('mfaRequired' in data) {
      // 2FA 계정: 토큰 대신 스텝업 챌린지를 반환한다 — LoginPage가 코드 입력
      // 단계로 전환하고 completeMfa로 이어간다.
      return { kind: 'mfaRequired', mfaToken: data.mfaToken }
    }
    setAccessToken(data.accessToken)
    return { kind: 'authenticated', user: await finishLogin() }
  }, [finishLogin])

  const completeMfa = useCallback(
    async (input: { mfaToken: string; code?: string; recoveryCode?: string }) => {
      // guardNetwork so a dropped connection surfaces the Korean network message
      // rather than a raw fetch rejection (consistent with /me in finishLogin).
      const { data, error } = await guardNetwork(() => api.POST('/auth/mfa', { body: input }))
      if (!data) {
        throw toApiError(error, '2단계 인증에 실패했습니다. 다시 시도해 주세요.')
      }
      setAccessToken(data.accessToken)
      return finishLogin()
    },
    [finishLogin],
  )

  const refreshProfile = useCallback(async () => {
    const { data } = await api.GET('/me')
    if (data) setState((prev) => ({ ...prev, status: 'authenticated', user: data }))
  }, [])

  const logout = useCallback(async () => {
    // Revoke the refresh cookie server-side; the endpoint is idempotent, and a
    // network failure must not keep the user "logged in" client-side.
    try {
      await api.POST('/auth/logout', {
        params: { header: { 'X-Pickle-Csrf': getCsrfToken() } },
      })
    } finally {
      clearAccessToken()
      clearReauthToken()
      resetMfaEnrollmentRequired()
      queryClient.clear()
      // 터미널 팝업은 별도 문서라 이 탭이 로그아웃해도 저절로 닫히지 않는다.
      closeTerminalWindows()
      // 같은 탭에서 다음 사용자가 이전 사용자의 신청서 초안을 물려받지 않게 지운다.
      clearDraft()
      // 2FA 권유 배너의 닫음도 같은 이유로 — 다음 사용자는 권유를 다시 봐야 한다.
      sessionStorage.removeItem(MFA_NUDGE_DISMISS_KEY)
      // 구글 왕복용 복귀 경로가 남으면 다음 사용자가 그 경로로 간다. 내부 경로라
      // 오픈 리다이렉트 가드도 통과하므로, 이전 사용자의 VM 상세 주소를 그대로
      // 물려받는다.
      sessionStorage.removeItem(OAUTH_RETURN_TO_KEY)
      sessionStorage.removeItem(POST_LOGIN_OVERLAY_KEY)
      setState({ status: 'unauthenticated', user: null })
    }
  }, [queryClient])

  const value = useMemo(
    () => ({ status: state.status, user: state.user, login, completeMfa, refreshProfile, logout }),
    [state, login, completeMfa, refreshProfile, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
