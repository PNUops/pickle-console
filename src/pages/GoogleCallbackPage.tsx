import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api } from '../api/client'
import { isProblem } from '../api/problem'
import { setAccessToken } from '../api/token'
import type { UserRole } from '../auth/auth-context'
import { homePathFor, useAuth } from '../auth/auth-context'
import { TransitionLink } from '../components/TransitionLink'
import { Alert, Spinner } from '../components/ui'
import { AuthCard, AuthCardContent } from '../layouts/AuthLayout'
import { takeReturnTo } from '../lib/google-oauth'
import { safeInternalPath } from '../lib/redirect'
import { schedulePostLoginOverlay } from '../lib/storage-keys'

/** 구글이 코드 대신 오류를 돌려줄 때 사용자가 읽을 수 있는 문장으로 바꾼다. */
const GOOGLE_ERRORS: Record<string, string> = {
  access_denied: '구글 로그인을 취소했습니다.',
}

/**
 * 구글이 돌아오는 콘솔 페이지.
 *
 * api 는 리다이렉트를 발행하지 않는다. 구글은 이 주소로 돌아오고, 이 화면이 `code`와
 * `state`를 같은 오리진으로 POST 한다. 그래야 세션 쿠키가 크로스사이트 내비게이션이 아니라
 * 보통의 same-site 응답에 실리고, 액세스 토큰이 URL 을 타지 않는다.
 *
 * 이 라우트가 따로 있는 첫째 이유는 **오류를 설명할 자리**다. 도메인 밖 계정이나 비활성
 * 계정은 여기서 이유를 읽는다. api 가 콘솔 홈으로 바로 보내면 비인증 상태로 착지해
 * 로그인 화면으로 튕기고, 왜 안 됐는지는 어디에도 남지 않는다.
 */
export function GoogleCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()
  const [error, setError] = useState<string | null>(null)
  // StrictMode 의 이중 실행에서 코드를 두 번 쓰지 않게 한다. state 는 단회 소비라
  // 두 번째 호출은 410 을 받는다.
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    const googleError = params.get('error')
    if (googleError) {
      setError(GOOGLE_ERRORS[googleError] ?? '구글 로그인에 실패했습니다.')
      return
    }
    const code = params.get('code')
    const state = params.get('state')
    if (!code || !state) {
      setError('로그인 정보가 없습니다. 처음부터 다시 시도해 주세요.')
      return
    }

    void (async () => {
      try {
        const { data, error: problem } = await api.POST('/auth/oauth/google/callback', {
          body: { code, state },
        })
        if (!data) {
          setError(
            (isProblem(problem) ? (problem.detail ?? problem.title) : null) ??
              '구글 로그인에 실패했습니다.',
          )
          return
        }
        const outcome = data as Record<string, unknown>

        if (typeof outcome.registrationToken === 'string') {
          // 계정이 없는 검증된 신원. 온보딩 폼이 약관 동의와 프로필을 받는다.
          navigate('/google-onboarding', { replace: true, state: { registration: outcome } })
          return
        }
        if (typeof outcome.mfaToken === 'string') {
          navigate('/login', { replace: true, state: { mfaToken: outcome.mfaToken } })
          return
        }
        if (typeof outcome.accessToken === 'string') {
          setAccessToken(outcome.accessToken)
          await refreshProfile()
          // 다크 인증에서 라이트 콘솔로 넘어가는 1회 연출. 비밀번호 로그인만 이걸
          // 예약하면 구글 로그인에서만 화면이 툭 바뀐다.
          schedulePostLoginOverlay()
          const role = (outcome.user as { role?: UserRole } | undefined)?.role ?? 'USER'
          navigate(safeInternalPath(takeReturnTo()) ?? homePathFor(role), { replace: true })
          return
        }
        setError('구글 로그인 응답을 이해하지 못했습니다.')
      } catch {
        setError('구글 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      }
    })()
  }, [params, navigate, refreshProfile])

  return (
    <div className="w-full">
      <h1 className="text-center text-2xl font-bold text-white">
        {error ? '로그인하지 못했습니다' : '로그인 중입니다'}
      </h1>
      <AuthCard className="mt-8">
        <AuthCardContent>
          {error ? (
            <div className="space-y-4">
              <Alert variant="danger">{error}</Alert>
              <p className="text-center text-sm">
                <TransitionLink to="/login" className="font-medium text-primary-300 hover:underline">
                  로그인 화면으로 돌아가기
                </TransitionLink>
              </p>
            </div>
          ) : (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}
        </AuthCardContent>
      </AuthCard>
    </div>
  )
}
