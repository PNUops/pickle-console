import { TransitionLink } from '../components/TransitionLink'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchSystemStatus, startGoogleOauth } from '../api/queries'
import { ApiError, toApiError } from '../api/problem'
import { homePathFor, useAuth, type UserProfile } from '../auth/auth-context'
import { ContactEmail } from '../components/ContactEmail'
import { schedulePostLoginOverlay } from '../lib/storage-keys'
import { ResendVerification } from '../components/ResendVerification'
import { Alert, Button, FormField, Input } from '../components/ui'
import { AuthDivider } from '../components/auth/AuthDivider'
import { GoogleAuthButton } from '../components/auth/GoogleAuthButton'
import { navigateExternal, rememberReturnTo, takeReturnTo } from '../lib/google-oauth'
import { safeInternalPath } from '../lib/redirect'
import { AuthCard, AuthCardContent } from '../layouts/AuthLayout'

/** 토글 버튼이 `aria-controls`로 가리키는 비밀번호 폼의 고정 id. */
const PASSWORD_FORM_ID = 'login-password-form'

export function LoginPage() {
  const { status, user, login, completeMfa } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  // 공개 상태(공지 배너·문의처) — 셸과 같은 캐시 키를 공유한다.
  const { data: systemStatus } = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
  })

  // 2FA step-up: non-null once /auth/login returns a challenge.
  // 구글 콜백이 2FA 챌린지를 들고 이 화면으로 넘긴다. 여기서 안 읽으면 2FA 를 켠 계정은
  // 구글로 로그인할 수 없다 — 아무 말 없이 로그인 화면에 떨어지고 토큰은 버려진다.
  const [mfaToken, setMfaToken] = useState<string | null>(
    () => (location.state as { mfaToken?: string } | null)?.mfaToken ?? null,
  )
  const [useRecovery, setUseRecovery] = useState(false)
  // ?method=password 로 들어오면 펼친 채로 연다. 로그인 안내 메일이나 북마크가
  // 비밀번호 경로를 바로 가리킬 수 있게 하는 용도다.
  // 라우터가 주소를 들고 있으므로 window.location 이 아니라 여기서 읽는다.
  const [searchParams] = useSearchParams()
  const [passwordOpen, setPasswordOpen] = useState(
    () => searchParams.get('method') === 'password',
  )
  const [code, setCode] = useState('')

  // 돌아갈 곳은 떠나기 직전에 저장한다. 실패하면 이동 자체가 없으므로 남길 것도 없다.
  const googleStart = useMutation({
    mutationFn: () => startGoogleOauth({}),
    onSuccess: (started) => {
      rememberReturnTo(safeInternalPath(from))
      navigateExternal(started.authorizationUrl)
    },
  })

  if (status === 'authenticated' && user) {
    return <Navigate to={homePathFor(user.role)} replace />
  }

  const from = (location.state as { from?: string } | null)?.from

  const goHome = (profile: UserProfile) => {
    // 다크 인증 → 라이트 콘솔 톤 전환을 잇는 1회 환영 오버레이(AppShell) 예약.
    schedulePostLoginOverlay()
    // 구글 왕복으로 온 경우 돌아갈 곳은 `location.state` 가 아니라 세션 저장소에 있다.
    // 항상 소비한다 — 남겨 두면 다음 로그인이 지난번 목적지로 간다.
    const stored = takeReturnTo()
    navigate(safeInternalPath(from) ?? safeInternalPath(stored) ?? homePathFor(profile.role), {
      replace: true,
    })
  }

  const asApiError = (err: unknown) =>
    err instanceof ApiError
      ? err
      : new ApiError(null, '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.')

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await login(email, password)
      if (result.kind === 'mfaRequired') {
        setMfaToken(result.mfaToken)
        return
      }
      goHome(result.user)
    } catch (err) {
      setError(asApiError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const submitMfa = async (event: FormEvent) => {
    event.preventDefault()
    if (!mfaToken) return
    setError(null)
    setSubmitting(true)
    try {
      const profile = await completeMfa({
        mfaToken,
        ...(useRecovery ? { recoveryCode: code.trim() } : { code: code.trim() }),
      })
      goHome(profile)
    } catch (err) {
      const apiError = asApiError(err)
      // 세션 만료(410) — 처음부터 다시 로그인해야 한다.
      if (apiError.code === 'AUTH_MFA_TOKEN_EXPIRED') {
        setMfaToken(null)
        setCode('')
      }
      setError(apiError)
    } finally {
      setSubmitting(false)
    }
  }

  if (mfaToken) {
    return (
      <div className="w-full">
        <h1 className="text-center text-2xl font-bold text-white">2단계 인증</h1>
        <p className="mt-2 text-center text-sm text-neutral-400">
          {useRecovery
            ? '복구 코드를 입력해 주세요.'
            : '인증 앱에 표시된 6자리 코드를 입력해 주세요.'}
        </p>
        <AuthCard className="mt-8">
          <AuthCardContent>
            <form onSubmit={(event) => void submitMfa(event)} className="space-y-4" noValidate>
              {error && <Alert variant="danger">{error.message}</Alert>}
              <FormField label={useRecovery ? '복구 코드' : '인증 코드'} required>
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode={useRecovery ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  placeholder={useRecovery ? 'xxxx-xxxx-xxxx' : '123456'}
                  autoFocus
                  required
                />
              </FormField>
              <Button type="submit" className="w-full" loading={submitting}>
                로그인
              </Button>
              <div className="flex justify-between text-sm">
                <button
                  type="button"
                  className="font-medium text-primary-300 hover:underline"
                  onClick={() => {
                    setUseRecovery((prev) => !prev)
                    setCode('')
                    setError(null)
                  }}
                >
                  {useRecovery ? '인증 앱 코드로 입력' : '복구 코드로 입력'}
                </button>
                <button
                  type="button"
                  className="font-medium text-neutral-400 hover:underline"
                  onClick={() => {
                    setMfaToken(null)
                    setCode('')
                    setError(null)
                  }}
                >
                  처음으로
                </button>
              </div>
            </form>
          </AuthCardContent>
        </AuthCard>
      </div>
    )
  }

  return (
    <div className="w-full">
      <h1 className="text-center text-2xl font-bold text-white">로그인</h1>
      <p className="mt-2 text-center text-sm text-neutral-400">
        부산대학교 구글 계정으로 로그인해 주세요.
      </p>
      {systemStatus?.bannerMessage && (
        <Alert variant="info" className="mt-6 whitespace-pre-line">
          {systemStatus.bannerMessage}
        </Alert>
      )}
      <AuthCard className="mt-8">
        <AuthCardContent>
          <div className="space-y-4">
            <GoogleAuthButton
              loading={googleStart.isPending}
              onClick={() => googleStart.mutate()}
            />
            {googleStart.isError && (
              <Alert variant="danger">
                {toApiError(googleStart.error, '구글 로그인을 시작하지 못했습니다.').message}
              </Alert>
            )}
            <p className="text-center text-xs text-neutral-400">
              @pusan.ac.kr 계정만 사용할 수 있습니다.
            </p>
            <AuthDivider />
            <button
              type="button"
              aria-expanded={passwordOpen}
              aria-controls={PASSWORD_FORM_ID}
              onClick={() => setPasswordOpen((open) => !open)}
              className="flex w-full items-center justify-center gap-1 rounded-lg py-2 text-sm font-medium text-neutral-300 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              이메일로 로그인
              <span aria-hidden="true">{passwordOpen ? '▴' : '▾'}</span>
            </button>
          </div>
          {/*
            접혔을 때도 폼을 DOM 에 남기고 hidden 으로만 감춘다. DOM 에 없는 폼에는
            비밀번호 관리자가 붙지 않고, hidden 은 접근성 트리와 탭 순서에서도 빠지므로
            숨기는 목적이 한 번에 해결된다.
          */}
          <form
            id={PASSWORD_FORM_ID}
            onSubmit={(event) => void submitPassword(event)}
            className="mt-4 space-y-4"
            noValidate
            {...(passwordOpen ? {} : { hidden: true })}
          >
            {error && (
              <div className="space-y-3">
                <Alert variant="danger">{error.message}</Alert>
                {error.code === 'AUTH_EMAIL_NOT_VERIFIED' && (
                  <ResendVerification email={email} />
                )}
              </div>
            )}
            <FormField label="이메일" required>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="example@pusan.ac.kr"
                autoComplete="email"
                required
              />
            </FormField>
            <FormField label="비밀번호" required>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </FormField>
            <Button type="submit" className="w-full" loading={submitting}>
              로그인
            </Button>
            <p className="text-center text-sm">
              <TransitionLink to="/forgot-password" className="font-medium text-primary-300 hover:underline">
                비밀번호를 잊으셨나요?
              </TransitionLink>
            </p>
          </form>
        </AuthCardContent>
      </AuthCard>
      <p className="mt-6 text-center text-sm text-neutral-400">
        아직 계정이 없으신가요?{' '}
        <TransitionLink to="/signup" className="font-medium text-primary-300 hover:underline">
          회원가입
        </TransitionLink>
      </p>
      {systemStatus?.contactEmail && (
        <p className="mt-8 text-center text-xs text-neutral-400">
          문의: <ContactEmail email={systemStatus.contactEmail} className="text-neutral-400" />
        </p>
      )}
    </div>
  )
}
