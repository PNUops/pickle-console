import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { requestPasswordReset } from '../api/queries'
import { toApiError } from '../api/problem'
import { Alert, Button, FormField, Input } from '../components/ui'
import { AuthCard, AuthCardContent } from '../layouts/AuthLayout'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // 계정 존재 여부를 노출하지 않기 위해 성공/실패와 무관하게 동일한 안내를 보여준다.
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      // 422(이메일 형식)·429(요청 과다) 정도만 사용자에게 안내한다.
      setError(toApiError(err, '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.').message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full">
      <h1 className="text-center text-2xl font-bold text-white">비밀번호 재설정</h1>
      <p className="mt-2 text-center text-sm text-neutral-400">
        가입한 부산대학교 이메일로 재설정 링크를 보내 드립니다.
      </p>
      <AuthCard className="mt-8">
        <AuthCardContent>
          {sent ? (
            <Alert variant="success" title="메일을 확인해 주세요">
              해당 주소가 등록되어 있다면 비밀번호 재설정 메일을 발송했습니다. 링크는 30분 동안만
              유효합니다.
            </Alert>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
              {error && <Alert variant="danger">{error}</Alert>}
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
              <Button type="submit" className="w-full" loading={submitting}>
                재설정 메일 받기
              </Button>
            </form>
          )}
        </AuthCardContent>
      </AuthCard>
      <p className="mt-6 text-center text-sm text-neutral-400">
        <Link to="/login" className="font-medium text-primary-300 hover:underline">
          로그인으로 돌아가기
        </Link>
      </p>
    </div>
  )
}
