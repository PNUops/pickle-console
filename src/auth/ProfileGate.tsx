import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toApiError } from '../api/problem'
import { fetchSystemStatus, updateMyProfile } from '../api/queries'
import { useAuth, type UserProfile } from './auth-context'
import { ProfileFields } from '../components/profile/ProfileFields'
import {
  departmentAnswered,
  lockedProfileFields,
  profilePatch,
  type ProfileValues,
} from '../components/profile/profile-values'
import { ContactEmail } from '../components/ContactEmail'
import { Alert, Button, Card, CardContent } from '../components/ui'
import { fieldErrorsOf } from '../lib/field-errors'

/**
 * Asks for 직책, 학번 and 소속 in place of the authenticated shell until the
 * account has answered them.
 *
 * This is a gate, like ConsentGate beside it, and the API is not blocked: the
 * server still allows every operation on an account without a profile. The
 * console decides from the one flag the server sends (`profileComplete`), so
 * the rule for "answered" has a single home.
 *
 * Until v0.87.0 this was a prompt the holder could dismiss for the session.
 * The operator made the profile required on 2026-09-27, ahead of workspace
 * invitations that name people by 학번.
 *
 * Logout is the only other way out. A gate that replaces the shell with no
 * exit traps whoever opened someone else's session on a shared machine.
 *
 * The inquiry address is on the gate itself, not only in the shell. One 학번
 * belongs to one account (V131), so a student whose number another account
 * saved first is refused here with no way past it on their own: the fix is an
 * administrator's correction, and the gate is the only screen they can reach.
 */
export function ProfileGate({ user }: { user: UserProfile }) {
  const { refreshProfile, logout } = useAuth()
  // Start from the stored values. An incomplete profile is often half filled,
  // and that half is already locked; an empty form would send the untouched
  // fields as clears and get a lock 422 naming fields nobody edited.
  const [profile, setProfile] = useState<ProfileValues>(() => ({
    position: user.position ?? '',
    studentNo: user.studentNo ?? '',
    departmentCode: user.departmentCode ?? '',
    departmentOther: user.departmentOther ?? '',
  }))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const locked = lockedProfileFields(user)
  const { data: systemStatus } = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
  })

  const save = useMutation({
    mutationFn: () => updateMyProfile(profilePatch(user, profile)),
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

  // Either shape of 소속 answers it. Requiring the code would leave the save
  // button disabled forever for positions that write 소속 out, and accepting
  // 「기타」 alone would lock 소속 to a value that says nothing.
  const ready = profile.position !== '' && departmentAnswered(profile)

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-12">
      <Card className="w-full">
        <CardContent className="space-y-4 py-8">
          <h1 className="text-xl font-bold text-neutral-900">직책과 소속을 입력해 주세요</h1>
          {/*
            Without this the screen is a trap: what is chosen here the holder
            cannot undo, and they have to know that before choosing.
          */}
          <Alert variant="info">
            직책과 학번과 소속은 저장한 뒤에는 직접 바꿀 수 없습니다. 변경이 필요하면 문의를
            거쳐 관리자가 처리합니다.
          </Alert>
          {error && <Alert variant="danger">{error}</Alert>}
          <ProfileFields
            values={profile}
            onChange={setProfile}
            errors={fieldErrors}
            disabled={save.isPending}
            locked={locked}
          />
          <Button
            className="w-full"
            loading={save.isPending}
            disabled={!ready}
            onClick={() => save.mutate()}
          >
            저장하고 계속하기
          </Button>
          {systemStatus?.contactEmail && (
            <p className="text-center text-sm text-neutral-600">
              입력할 수 없는 문제가 있으면 문의해 주세요:{' '}
              <ContactEmail email={systemStatus.contactEmail} />
            </p>
          )}
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
