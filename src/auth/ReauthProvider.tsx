import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { api } from '../api/client'
import { toApiError } from '../api/problem'
import { guardNetwork } from '../api/queries'
import { clearReauthToken, onReauthRequired, setReauthToken } from '../api/reauth'
import { onSessionExpired } from '../api/token'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, FormField, Input, Modal } from '../components/ui'
import { GoogleAuthButton } from '../components/auth/GoogleAuthButton'
import { AuthDivider } from '../components/auth/AuthDivider'
import { startGoogleOauth } from '../api/queries'
import { navigateExternal, rememberReturnTo } from '../lib/google-oauth'
import { AuthContext } from './auth-context'

/**
 * 민감 작업(재인증, sudo-mode)용 비밀번호 확인 모달의 호스트.
 *
 * API 클라이언트가 403 REAUTH_REQUIRED를 만나면 requestReauth()로 이 컴포넌트를
 * 깨우고, 여기서 받은 비밀번호를 POST /auth/reverify로 교환해 10분짜리 토큰을
 * 메모리에 저장한다. 성공하면 원래 요청이 자동으로 한 번 재시도되고, 취소하면
 * 호출부는 원래의 403을 그대로 받는다(요청이 매달려 있지 않게 항상 resolve).
 */
export function ReauthProvider({ children }: { children: ReactNode }) {
  // 컨텍스트를 직접 읽는다. useAuth 는 없으면 던지는데, 이 provider 는 인증 셸보다
  // 바깥에서도 마운트될 수 있고 그때는 비밀번호 칸을 감출 근거가 없을 뿐이다.
  const auth = useContext(AuthContext)
  // 비밀번호가 없는 계정은 이 칸을 채울 수 없다. 그 계정에게 비밀번호 칸만 있는
  // 모달은 확인 버튼이 영원히 비활성인 화면이고, 재인증이 걸린 동작 스물둘이
  // 전부 그 화면에서 끝난다.
  const passwordless = auth?.user != null && !auth.user.hasPassword
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const resolveRef = useRef<((granted: boolean) => void) | null>(null)
  // 확인 요청의 세대 — 프롬프트가 열릴 때와 마감될 때마다 올라간다. 전송 중
  // 취소(Esc·배경 클릭·취소 버튼)한 뒤 뒤늦게 도착한 응답이 grant를 적립하거나
  // 그 사이에 새로 열린 모달의 상태를 건드리지 못하게 하는 기준값이다.
  const genRef = useRef(0)

  /** 대기 중인 요청자에게 결과를 딱 한 번 돌려주고 모달을 닫는다. */
  const settle = useCallback((granted: boolean) => {
    const resolve = resolveRef.current
    resolveRef.current = null
    genRef.current += 1
    setOpen(false)
    setSubmitting(false)
    setPassword('')
    setError(null)
    resolve?.(granted)
  }, [])

  useEffect(() => {
    const unsubscribe = onReauthRequired(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRef.current = resolve
          genRef.current += 1
          setPassword('')
          setError(null)
          setSubmitting(false)
          setOpen(true)
        }),
    )
    return () => {
      unsubscribe()
      // 언마운트 시 남은 약속을 취소로 마감한다 — 호출부가 영원히 기다리지 않게.
      // 세대도 올려 전송 중이던 요청의 뒤늦은 grant가 적립되지 않게 한다.
      const pending = resolveRef.current
      resolveRef.current = null
      genRef.current += 1
      pending?.(false)
    }
  }, [])

  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault()
      if (submitting || password.length === 0) return
      setSubmitting(true)
      setError(null)
      // 응답을 기다리는 사이에 이 요청이 마감(취소·세션 만료)되고 새 프롬프트가
      // 열렸을 수 있다 — 그때는 세대가 달라지므로 결과를 통째로 버린다.
      const generation = genRef.current
      try {
        const { data, error: failure } = await guardNetwork(() =>
          api.POST('/auth/reverify', { body: { password } }),
        )
        if (!data) {
          // 비밀번호 불일치(403)·요청 과다(429) 모두 서버 메시지를 그대로 보여주고
          // 모달을 열어 둔다 — 잠금 정책은 로그인과 공유한다.
          throw toApiError(failure, '비밀번호 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.')
        }
        if (generation !== genRef.current) {
          // 응답을 기다리는 동안 사용자가 취소했거나 세션이 끝났다 — 이 grant는
          // 아무도 요청하지 않은 것이므로 저장하지 않고 버린다.
          clearReauthToken()
          return
        }
        setReauthToken(data.reauthToken, data.expiresAt)
        settle(true)
      } catch (failure) {
        // 이미 마감된 요청의 실패는 새 모달에 오류로 흘려보내지 않는다.
        if (generation !== genRef.current) return
        setError(toApiError(failure, '비밀번호 확인에 실패했습니다.').message)
        setSubmitting(false)
        setPassword('')
      }
    },
    [password, settle, submitting],
  )

  // 세션이 끊기면(401 복구 실패) 열려 있던 확인 모달을 취소로 닫는다 — 재인증
  // 토큰은 세션에 매인 값이라 남겨 둘 수 없다(AuthProvider도 함께 비운다).
  useEffect(
    () =>
      onSessionExpired(() => {
        clearReauthToken()
        settle(false)
      }),
    [settle],
  )

  // 구글 재인증. prompt=login 이 붙는 것은 서버 쪽이고, 없으면 살아 있는 구글
  // 세션이 그냥 통과해 확인이 아무것도 증명하지 않는다.
  const googleStart = useMutation({
    mutationFn: () => startGoogleOauth({ purpose: 'REVERIFY' }),
    onSuccess: (started) => {
      // 돌아올 자리를 남긴다. 대기 중인 요청은 페이지를 떠나는 순간 취소로
      // 마감되므로, 돌아와서 같은 동작을 다시 누르는 것이 이 흐름이다.
      rememberReturnTo(window.location.pathname + window.location.search)
      settle(false)
      navigateExternal(started.authorizationUrl)
    },
  })

  return (
    <>
      {children}
      <Modal
        open={open}
        onClose={() => settle(false)}
        title="본인 확인"
        footer={
          passwordless ? (
            <Button variant="secondary" onClick={() => settle(false)}>
              취소
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => settle(false)} disabled={submitting}>
                취소
              </Button>
              <Button
                loading={submitting}
                disabled={password.length === 0}
                onClick={() => void submit()}
              >
                확인
              </Button>
            </>
          )
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            민감한 작업입니다. 계속하려면 본인 확인이 필요합니다. (확인 후 10분간 재입력 없이
            진행)
          </p>
          {/*
            구글 왕복은 이 페이지를 떠난다. 대기 중이던 요청은 그 순간 취소로
            마감되므로 돌아와서 다시 눌러야 하고, 그 사실을 콜백 화면이 말한다.
            자동으로 이어지지 않는 것을 문구로 알리지 않으면 눌렀는데 아무 일도
            없는 것처럼 보인다.
          */}
          <GoogleAuthButton
            label="continue"
            loading={googleStart.isPending}
            onClick={() => googleStart.mutate()}
          />
          {googleStart.isError && (
            <Alert variant="danger">
              {toApiError(googleStart.error, '구글 확인을 시작하지 못했습니다.').message}
            </Alert>
          )}
          {passwordless ? (
            <p className="text-xs text-neutral-500">
              이 계정에는 비밀번호가 없습니다. 구글 계정으로 확인해 주세요.
            </p>
          ) : (
            <>
              <AuthDivider />
              <form className="space-y-4" onSubmit={(event) => void submit(event)}>
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
            </>
          )}
        </div>
      </Modal>
    </>
  )
}
