import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api/problem'
import { homePathFor, useAuth, type UserProfile } from '../auth/auth-context'
import { ResendVerification } from '../components/ResendVerification'
import { Alert, Button, Card, CardContent, FormField, Input } from '../components/ui'

export function LoginPage() {
  const { status, user, login, completeMfa } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  // 2FA step-up: non-null once /auth/login returns a challenge.
  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const [useRecovery, setUseRecovery] = useState(false)
  const [code, setCode] = useState('')

  if (status === 'authenticated' && user) {
    return <Navigate to={homePathFor(user.role)} replace />
  }

  const from = (location.state as { from?: string } | null)?.from

  const goHome = (profile: UserProfile) => {
    // 내부 경로만 허용한다 — '//host' 형태는 스킴 상대 URL로 외부 이동이 가능하다.
    const safeFrom = from && from.startsWith('/') && !from.startsWith('//') ? from : null
    navigate(safeFrom ?? homePathFor(profile.role), { replace: true })
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
      <div className="mx-auto w-full max-w-md px-4 py-16">
        <h1 className="text-center text-2xl font-bold text-neutral-900">2단계 인증</h1>
        <p className="mt-2 text-center text-sm text-neutral-500">
          {useRecovery
            ? '복구 코드를 입력해 주세요.'
            : '인증 앱에 표시된 6자리 코드를 입력해 주세요.'}
        </p>
        <Card className="mt-8">
          <CardContent className="py-6">
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
                  className="font-medium text-primary-700 hover:underline"
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
                  className="font-medium text-neutral-500 hover:underline"
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
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-center text-2xl font-bold text-neutral-900">로그인</h1>
      <p className="mt-2 text-center text-sm text-neutral-500">
        부산대학교 이메일로 로그인해 주세요.
      </p>
      <Card className="mt-8">
        <CardContent className="py-6">
          <form onSubmit={(event) => void submitPassword(event)} className="space-y-4" noValidate>
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
                placeholder="gildong.hong@pusan.ac.kr"
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
              <Link to="/forgot-password" className="font-medium text-primary-700 hover:underline">
                비밀번호를 잊으셨나요?
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-sm text-neutral-500">
        아직 계정이 없으신가요?{' '}
        <Link to="/signup" className="font-medium text-primary-700 hover:underline">
          회원가입
        </Link>
      </p>
    </div>
  )
}
