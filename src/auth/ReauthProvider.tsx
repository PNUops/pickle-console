import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../api/client'
import { toApiError } from '../api/problem'
import { guardNetwork } from '../api/queries'
import { onReauthRequired, setReauthToken } from '../api/reauth'
import { Button, FormField, Input, Modal } from '../components/ui'

/**
 * 민감 작업(재인증, sudo-mode)용 비밀번호 확인 모달의 호스트.
 *
 * API 클라이언트가 403 REAUTH_REQUIRED를 만나면 requestReauth()로 이 컴포넌트를
 * 깨우고, 여기서 받은 비밀번호를 POST /auth/reverify로 교환해 10분짜리 토큰을
 * 메모리에 저장한다. 성공하면 원래 요청이 자동으로 한 번 재시도되고, 취소하면
 * 호출부는 원래의 403을 그대로 받는다(요청이 매달려 있지 않게 항상 resolve).
 */
export function ReauthProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const resolveRef = useRef<((granted: boolean) => void) | null>(null)

  /** 대기 중인 요청자에게 결과를 딱 한 번 돌려주고 모달을 닫는다. */
  const settle = useCallback((granted: boolean) => {
    const resolve = resolveRef.current
    resolveRef.current = null
    setOpen(false)
    setSubmitting(false)
    setPassword('')
    resolve?.(granted)
  }, [])

  useEffect(() => {
    const unsubscribe = onReauthRequired(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRef.current = resolve
          setPassword('')
          setError(null)
          setSubmitting(false)
          setOpen(true)
        }),
    )
    return () => {
      unsubscribe()
      // 언마운트 시 남은 약속을 취소로 마감한다 — 호출부가 영원히 기다리지 않게.
      const pending = resolveRef.current
      resolveRef.current = null
      pending?.(false)
    }
  }, [])

  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault()
      if (submitting || password.length === 0) return
      setSubmitting(true)
      setError(null)
      try {
        const { data, error: failure } = await guardNetwork(() =>
          api.POST('/auth/reverify', { body: { password } }),
        )
        if (!data) {
          // 비밀번호 불일치(403)·요청 과다(429) 모두 서버 메시지를 그대로 보여주고
          // 모달을 열어 둔다 — 잠금 정책은 로그인과 공유한다.
          throw toApiError(failure, '비밀번호 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.')
        }
        setReauthToken(data.reauthToken, data.expiresAt)
        settle(true)
      } catch (failure) {
        setError(toApiError(failure, '비밀번호 확인에 실패했습니다.').message)
        setSubmitting(false)
        setPassword('')
      }
    },
    [password, settle, submitting],
  )

  return (
    <>
      {children}
      <Modal
        open={open}
        onClose={() => settle(false)}
        title="비밀번호 확인"
        footer={
          <>
            <Button variant="secondary" onClick={() => settle(false)} disabled={submitting}>
              취소
            </Button>
            <Button loading={submitting} disabled={password.length === 0} onClick={() => void submit()}>
              확인
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <p className="text-sm text-neutral-600">
            민감한 작업입니다. 계속하려면 비밀번호를 입력해 주세요. (확인 후 10분간 재입력 없이
            진행)
          </p>
          <FormField label="비밀번호" required error={error ?? undefined}>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>
          {/* Enter 제출용 — 실제 버튼은 푸터에 있다. */}
          <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
        </form>
      </Modal>
    </>
  )
}
