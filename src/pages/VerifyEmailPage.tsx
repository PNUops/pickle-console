import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../api/client'
import { isProblem } from '../api/problem'
import { ResendVerification } from '../components/ResendVerification'
import { Alert, Card, CardContent, Spinner } from '../components/ui'

type VerifyState = 'missing' | 'verifying' | 'success' | 'expired' | 'invalid'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [state, setState] = useState<VerifyState>(token ? 'verifying' : 'missing')
  const [message, setMessage] = useState<string | null>(null)
  const attempted = useRef(false)

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true
    void (async () => {
      const { data, error } = await api.POST('/auth/verify-email', { body: { token } })
      if (data) {
        setState('success')
        setMessage(data.message)
        return
      }
      if (isProblem(error) && error.code === 'AUTH_VERIFICATION_TOKEN_EXPIRED') {
        setState('expired')
        setMessage(error.detail ?? error.title)
        return
      }
      setState('invalid')
      setMessage(isProblem(error) ? (error.detail ?? error.title) : null)
    })()
  }, [token])

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-center text-2xl font-bold text-neutral-900">이메일 인증</h1>
      <Card className="mt-8">
        <CardContent className="space-y-4 py-8">
          {state === 'verifying' && (
            <div className="flex flex-col items-center gap-3 py-4 text-primary-600">
              <Spinner size="lg" label="이메일 인증 처리 중" />
              <p className="text-sm text-neutral-600">인증을 확인하고 있습니다. 잠시만 기다려 주세요.</p>
            </div>
          )}

          {state === 'success' && (
            <>
              <Alert variant="success" title="인증이 완료되었습니다">
                {message ?? '이메일 인증이 완료되었습니다. 이제 로그인할 수 있습니다.'}
              </Alert>
              <div className="flex justify-center">
                <Link
                  to="/login"
                  className="inline-flex h-10 items-center rounded-lg bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                >
                  로그인하러 가기
                </Link>
              </div>
            </>
          )}

          {state === 'expired' && (
            <>
              <Alert variant="warning" title="인증 링크가 만료되었습니다">
                {message ?? '인증 링크가 만료되었거나 이미 사용되었습니다. 인증 메일을 다시 요청해 주세요.'}
              </Alert>
              <ResendVerification />
            </>
          )}

          {(state === 'invalid' || state === 'missing') && (
            <>
              <Alert variant="danger" title="유효하지 않은 인증 링크입니다">
                {message ??
                  '인증 링크가 올바르지 않습니다. 메일의 링크를 다시 확인하거나 인증 메일을 다시 요청해 주세요.'}
              </Alert>
              <ResendVerification />
              <p className="text-center text-sm text-neutral-500">
                아직 계정이 없으신가요?{' '}
                <Link to="/signup" className="font-medium text-primary-700 hover:underline">
                  회원가입
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
