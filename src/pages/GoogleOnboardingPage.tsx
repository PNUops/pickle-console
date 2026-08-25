import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { api } from '../api/client'
import { isProblem } from '../api/problem'
import { fetchCurrentTerms } from '../api/queries'
import type { components } from '../api/schema'
import { setAccessToken } from '../api/token'
import { homePathFor, useAuth } from '../auth/auth-context'
import { ConsentCheckboxes } from '../components/auth/ConsentCheckboxes'
import { allConsented } from '../components/auth/consent-values'
import { ProfileFields } from '../components/profile/ProfileFields'
import { EMPTY_PROFILE, type ProfileValues } from '../components/profile/profile-values'
import { TransitionLink } from '../components/TransitionLink'
import { Alert, Button, FormField, Input } from '../components/ui'
import { AuthCard, AuthCardContent } from '../layouts/AuthLayout'
import { fieldErrorsOf } from '../lib/field-errors'
import { takeReturnTo } from '../lib/google-oauth'
import { safeInternalPath } from '../lib/redirect'
import { POST_LOGIN_OVERLAY_KEY } from '../lib/storage-keys'

interface RegistrationState {
  registrationToken: string
  email: string
  name?: string
}

const FIELDS = ['name', 'position', 'studentNo', 'departmentCode'] as const

/**
 * 구글로 처음 들어온 사람의 가입 폼.
 *
 * 계정은 아직 없다. 콜백이 계정을 만들지 않고 단회용 가입 토큰만 돌려주기 때문인데,
 * 가입은 사용자 생성과 약관 동의 기록을 한 트랜잭션에 묶어 동의가 불완전하면 사용자까지
 * 되돌린다. 콜백에서 행을 만들면 이 화면을 이탈한 사람의 계정이 아무것도 동의하지 않은
 * 채 남는다.
 *
 * 주소와 비밀번호는 받지 않는다. 주소는 토큰이 대신하는 검증된 신원의 것이고, 구글로
 * 만든 계정에는 비밀번호가 없다.
 */
export function GoogleOnboardingPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()
  const registration = (location.state as { registration?: RegistrationState } | null)?.registration

  const { data: currentTerms = [] } = useQuery({
    queryKey: ['meta', 'terms'],
    queryFn: fetchCurrentTerms,
  })

  const [name, setName] = useState(registration?.name ?? '')
  const [profile, setProfile] = useState<ProfileValues>(EMPTY_PROFILE)
  const [agreed, setAgreed] = useState<Record<string, boolean>>({})
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<(typeof FIELDS)[number], string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 새로고침이나 직접 진입이면 토큰이 없다. 이 화면만으로는 아무것도 할 수 없으므로
  // 처음부터 다시 시작하게 한다.
  if (!registration) {
    return <Navigate to="/login" replace />
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)

    const errors: typeof fieldErrors = {}
    if (!name.trim()) errors.name = '이름을 입력해 주세요.'
    if (!profile.position) errors.position = '직책을 선택해 주세요.'
    if (!profile.departmentCode) errors.departmentCode = '소속을 선택해 주세요.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    if (!allConsented(currentTerms, agreed)) {
      setFormError('이용약관과 개인정보처리방침에 모두 동의해야 가입할 수 있습니다.')
      return
    }

    setSubmitting(true)
    try {
      const { data, error } = await api.POST('/auth/oauth/google/complete', {
        body: {
          registrationToken: registration.registrationToken,
          name: name.trim(),
          position: profile.position as components['schemas']['UserPosition'],
          studentNo: profile.studentNo.trim() || undefined,
          departmentCode: profile.departmentCode,
          consents: currentTerms.map((doc) => ({ docType: doc.docType, version: doc.version })),
        },
      })
      if (data) {
        setAccessToken(data.accessToken)
        await refreshProfile()
        sessionStorage.setItem(POST_LOGIN_OVERLAY_KEY, '1')
        navigate(safeInternalPath(takeReturnTo()) ?? homePathFor(data.user.role), { replace: true })
        return
      }
      if (isProblem(error) && error.code === 'VALIDATION_FAILED') {
        const mapped = fieldErrorsOf(error)
        const serverErrors: typeof fieldErrors = {}
        for (const key of FIELDS) if (mapped[key]) serverErrors[key] = mapped[key]
        setFieldErrors(serverErrors)
        if (Object.keys(serverErrors).length === 0) setFormError(error.detail ?? error.title)
        return
      }
      setFormError(
        (isProblem(error) ? (error.detail ?? error.title) : null) ??
          '가입을 마치지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full">
      <h1 className="text-center text-2xl font-bold text-white">가입 정보 입력</h1>
      <p className="mt-2 text-center text-sm text-neutral-400">
        <strong className="text-neutral-200">{registration.email}</strong> 계정으로 가입합니다.
      </p>
      <AuthCard className="mt-8">
        <AuthCardContent>
          <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
            {formError && <Alert variant="danger">{formError}</Alert>}
            <FormField label="이름" required error={fieldErrors.name}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={50}
                disabled={submitting}
                required
              />
            </FormField>

            <div className="space-y-4 border-t border-white/10 pt-5">
              <p className="text-sm font-medium text-neutral-300">소속 정보</p>
              <ProfileFields
                values={profile}
                onChange={setProfile}
                errors={fieldErrors}
                disabled={submitting}
              />
            </div>

            <div className="space-y-2 border-t border-white/10 pt-5">
              <ConsentCheckboxes
                documents={currentTerms}
                agreed={agreed}
                onChange={setAgreed}
                disabled={submitting}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              loading={submitting}
              disabled={!allConsented(currentTerms, agreed)}
            >
              가입 완료
            </Button>
            <p className="text-center text-sm text-neutral-400">
              <TransitionLink to="/login" className="font-medium text-primary-300 hover:underline">
                취소하고 로그인 화면으로
              </TransitionLink>
            </p>
          </form>
        </AuthCardContent>
      </AuthCard>
    </div>
  )
}
