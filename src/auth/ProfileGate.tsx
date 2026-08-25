import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toApiError } from '../api/problem'
import type { components } from '../api/schema'
import { updateMyProfile } from '../api/queries'
import { ProfileFields } from '../components/profile/ProfileFields'
import { EMPTY_PROFILE, type ProfileValues } from '../components/profile/profile-values'
import { Alert, Button, Card, CardContent } from '../components/ui'
import { fieldErrorsOf } from '../lib/field-errors'
import { useAuth } from './auth-context'

/**
 * 프로필이 비어 있는 계정에 직책과 소속을 받는다.
 *
 * V89 이전에 만들어진 계정은 세 값이 전부 비어 있다. 마이그레이션이 기존 행을 채우지
 * 않기 때문이고, 그것이 옳다. 채우는 곳은 여기다.
 *
 * 띄울지는 `profileComplete` 하나로 판단한다. 필드가 null 인지 보고 유도하지 않는 이유는
 * 어떤 필드가 필수인지가 직책에 달렸기 때문이다. 저쪽에서 다시 유도하면 이미 서버에 있는
 * 규칙의 두 번째 사본이 생기고, 둘은 언젠가 어긋난다.
 *
 * 약관 게이트 다음에 온다. 개인정보처리방침에 동의하기 전에 개인정보를 받는 것은 순서가
 * 거꾸로다.
 */
export function ProfileGate() {
  const { refreshProfile, logout } = useAuth()
  const [profile, setProfile] = useState<ProfileValues>(EMPTY_PROFILE)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      updateMyProfile({
        position: profile.position as components['schemas']['UserPosition'],
        studentNo: profile.studentNo.trim() || undefined,
        departmentCode: profile.departmentCode,
      }),
    onSuccess: async () => {
      setError(null)
      setFieldErrors({})
      await refreshProfile()
    },
    onError: (err) => {
      const apiError = toApiError(err, '프로필을 저장하지 못했습니다.')
      const mapped = fieldErrorsOf(apiError.problem)
      setFieldErrors(mapped)
      if (Object.keys(mapped).length === 0) setError(apiError.message)
    },
  })

  const ready = profile.position !== '' && profile.departmentCode !== ''

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-12">
      <Card className="w-full">
        <CardContent className="space-y-4 py-8">
          <h1 className="text-xl font-bold text-neutral-900">소속 정보를 입력해 주세요</h1>
          <p className="text-sm text-neutral-600">
            수업에서 계정을 찾으려면 직책과 소속이 필요합니다. 한 번만 입력하면 됩니다.
          </p>
          {error && <Alert variant="danger">{error}</Alert>}
          <div className="space-y-4">
            <ProfileFields
              values={profile}
              onChange={setProfile}
              errors={fieldErrors}
              disabled={save.isPending}
            />
          </div>
          <Button
            className="w-full"
            loading={save.isPending}
            disabled={!ready}
            onClick={() => save.mutate()}
          >
            저장
          </Button>
          {/*
            게이트가 셸 전체를 대신하므로 여기서 나갈 길이 없으면 폼을 완료할 수 없는
            사람이 갇힌다. 약관 게이트도 같은 구조인데 로그아웃이 없었다.
          */}
          <p className="text-center text-sm">
            <button
              type="button"
              onClick={() => void logout()}
              className="font-medium text-neutral-500 hover:underline"
            >
              로그아웃
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
