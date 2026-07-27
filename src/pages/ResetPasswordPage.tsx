import { TransitionLink } from '../components/TransitionLink'
import { useState, type FormEvent } from 'react'
import {useNavigate, useSearchParams} from 'react-router'
import { confirmPasswordReset } from '../api/queries'
import { ApiError, toApiError } from '../api/problem'
import { PasswordGuidance } from '../components/PasswordGuidance'
import { Alert, Button, FormField, Input, useToast } from '../components/ui'
import { AuthCard, AuthCardContent } from '../layouts/AuthLayout'
import { fieldErrorsOf } from '../lib/field-errors'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const toast = useToast()
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // 링크가 만료·재사용된 경우(410) 재요청을 안내한다.
  const expired = error?.code === 'AUTH_RESET_TOKEN_EXPIRED'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    if (newPassword !== confirm) {
      setFieldErrors({ confirm: '새 비밀번호가 일치하지 않습니다.' })
      return
    }
    setSubmitting(true)
    try {
      await confirmPasswordReset({ token, newPassword })
      toast.success('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.')
      navigate('/login', { replace: true })
    } catch (err) {
      const apiError = toApiError(err, '비밀번호를 변경하지 못했습니다.')
      setFieldErrors(fieldErrorsOf(apiError.problem))
      setError(apiError)
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="w-full">
        <AuthCard>
          <AuthCardContent>
            <Alert variant="danger" title="잘못된 링크입니다">
              재설정 토큰이 없습니다. 메일의 링크를 다시 확인해 주세요.
            </Alert>
            <p className="mt-4 text-center text-sm text-neutral-400">
              <TransitionLink to="/forgot-password" className="font-medium text-primary-300 hover:underline">
                재설정을 다시 요청하기
              </TransitionLink>
            </p>
          </AuthCardContent>
        </AuthCard>
      </div>
    )
  }

  return (
    <div className="w-full">
      <h1 className="text-center text-2xl font-bold text-white">새 비밀번호 설정</h1>
      <p className="mt-2 text-center text-sm text-neutral-400">사용할 새 비밀번호를 입력해 주세요.</p>
      <AuthCard className="mt-8">
        <AuthCardContent>
          {expired ? (
            <Alert variant="danger" title="재설정 링크가 만료되었습니다">
              링크가 만료되었거나 이미 사용되었습니다. 재설정을 다시 요청해 주세요.
            </Alert>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
              {error && !expired && Object.keys(fieldErrors).length === 0 && (
                <Alert variant="danger">{error.message}</Alert>
              )}
              <FormField
                label="새 비밀번호"
                required
                error={fieldErrors.newPassword ?? fieldErrors.password}
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
                <PasswordGuidance password={newPassword} className="mt-1" />
              </FormField>
              <FormField label="새 비밀번호 확인" required error={fieldErrors.confirm}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  required
                />
              </FormField>
              <Button type="submit" className="w-full" loading={submitting}>
                비밀번호 변경
              </Button>
            </form>
          )}
          {expired && (
            <p className="mt-4 text-center text-sm text-neutral-400">
              <TransitionLink to="/forgot-password" className="font-medium text-primary-300 hover:underline">
                재설정을 다시 요청하기
              </TransitionLink>
            </p>
          )}
        </AuthCardContent>
      </AuthCard>
    </div>
  )
}
