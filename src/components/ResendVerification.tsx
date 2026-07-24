import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
import { toApiError } from '../api/problem'
import { PUSAN_EMAIL_RE } from '../lib/validation'
import { Alert, Button, FormField, Input } from './ui'

/**
 * 인증 메일 재발송. `email`이 주어지면 버튼만, 없으면 이메일 입력란과 함께
 * 렌더링합니다.
 */
export function ResendVerification({ email: fixedEmail }: { email?: string }) {
  const [email, setEmail] = useState(fixedEmail ?? '')
  const [fieldError, setFieldError] = useState<string>()

  const mutation = useMutation({
    mutationFn: async (target: string) => {
      const { data, error } = await api.POST('/auth/resend-verification', {
        body: { email: target },
      })
      if (!data) throw toApiError(error, '재발송에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      return data
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!PUSAN_EMAIL_RE.test(email)) {
      setFieldError('@pusan.ac.kr 이메일을 입력해 주세요.')
      return
    }
    setFieldError(undefined)
    mutation.mutate(email)
  }

  if (mutation.isSuccess) {
    return <Alert variant="success">{mutation.data.message}</Alert>
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {!fixedEmail && (
        <FormField label="가입한 이메일" error={fieldError}>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="example@pusan.ac.kr"
            autoComplete="email"
          />
        </FormField>
      )}
      {mutation.isError && (
        <Alert variant="danger">
          {/* 네트워크 예외 등 비 ApiError도 한국어 메시지로 감싼다. */}
          {toApiError(mutation.error, '재발송에 실패했습니다. 잠시 후 다시 시도해 주세요.').message}
        </Alert>
      )}
      <Button type="submit" variant="secondary" loading={mutation.isPending}>
        인증 메일 다시 받기
      </Button>
    </form>
  )
}
