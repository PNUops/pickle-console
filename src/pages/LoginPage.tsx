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
import { cn } from '../lib/cn'
import { safeInternalPath } from '../lib/redirect'
import { AuthCard, AuthCardContent } from '../layouts/AuthLayout'

/**
 * 주소를 알아볼 만하면 비밀번호 칸이 아래로 자라난다. 누를 것이 없다.
 *
 * 형식을 좁게 보지 않는 이유가 있다. 이것은 검증이 아니라 **펼침 조건**이고,
 * `@pusan.ac.kr` 로 좁히면 오타 하나에 비밀번호 칸이 영영 안 나와 왜 못 쓰는지
 * 알 수 없게 된다. 주소의 옳고 그름은 서버가 균일한 401 로 답한다.
 */
function looksLikeAddress(value: string): boolean {
  return /^[^@\s]+@[^@\s]+$/.test(value.trim())
}

/** 펼침 애니메이션이 감싸는 비밀번호 블록의 고정 id. */
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
  // 한 번 펼쳐지면 도메인을 고치는 동안 접히지 않는다. 주소를 비우면 되돌아간다.
  const [revealed, setRevealed] = useState(false)
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

  const showPassword = revealed || looksLikeAddress(email)

  const onEmailChange = (value: string) => {
    setEmail(value)
    // 펼치기만 하고 접지는 않는다. 도메인을 고치는 사이에 칸이 사라졌다 나타나면
    // 화면이 흔들린다. 주소를 통째로 지웠을 때만 처음으로 돌아간다.
    if (looksLikeAddress(value)) setRevealed(true)
    else if (value.trim().length === 0) setRevealed(false)
  }

  const asApiError = (err: unknown) =>
    err instanceof ApiError
      ? err
      : new ApiError(null, '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.')

  /**
   * 이메일 칸에서 Enter 를 쳐도 빈 비밀번호로 로그인이 날아가지 않는다. 대신
   * 비밀번호 칸으로 옮겨 준다 — 그 시점에 화면에는 이미 그 칸이 있다.
   */
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!showPassword) return
    if (password.length === 0) {
      passwordRef.current?.focus()
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
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="example@pusan.ac.kr"
                autoComplete="email"
                required
              />
            </FormField>
            {/*
              칸은 늘 DOM 에 있고 감싼 격자가 0fr 에서 1fr 로 자란다. `hidden` 을
              쓰면 높이가 순간이동하고, 조건부 렌더로 빼면 비밀번호 관리자가 폼을
              보지 못해 자동완성이 죽는다.

              접혔을 때는 `inert` 로 접근성 트리와 탭 순서에서 뺀다. 보이지도 않는
              칸에 탭이 멈추면 키보드만 쓰는 사람에게는 없는 칸에 갇히는 것이다.
              움직임을 줄이도록 설정한 사람에게는 전환을 끈다.
            */}
            <div
              id={PASSWORD_BLOCK_ID}
              inert={!showPassword}
              className={cn(
                'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
                showPassword ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              )}
            >
              <div className="space-y-4 overflow-hidden">
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
                <Button type="submit" className="w-full" loading={submitting}>
                  로그인
                </Button>
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
                </div>
              </div>
            </div>
          </form>
        </AuthCardContent>
      </AuthCard>
      {/*
        펼쳐지면 주소를 달고 가는 「이 이메일로 회원가입」이 카드 안에 있다. 둘을
        같이 두면 같은 말이 두 줄 겹치고, 바깥 것은 방금 친 주소를 버린다.
      */}
      {!showPassword && (
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
