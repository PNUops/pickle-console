import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import {
  activateMfa,
  beginMfaSetup,
  changeMyPassword,
  disableMfa,
  regenerateRecoveryCodes,
  withdrawMyAccount,
  type MfaRecoveryCodesResponse,
  type MfaSetupResponse,
} from '../api/queries'
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
      <TwoFactorSection enabled={user.mfaEnabled} />
      <WithdrawSection email={user.email} mfaEnabled={user.mfaEnabled} />
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

/** Shows the 10 one-time recovery codes with copy/download (shown only once). */
function RecoveryCodes({ codes }: { codes: string[] }) {
  const toast = useToast()
  const copy = () => {
    void navigator.clipboard?.writeText(codes.join('\n')).then(
      () => toast.success('복구 코드를 클립보드에 복사했습니다.'),
      () => toast.error('복사에 실패했습니다. 코드를 직접 저장해 주세요.'),
    )
  }
  const download = () => {
    const blob = new Blob([codes.join('\n') + '\n'], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'pickle-recovery-codes.txt'
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="space-y-3">
      <Alert variant="warning" title="복구 코드는 지금 한 번만 표시됩니다">
        인증 앱을 사용할 수 없을 때 로그인·해제에 사용합니다. 안전한 곳에 보관해 주세요. 각 코드는
        한 번만 쓸 수 있습니다.
      </Alert>
      <ul className="grid grid-cols-2 gap-2 rounded-md bg-neutral-50 p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code} className="tabular-nums text-neutral-800">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={copy}>
          복사
        </Button>
        <Button variant="secondary" onClick={download}>
          다운로드
        </Button>
      </div>
    </div>
  )
}

function TwoFactorSection({ enabled }: { enabled: boolean }) {
  const { refreshProfile } = useAuth()
  // Enrollment wizard: idle → password → activate → recovery (shown once).
  const [step, setStep] = useState<'idle' | 'password' | 'activate' | 'recovery'>('idle')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resetWizard = () => {
    setStep('idle')
    setPassword('')
    setCode('')
    setSetup(null)
    setRecoveryCodes(null)
    setError(null)
  }

  const begin = useMutation({
    mutationFn: () => beginMfaSetup(password),
    onSuccess: (data) => {
      setSetup(data)
      setError(null)
      setCode('')
      setStep('activate')
    },
    onError: (err) => setError(toApiError(err, '등록을 시작하지 못했습니다.').message),
  })

  const activate = useMutation({
    mutationFn: () => activateMfa(code),
    onSuccess: async (data) => {
      setRecoveryCodes(data.recoveryCodes)
      setError(null)
      setStep('recovery')
      await refreshProfile()
    },
    onError: (err) => setError(toApiError(err, '인증 코드를 확인하지 못했습니다.').message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>2단계 인증 (2FA)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {enabled && step !== 'recovery' ? (
          <EnrolledPanel />
        ) : step === 'recovery' && recoveryCodes ? (
          <div className="space-y-4">
            <p className="text-sm text-neutral-700">2단계 인증이 활성화되었습니다.</p>
            <RecoveryCodes codes={recoveryCodes} />
            <Button onClick={resetWizard}>완료</Button>
          </div>
        ) : step === 'idle' ? (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600">
              인증 앱(TOTP)으로 로그인 시 2단계 인증을 추가합니다. 계정 보안을 위해 등록을 권장합니다.
            </p>
            <Button onClick={() => setStep('password')}>2단계 인증 등록</Button>
          </div>
        ) : step === 'password' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setError(null)
              begin.mutate()
            }}
            className="space-y-4"
            noValidate
          >
            {error && <Alert variant="danger">{error}</Alert>}
            <FormField label="비밀번호 확인" required>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" loading={begin.isPending}>
                다음
              </Button>
              <Button type="button" variant="secondary" onClick={resetWizard}>
                취소
              </Button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setError(null)
              activate.mutate()
            }}
            className="space-y-4"
            noValidate
          >
            {error && <Alert variant="danger">{error}</Alert>}
            <div className="space-y-2 text-sm text-neutral-700">
              <p>인증 앱에 아래 키를 등록한 뒤, 표시되는 6자리 코드를 입력해 주세요.</p>
              <p className="text-neutral-500">
                QR 코드 대신 아래 설정 키 또는 otpauth 링크를 인증 앱에 직접 입력합니다.
              </p>
              <div className="rounded-md bg-neutral-50 p-3 font-mono text-xs break-all">
                <div>
                  <span className="text-neutral-500">설정 키: </span>
                  {setup?.secret}
                </div>
                <div className="mt-1">
                  <span className="text-neutral-500">otpauth: </span>
                  {setup?.otpauthUri}
                </div>
              </div>
            </div>
            <FormField label="인증 코드 (6자리)" required>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="123456"
              />
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" loading={activate.isPending}>
                활성화
              </Button>
              <Button type="button" variant="secondary" onClick={resetWizard}>
                취소
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

/** Enrolled state: regenerate recovery codes + disable 2FA. */
function EnrolledPanel() {
  const { refreshProfile } = useAuth()
  const toast = useToast()
  const [disableOpen, setDisableOpen] = useState(false)
  const [regenOpen, setRegenOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [recovery, setRecovery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [newCodes, setNewCodes] = useState<string[] | null>(null)

  const closeAll = () => {
    setDisableOpen(false)
    setRegenOpen(false)
    setPassword('')
    setCode('')
    setRecovery('')
    setUseRecovery(false)
    setError(null)
    setNewCodes(null)
  }

  const disable = useMutation({
    mutationFn: () =>
      disableMfa({ password, ...(useRecovery ? { recoveryCode: recovery.trim() } : { code }) }),
    onSuccess: async () => {
      closeAll()
      toast.success('2단계 인증을 해제했습니다.')
      await refreshProfile()
    },
    onError: (err) => setError(toApiError(err, '2단계 인증을 해제하지 못했습니다.').message),
  })

  const regen = useMutation({
    mutationFn: (data: { password: string; code: string }) => regenerateRecoveryCodes(data),
    onSuccess: (data: MfaRecoveryCodesResponse) => {
      setNewCodes(data.recoveryCodes)
      setError(null)
      toast.success('복구 코드를 재발급했습니다. 기존 코드는 더 이상 사용할 수 없습니다.')
    },
    onError: (err) => setError(toApiError(err, '복구 코드를 재발급하지 못했습니다.').message),
  })

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-700">2단계 인증이 설정되어 있습니다.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setRegenOpen(true)}>
          복구 코드 재발급
        </Button>
        <Button variant="danger" onClick={() => setDisableOpen(true)}>
          2단계 인증 해제
        </Button>
      </div>

      <Modal
        open={regenOpen}
        onClose={closeAll}
        title="복구 코드 재발급"
        footer={
          newCodes ? (
            <Button onClick={closeAll}>완료</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={closeAll}>
                취소
              </Button>
              <Button
                loading={regen.isPending}
                onClick={() => {
                  setError(null)
                  regen.mutate({ password, code })
                }}
              >
                재발급
              </Button>
            </>
          )
        }
      >
        {newCodes ? (
          <RecoveryCodes codes={newCodes} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              재발급하면 기존 복구 코드는 모두 무효화됩니다. 비밀번호와 현재 인증 코드를 입력해 주세요.
            </p>
            {error && <Alert variant="danger">{error}</Alert>}
            <FormField label="비밀번호" required>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormField>
            <FormField label="인증 코드 (6자리)" required>
              <Input
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="123456"
              />
            </FormField>
          </div>
        )}
      </Modal>

      <Modal
        open={disableOpen}
        onClose={closeAll}
        title="2단계 인증 해제"
        footer={
          <>
            <Button variant="secondary" onClick={closeAll}>
              취소
            </Button>
            <Button
              variant="danger"
              loading={disable.isPending}
              onClick={() => {
                setError(null)
                disable.mutate()
              }}
            >
              해제하기
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            비밀번호와 현재 인증 코드(또는 복구 코드)를 입력해 주세요.
          </p>
          {error && <Alert variant="danger">{error}</Alert>}
          <FormField label="비밀번호" required>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>
          {useRecovery ? (
            <FormField label="복구 코드" required>
              <Input
                value={recovery}
                onChange={(event) => setRecovery(event.target.value)}
                placeholder="xxxx-xxxx-xxxx"
              />
            </FormField>
          ) : (
            <FormField label="인증 코드 (6자리)" required>
              <Input
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="123456"
              />
            </FormField>
          )}
          <button
            type="button"
            className="text-sm font-medium text-primary-700 hover:underline"
            onClick={() => {
              setUseRecovery((prev) => !prev)
              setCode('')
              setRecovery('')
            }}
          >
            {useRecovery ? '인증 앱 코드로 입력' : '복구 코드로 입력'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function WithdrawSection({ email, mfaEnabled }: { email: string; mfaEnabled: boolean }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [typedEmail, setTypedEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const withdraw = useMutation({
    mutationFn: () =>
      withdrawMyAccount({ password, ...(mfaEnabled ? { totpCode: totpCode.trim() } : {}) }),
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
    setTotpCode('')
    setError(null)
  }

  const canSubmit =
    typedEmail === email && password.length > 0 && (!mfaEnabled || totpCode.trim().length === 6)

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
          {mfaEnabled && (
            <FormField label="2단계 인증 코드 (6자리)" required>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
                placeholder="123456"
              />
            </FormField>
          )}
        </div>
      </Modal>
    </Card>
  )
}
