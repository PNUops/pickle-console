import { TransitionLink } from '../components/TransitionLink'
import { useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
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

/**
 * 진입은 하나이고 단계만 바뀐다. 주소를 받은 뒤 비밀번호 칸이 나타나는 것이지
 * 다른 화면으로 가는 것이 아니다.
 *
 * 이메일 칸은 두 단계 모두 보인다. 비밀번호 관리자는 이메일과 비밀번호를 짝으로
 * 채우므로 둘 다 같은 폼에 있어야 하고, 채울 대상을 숨기면 그 경로가 얇아진다.
 * 오타를 고치는 데 클릭이 하나 덜 드는 것도 같은 방향이다.
 */
type Step = 'email' | 'password'

/** 단계 전환으로만 감추는 비밀번호 블록의 고정 id. */
const PASSWORD_BLOCK_ID = 'login-password-block'

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
  const [step, setStep] = useState<Step>('email')
  const [code, setCode] = useState('')
  const passwordRef = useRef<HTMLInputElement>(null)

  // googleStart 의 onSuccess 가 이 값을 닫아 잡는다. 선언이 아래에 있으면 인증된
  // 분기로 빠지는 사이에 도착한 응답이 초기화 전 바인딩을 읽는다.
  const from = (location.state as { from?: string } | null)?.from

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

  /**
   * 하나의 폼이 두 단계를 모두 처리한다. 이메일 칸에서 Enter 를 쳐도 로그인이
   * 날아가지 않는 이유가 이 분기다.
   */
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (step === 'email') {
      if (email.trim().length === 0) return
      setError(null)
      setStep('password')
      // 다음 칸으로 옮겨 준다. 단계가 바뀌었는데 포커스가 제자리면 키보드만 쓰는
      // 사람에게는 아무 일도 일어나지 않은 것과 같다.
      requestAnimationFrame(() => passwordRef.current?.focus())
      return
    }
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
        부산대학교 계정으로 로그인해 주세요.
      </p>
      {systemStatus?.maintenance ? (
        // 점검 중에는 평소 공지를 누르고 점검을 말한다. 셸이 같은 우선순위를 쓰고,
        // 여기서만 공지를 띄우면 로그인해도 점검 화면에 부딪힐 사람에게 들어오라고
        // 권하는 화면이 된다.
        <Alert variant="warning" className="mt-6 whitespace-pre-line">
          {systemStatus.maintenanceMessage ?? '서비스 점검 중입니다.'}
        </Alert>
      ) : (
        systemStatus?.bannerMessage && (
          <Alert variant="info" className="mt-6 whitespace-pre-line">
            {systemStatus.bannerMessage}
          </Alert>
        )
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
          </div>
          {/*
            오류는 폼 **바깥**에 둔다. 두 가지가 걸려 있다. 감춰지는 블록 안에
            있으면 구글로 온 2FA 챌린지가 만료됐을 때 아무 말 없이 로그인 화면만
            남고, 재발송 컴포넌트가 자기 폼을 가지고 있어서 안에 두면 폼이
            중첩된다.
          */}
          {error && (
            <div className="mt-4 space-y-3">
              <Alert variant="danger">{error.message}</Alert>
              {error.code === 'AUTH_EMAIL_NOT_VERIFIED' && <ResendVerification email={email} />}
            </div>
          )}
          <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-4" noValidate>
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
            {/*
              비밀번호 칸은 1단계에서도 DOM 에 남기고 hidden 으로만 감춘다. DOM 에
              없는 칸에는 비밀번호 관리자가 붙지 않고, hidden 은 접근성 트리와 탭
              순서에서도 빠지므로 숨기는 목적이 한 번에 해결된다.
            */}
            <div
              id={PASSWORD_BLOCK_ID}
              className="space-y-4"
              {...(step === 'password' ? {} : { hidden: true })}
            >
              <FormField label="비밀번호" required>
                <Input
                  ref={passwordRef}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </FormField>
            </div>
            <Button type="submit" className="w-full" loading={submitting}>
              {step === 'email' ? '이메일로 계속하기' : '로그인'}
            </Button>
            {step === 'password' && (
              <div className="space-y-3 text-center text-sm">
                <p>
                  <TransitionLink
                    to={`/forgot-password?email=${encodeURIComponent(email)}`}
                    className="font-medium text-primary-300 hover:underline"
                  >
                    비밀번호를 잊으셨나요?
                  </TransitionLink>
                </p>
                <p className="text-neutral-400">
                  계정이 없으신가요?{' '}
                  <TransitionLink
                    to={`/signup?email=${encodeURIComponent(email)}`}
                    className="font-medium text-primary-300 hover:underline"
                  >
                    이 이메일로 회원가입
                  </TransitionLink>
                </p>
                {/*
                  주소를 보고 판단하지 않는다. 이 계정이 구글인지 말해 주는 순간
                  그 주소가 가입돼 있는지도 말하게 된다. 비밀번호 재설정 화면이
                  같은 이유로 같은 선택을 했다.
                */}
                <p className="text-xs text-neutral-500">
                  구글 계정으로 가입했다면 비밀번호가 없습니다. 위의 Google 버튼을 이용해 주세요.
                </p>
              </div>
            )}
          </form>
        </AuthCardContent>
      </AuthCard>
      {/*
        2단계에는 주소를 달고 가는 「이 이메일로 회원가입」이 카드 안에 있다. 둘을
        같이 두면 같은 말이 두 줄 겹치고, 바깥 것은 방금 친 주소를 버린다.
      */}
      {step === 'email' && (
        <p className="mt-6 text-center text-sm text-neutral-400">
          아직 계정이 없으신가요?{' '}
          <TransitionLink to="/signup" className="font-medium text-primary-300 hover:underline">
            회원가입
          </TransitionLink>
        </p>
      )}
      {systemStatus?.contactEmail && (
        <p className="mt-8 text-center text-xs text-neutral-400">
          문의: <ContactEmail email={systemStatus.contactEmail} className="text-neutral-400" />
        </p>
      )}
    </div>
  )
}
