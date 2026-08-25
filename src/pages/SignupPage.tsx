import { TransitionLink } from '../components/TransitionLink'
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { components } from '../api/schema'
import { isProblem, toApiError } from '../api/problem'
import { fetchCurrentTerms, startGoogleOauth } from '../api/queries'
import { ResendVerification } from '../components/ResendVerification'
import { Alert, Button, Checkbox, FormField, Input } from '../components/ui'
import { PasswordGuidance } from '../components/PasswordGuidance'
import { AuthDivider } from '../components/auth/AuthDivider'
import { GoogleAuthButton } from '../components/auth/GoogleAuthButton'
import { navigateExternal } from '../lib/google-oauth'
import { AuthCard, AuthCardContent } from '../layouts/AuthLayout'
import type { ProfileValues } from '../components/profile/profile-values'
import { ProfileFields } from '../components/profile/ProfileFields'
import { EMPTY_PROFILE } from '../components/profile/profile-values'
import { fieldErrorsOf } from '../lib/field-errors'
import { passwordRuleError, PUSAN_EMAIL_RE } from '../lib/validation'

/** 서버 필드 오류를 붙일 수 있는 슬롯. 여기 없는 필드는 상단 알림으로 간다. */
const SIGNUP_FIELDS = [
  'name',
  'email',
  'password',
  'passwordConfirm',
  'position',
  'studentNo',
  'departmentCode',
] as const

/** 체크리스트를 비밀번호 입력의 설명으로 연결하기 위한 고정 id. */
const GUIDANCE_ID = 'signup-password-guidance'

interface FieldErrors {
  name?: string
  email?: string
  password?: string
  passwordConfirm?: string
  position?: string
  studentNo?: string
  departmentCode?: string
}

function validate(values: {
  name: string
  email: string
  password: string
  passwordConfirm: string
  profile: ProfileValues
}): FieldErrors {
  const errors: FieldErrors = {}
  if (!values.name.trim()) {
    errors.name = '이름을 입력해 주세요.'
  }
  if (!PUSAN_EMAIL_RE.test(values.email)) {
    errors.email = '@pusan.ac.kr 이메일만 가입할 수 있습니다.'
  }
  // 서버와 같은 규칙(길이·바이트·반복·연속)으로 제출 전에 막는다.
  const passwordError = passwordRuleError(values.password)
  if (passwordError) {
    errors.password = passwordError
  }
  if (values.passwordConfirm !== values.password) {
    errors.passwordConfirm = '비밀번호가 일치하지 않습니다.'
  }
  // 학번 필수 여부는 서버가 직책마다 내려보내므로 여기서 판단하지 않는다.
  // 비어 있는 두 값만 막고 나머지는 서버가 422로 답한다.
  if (!values.profile.position) {
    errors.position = '직책을 선택해 주세요.'
  }
  if (!values.profile.departmentCode) {
    errors.departmentCode = '소속을 선택해 주세요.'
  }
  return errors
}

export function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [agreed, setAgreed] = useState<Record<string, boolean>>({})
  const [consentError, setConsentError] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileValues>(EMPTY_PROFILE)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)

  const googleStart = useMutation({
    mutationFn: () => startGoogleOauth({}),
    onSuccess: (started) => navigateExternal(started.authorizationUrl),
  })

  const terms = useQuery({ queryKey: ['terms'], queryFn: fetchCurrentTerms })
  const currentTerms = terms.data ?? []
  const allAgreed = currentTerms.length > 0 && currentTerms.every((doc) => agreed[doc.docType])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    setConsentError(null)
    const errors = validate({ name, email, password, passwordConfirm, profile })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    if (!allAgreed) {
      setConsentError('이용약관과 개인정보처리방침에 모두 동의해야 가입할 수 있습니다.')
      return
    }

    setSubmitting(true)
    try {
      const { data, error } = await api.POST('/auth/signup', {
        body: {
          name: name.trim(),
          email,
          password,
          position: profile.position as components['schemas']['UserPosition'],
          studentNo: profile.studentNo.trim() || undefined,
          departmentCode: profile.departmentCode,
          consents: currentTerms.map((doc) => ({ docType: doc.docType, version: doc.version })),
        },
      })
      if (data) {
        setCompleted(true)
        return
      }
      if (isProblem(error) && error.code === 'VALIDATION_FAILED' && error.errors) {
        // fieldErrorsOf 로 전부 받은 뒤 이 폼이 가진 슬롯만 고른다. 예전에는 이름을
        // 하나씩 나열했는데, 그러면 필드가 늘 때 서버가 보낸 오류가 조용히 사라진다.
        const mapped = fieldErrorsOf(error)
        const serverErrors: FieldErrors = {}
        for (const key of SIGNUP_FIELDS) {
          if (mapped[key]) serverErrors[key] = mapped[key]
        }
        setFieldErrors(serverErrors)
        if (Object.keys(serverErrors).length === 0) {
          setFormError(error.detail ?? error.title)
        }
        return
      }
      setFormError(
        (isProblem(error) ? (error.detail ?? error.title) : null) ??
          '회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (completed) {
    return (
      <div className="w-full">
        <AuthCard>
          <AuthCardContent className="space-y-4 py-8 text-center">
            <span
              aria-hidden="true"
              className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-100 text-success-700"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-6">
                <path d="M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3 3 0 0 1-3.144 0L1.5 8.67z" />
                <path d="M22.5 6.908V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.158l9.714 5.978a1.5 1.5 0 0 0 1.572 0L22.5 6.908z" />
              </svg>
            </span>
            <h1 className="text-xl font-bold text-white">인증 메일을 확인해 주세요</h1>
            <p className="text-sm leading-relaxed text-neutral-300">
              <strong>{email}</strong> 주소로 인증 메일을 보냈습니다.
              <br />
              메일의 링크를 열면 가입이 완료됩니다. 링크는 24시간 동안 유효합니다.
            </p>
            <div className="flex justify-center">
              <ResendVerification email={email} />
            </div>
            <p className="text-sm text-neutral-500">
              인증을 마치셨나요?{' '}
              <TransitionLink to="/login" className="font-medium text-primary-300 hover:underline">
                로그인
              </TransitionLink>
            </p>
          </AuthCardContent>
        </AuthCard>
      </div>
    )
  }

  return (
    <div className="w-full">
      <h1 className="text-center text-2xl font-bold text-white">회원가입</h1>
      <p className="mt-2 text-center text-sm text-neutral-400">
        부산대학교 이메일(@pusan.ac.kr)로만 가입할 수 있습니다.
      </p>
      <AuthCard className="mt-8">
        <AuthCardContent>
          <div className="space-y-4">
            <GoogleAuthButton
              label="signup"
              loading={googleStart.isPending}
              onClick={() => googleStart.mutate()}
            />
            {googleStart.isError && (
              <Alert variant="danger">
                {toApiError(googleStart.error, '구글 로그인을 시작하지 못했습니다.').message}
              </Alert>
            )}
            <p className="text-center text-xs text-neutral-400">
              @pusan.ac.kr 계정만 가입할 수 있습니다.
            </p>
            <AuthDivider />
          </div>
          <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-4" noValidate>
            {formError && <Alert variant="danger">{formError}</Alert>}
            <FormField label="이름" required error={fieldErrors.name}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="홍길동"
                autoComplete="name"
                maxLength={50}
                required
              />
            </FormField>
            <FormField label="이메일" required error={fieldErrors.email}>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="example@pusan.ac.kr"
                autoComplete="email"
                required
              />
            </FormField>
            <FormField label="비밀번호" required error={fieldErrors.password}>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                aria-describedby={GUIDANCE_ID}
                required
              />
              <PasswordGuidance password={password} id={GUIDANCE_ID} className="mt-1" />
            </FormField>
            <FormField label="비밀번호 확인" required error={fieldErrors.passwordConfirm}>
              <Input
                type="password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                autoComplete="new-password"
                required
              />
            </FormField>

            <div className="space-y-4 border-t border-white/10 pt-5">
              <p className="text-sm font-medium text-neutral-300">소속 정보</p>
              <ProfileFields
                values={profile}
                onChange={setProfile}
                errors={{
                  position: fieldErrors.position,
                  studentNo: fieldErrors.studentNo,
                  departmentCode: fieldErrors.departmentCode,
                }}
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              {consentError && <Alert variant="danger">{consentError}</Alert>}
              {currentTerms.map((doc) => (
                <Checkbox
                  key={doc.docType}
                  checked={agreed[doc.docType] ?? false}
                  onChange={(event) =>
                    setAgreed((prev) => ({ ...prev, [doc.docType]: event.target.checked }))
                  }
                  label={
                    <span>
                      <TransitionLink
                        to={`/terms/${doc.docType}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-primary-300 hover:underline"
                      >
                        {doc.title}
                      </TransitionLink>
                      <span className="text-neutral-500">에 동의합니다.</span>
                    </span>
                  }
                />
              ))}
            </div>

            <Button type="submit" className="w-full" loading={submitting} disabled={!allAgreed}>
              회원가입
            </Button>
          </form>
        </AuthCardContent>
      </AuthCard>
      <p className="mt-6 text-center text-sm text-neutral-400">
        이미 계정이 있으신가요?{' '}
        <TransitionLink to="/login" className="font-medium text-primary-300 hover:underline">
          로그인
        </TransitionLink>
      </p>
    </div>
  )
}
