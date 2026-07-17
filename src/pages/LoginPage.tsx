import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api/problem'
import { homePathFor, useAuth } from '../auth/auth-context'
import { ResendVerification } from '../components/ResendVerification'
import { Alert, Button, Card, CardContent, FormField, Input } from '../components/ui'

export function LoginPage() {
  const { status, user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  if (status === 'authenticated' && user) {
    return <Navigate to={homePathFor(user.role)} replace />
  }

  const from = (location.state as { from?: string } | null)?.from

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const profile = await login(email, password)
      // 내부 경로만 허용한다 — '//host' 형태는 스킴 상대 URL로 외부 이동이 가능하다.
      const safeFrom = from && from.startsWith('/') && !from.startsWith('//') ? from : null
      const target = safeFrom ?? homePathFor(profile.role)
      navigate(target, { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : new ApiError(null, '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-center text-2xl font-bold text-neutral-900">로그인</h1>
      <p className="mt-2 text-center text-sm text-neutral-500">
        부산대학교 이메일로 로그인해 주세요.
      </p>
      <Card className="mt-8">
        <CardContent className="py-6">
          <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
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
