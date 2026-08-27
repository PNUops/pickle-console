import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toApiError } from '../api/problem'
import { updateMyProfile } from '../api/queries'
import type { UserProfile } from './auth-context'
import { ProfileFields } from '../components/profile/ProfileFields'
import {
  departmentAnswered,
  lockedProfileFields,
  profilePatch,
  type ProfileValues,
} from '../components/profile/profile-values'
import { Alert, Button, Modal } from '../components/ui'
import { fieldErrorsOf } from '../lib/field-errors'
import {
  dismissProfilePrompt,
  POST_LOGIN_OVERLAY_KEY,
  profilePromptDismissed,
} from '../lib/storage-keys'

/** 환영 오버레이가 아직 뜰 예정이면 그 위에 겹치지 않게 기다린다. */
function overlayPending(): boolean {
  try {
    return sessionStorage.getItem(POST_LOGIN_OVERLAY_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 직책과 소속 학과를 묻는 안내.
 *
 * 게이트가 아니다. 콘솔 셸 위에 뜨고 닫으면 그대로 쓸 수 있다. 프로필은 선택
 * 입력이고, 선택 입력을 받으면서 서비스를 막는 화면은 선택이 아니다.
 *
 * 종전에는 이것이 셸 전체를 대신해서 나갈 길이 로그아웃뿐이었다. 그래서 그때는
 * 로그아웃 버튼이 필요했고, 지금은 닫기가 그 자리를 대신하므로 없다.
 */
export function ProfilePrompt({
  user,
  onSaved,
}: {
  user: UserProfile
  onSaved: () => Promise<void> | void
}) {
  const [closed, setClosed] = useState(() => profilePromptDismissed() || overlayPending())
  // 저장된 값에서 시작한다. 프로필이 미완성인 계정은 절반만 채워진 경우가 많고, 그
  // 절반은 이미 잠겨 있다. 빈 폼으로 시작하면 손대지 않은 칸이 비우기로 전송되어
  // 잠금 422가 나는데, 그 오류는 사용자가 건드리지도 않은 필드를 가리킨다.
  const [profile, setProfile] = useState<ProfileValues>(() => ({
    position: user.position ?? '',
    studentNo: user.studentNo ?? '',
    departmentCode: user.departmentCode ?? '',
    departmentOther: user.departmentOther ?? '',
  }))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const locked = lockedProfileFields(user)

  const save = useMutation({
    mutationFn: () => updateMyProfile(profilePatch(user, profile)),
    onSuccess: async () => {
      setError(null)
      setFieldErrors({})
      await onSaved()
    },
    onError: (err) => {
      const apiError = toApiError(err, '프로필을 저장하지 못했습니다.')
      const mapped = fieldErrorsOf(apiError.problem)
      setFieldErrors(mapped)
      if (Object.keys(mapped).length === 0) setError(apiError.message)
    },
  })

  const close = () => {
    dismissProfilePrompt()
    setClosed(true)
  }

  // 소속은 두 모양 중 하나면 된다. 코드를 요구하면 자유 입력만 쓰는 직책은 저장 버튼이
  // 영원히 비활성이고, 「기타」만으로 통과시키면 소속이 그 무의미한 값으로 잠긴다.
  const ready = profile.position !== '' && departmentAnswered(profile)

  return (
    <Modal
      open={!closed}
      onClose={close}
      title="직책과 소속을 입력해 주세요"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            나중에 입력
          </Button>
          <Button loading={save.isPending} disabled={!ready} onClick={() => save.mutate()}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          입력하지 않아도 모든 기능을 사용할 수 있습니다. 다만 학번으로 사람을 찾는 자리에서는
          학번이 있어야 합니다.
        </p>
        {/*
          잠금을 말하지 않으면 이 화면 자체가 함정이다. 여기서 고른 값은 본인이 되돌릴 수
          없고, 되돌리는 데 사람이 필요하다는 것을 고르기 전에 알아야 한다.
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
      </div>
    </Modal>
  )
}
