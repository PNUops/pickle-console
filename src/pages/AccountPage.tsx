import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import {
  activateMfa,
  beginMfaSetup,
  changeMyPassword,
  disableMfa,
  regenerateRecoveryCodes,
  requestPasswordReset,
  type LinkedIdentity,
  type MfaRecoveryCodesResponse,
  type MfaSetupResponse,
  unlinkIdentity,
  withdrawMyAccount,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { setAccessToken } from '../api/token'
import { useAuth } from '../auth/auth-context'
import { PasswordGuidance } from '../components/PasswordGuidance'
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
import { passwordRuleError } from '../lib/validation'

/** 체크리스트를 새 비밀번호 입력의 설명으로 연결하기 위한 고정 id. */
const GUIDANCE_ID = 'account-password-guidance'

export function AccountPage() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">계정 설정</h1>
        <p className="mt-1 text-sm text-neutral-500">비밀번호 변경과 회원 탈퇴를 관리합니다.</p>
      </div>
      <PasswordChangeSection hasPassword={user.hasPassword} email={user.email} />
      <LinkedAccountsSection
        identities={user.identities}
        hasPassword={user.hasPassword}
      />
      <TwoFactorSection enabled={user.mfaEnabled} hasPassword={user.hasPassword} />
      <WithdrawSection
        email={user.email}
        mfaEnabled={user.mfaEnabled}
        hasPassword={user.hasPassword}
      />
    </div>
  )
}

/**
 * 비밀번호가 없는 계정에는 "변경" 화면을 띄우지 않는다. 현재 비밀번호를 묻는 폼은
 * 그 계정에게 채울 수 없는 칸이고, 서버도 409 로 답한다. 대신 재설정 메일로 처음
 * 설정하는 길을 안내한다.
 */
function PasswordChangeSection({ hasPassword, email }: { hasPassword: boolean; email: string }) {
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
    // 서버와 같은 규칙·같은 문구로 제출 전에 막는다.
    const ruleError = passwordRuleError(newPassword)
    if (ruleError) {
      setFieldErrors({ newPassword: ruleError })
      return
    }
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: '새 비밀번호가 일치하지 않습니다.' })
      return
    }
    change.mutate()
  }

  if (!hasPassword) {
    return <PasswordSetupSection email={email} />
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
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              aria-describedby={GUIDANCE_ID}
            />
            <PasswordGuidance password={newPassword} id={GUIDANCE_ID} className="mt-1" />
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

/**
 * 비밀번호가 없는 계정에 처음 설정하는 길.
 *
 * 재설정 메일이 이 계정의 유일한 설정 경로다. 새 엔드포인트가 아니라 기존 재설정
 * 확정 경로가 null 을 값으로 바꾸는 동작을 그대로 한다.
 */
function PasswordSetupSection({ email }: { email: string }) {
  const toast = useToast()
  const send = useMutation({
    mutationFn: () => requestPasswordReset(email),
    onSuccess: () => toast.success('비밀번호 설정 메일을 보냈습니다. 메일함을 확인해 주세요.'),
    onError: (err) => toast.error(toApiError(err, '메일을 보내지 못했습니다.').message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>비밀번호 설정</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-neutral-600">
          이 계정에는 비밀번호가 없습니다. 구글 계정으로만 로그인할 수 있고, 비밀번호로도
          로그인하려면 아래에서 설정 메일을 받아 새로 정하면 됩니다.
        </p>
        <Button variant="secondary" loading={send.isPending} onClick={() => send.mutate()}>
          비밀번호 설정 메일 받기
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * 연동된 외부 로그인 관리.
 *
 * 해제는 재인증 대상이다. 로그인 수단을 없애는 일이고 붙이는 일의 반대편이라, 탈취된
 * 세션이 진짜 소유자의 제공자를 조용히 뗄 수 있으면 소유자가 잠긴다.
 *
 * 마지막 수단은 버튼을 숨기지 않고 비활성으로 두고 사유를 적는다. 숨기면 왜 못 하는지
 * 알 길이 없다. 판단은 서버가 하고(409) 여기는 그 답을 미리 보여줄 뿐이다.
 */
function LinkedAccountsSection({
  identities,
  hasPassword,
}: {
  identities: LinkedIdentity[]
  hasPassword: boolean
}) {
  const toast = useToast()
  const { refreshProfile } = useAuth()
  // `<= 1` 이 아니라 `=== 1` 이다. 0이면 해제할 행이 없으므로 사유를 띄울 자리도 없고,
  // 띄우면 "연동된 계정이 없습니다"와 "유일한 로그인 수단입니다"가 같이 나온다.
  const lastMethod = !hasPassword && identities.length === 1

  const unlink = useMutation({
    mutationFn: (provider: LinkedIdentity['provider']) => unlinkIdentity(provider),
    onSuccess: async () => {
      toast.success('연동을 해제했습니다.')
      await refreshProfile()
    },
    onError: (err) => toast.error(toApiError(err, '연동을 해제하지 못했습니다.').message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>연동된 계정</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {identities.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-neutral-600">연동된 외부 계정이 없습니다.</p>
            <p className="text-sm text-neutral-500">
              로그인 화면에서 같은 주소의 구글 계정으로 한 번 로그인하면 이 계정에 자동으로
              연동됩니다.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {identities.map((identity) => (
              <li
                key={identity.provider}
                className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900">구글</p>
                  <p className="truncate text-sm text-neutral-500">{identity.email}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={lastMethod}
                  loading={unlink.isPending}
                  onClick={() => unlink.mutate(identity.provider)}
                >
                  해제
                </Button>
              </li>
            ))}
          </ul>
        )}
        {lastMethod && (
          <p className="text-sm text-neutral-500">
            유일한 로그인 수단이라 해제할 수 없습니다. 먼저 비밀번호를 설정해 주세요.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * 등록도 해제도 비밀번호를 요구한다(`MfaService`). 비밀번호가 없는 계정은 그 칸을 채울 수
 * 없으므로 등록 버튼 대신 이유를 보여 준다. 서버 완화는 아직 없다.
 */
function TwoFactorSection({ enabled, hasPassword }: { enabled: boolean; hasPassword: boolean }) {
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
            {hasPassword ? (
              <Button onClick={() => setStep('password')}>2단계 인증 등록</Button>
            ) : (
              <p className="text-sm text-neutral-500">
                등록은 비밀번호 확인을 거칩니다. 이 계정에는 비밀번호가 없으니 위의{' '}
                <strong>비밀번호 설정</strong>을 먼저 마쳐 주세요.
              </p>
            )}
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

function WithdrawSection({
  email,
  mfaEnabled,
  hasPassword,
}: {
  email: string
  mfaEnabled: boolean
  hasPassword: boolean
}) {
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
          삭제되지 않은 VM을 보유한 워크스페이스의 유일한 소유자이거나 개인 워크스페이스에 VM이 남아 있으면 먼저
          정리해야 탈퇴할 수 있습니다.
        </p>
        {hasPassword ? (
          <Button variant="danger" onClick={() => setOpen(true)}>
            회원 탈퇴
          </Button>
        ) : (
          <p className="text-sm text-neutral-500">
            탈퇴는 비밀번호 확인을 거칩니다. 이 계정에는 비밀번호가 없으니 위의{' '}
            <strong>비밀번호 설정</strong>을 먼저 마친 뒤 다시 시도해 주세요.
          </p>
        )}
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
