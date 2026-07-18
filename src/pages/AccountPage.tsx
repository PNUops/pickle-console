import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { changeMyPassword, withdrawMyAccount } from '../api/queries'
import { toApiError } from '../api/problem'
import { setAccessToken } from '../api/token'
import { useAuth } from '../auth/auth-context'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Modal,
  useToast,
} from '../components/ui'
import { fieldErrorsOf } from '../lib/field-errors'

export function AccountPage() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">계정 설정</h1>
        <p className="mt-1 text-sm text-neutral-500">비밀번호 변경과 회원 탈퇴를 관리합니다.</p>
      </div>
      <PasswordChangeSection />
      <WithdrawSection email={user.email} />
    </div>
  )
}

function PasswordChangeSection() {
  const toast = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const change = useMutation({
    mutationFn: () => changeMyPassword({ currentPassword, newPassword }),
    onSuccess: (data) => {
      // 새 토큰쌍으로 교체해 현재 세션을 유지한다(다른 세션은 서버가 무효화).
      setAccessToken(data.accessToken)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setError(null)
      setFieldErrors({})
      toast.success('비밀번호를 변경했습니다. 다른 기기의 세션은 로그아웃됩니다.')
    },
    onError: (err) => {
      const apiError = toApiError(err, '비밀번호를 변경하지 못했습니다.')
      const fields = fieldErrorsOf(apiError.problem)
      setFieldErrors(fields)
      // 현재 비밀번호 불일치(403)·기타 오류는 상단 Alert로.
      setError(Object.keys(fields).length > 0 ? null : apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: '새 비밀번호가 일치하지 않습니다.' })
      return
    }
    change.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>비밀번호 변경</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <Alert variant="danger" className="mb-4">{error}</Alert>}
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label="현재 비밀번호" required error={fieldErrors.currentPassword}>
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </FormField>
          <FormField
            label="새 비밀번호"
            required
            error={fieldErrors.newPassword ?? fieldErrors.password}
            description="최소 10자, 두 종류 이상의 문자를 섞어 주세요."
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </FormField>
          <FormField label="새 비밀번호 확인" required error={fieldErrors.confirmPassword}>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </FormField>
          <Button type="submit" loading={change.isPending}>
            비밀번호 변경
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function WithdrawSection({ email }: { email: string }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [typedEmail, setTypedEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const withdraw = useMutation({
    mutationFn: () => withdrawMyAccount({ password }),
    onSuccess: async () => {
      // 서버가 세션을 종료했으므로 클라이언트 상태도 비우고 랜딩으로 보낸다.
      await logout()
      navigate('/', { replace: true })
      toast.success('탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.')
    },
    onError: (err) => setError(toApiError(err, '회원 탈퇴를 처리하지 못했습니다.').message),
  })

  const close = () => {
    setOpen(false)
    setTypedEmail('')
    setPassword('')
    setError(null)
  }

  const canSubmit = typedEmail === email && password.length > 0

  return (
    <Card className="border-danger-200">
      <CardHeader>
        <CardTitle className="text-danger-700">회원 탈퇴</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-neutral-600">
          탈퇴하면 로그인·SSH 접속이 즉시 차단되고 모든 세션이 종료됩니다. 계정 정보는 관련 법령과
          개인정보처리방침에 따라 영구 보존되며, <strong>같은 이메일로는 다시 가입할 수 없습니다.</strong>
        </p>
        <p className="text-sm text-neutral-500">
          삭제되지 않은 VM을 보유한 그룹의 유일한 소유자이거나 개인 그룹에 VM이 남아 있으면 먼저
          정리해야 탈퇴할 수 있습니다.
        </p>
        <Button variant="danger" onClick={() => setOpen(true)}>
          회원 탈퇴
        </Button>
      </CardContent>

      <Modal
        open={open}
        onClose={close}
        title="회원 탈퇴"
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              돌아가기
            </Button>
            <Button
              variant="danger"
              loading={withdraw.isPending}
              disabled={!canSubmit}
              onClick={() => {
                setError(null)
                withdraw.mutate()
              }}
            >
              탈퇴하기
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert variant="danger" title="되돌릴 수 없는 작업입니다">
            탈퇴 후에는 계정을 복구하거나 같은 이메일로 재가입할 수 없습니다.
          </Alert>
          {error && <Alert variant="danger">{error}</Alert>}
          <FormField label={`계속하려면 이메일(${email})을 정확히 입력하세요`} required>
            <Input
              value={typedEmail}
              onChange={(event) => setTypedEmail(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={email}
            />
          </FormField>
          <FormField label="비밀번호 확인" required>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>
        </div>
      </Modal>
    </Card>
  )
}
