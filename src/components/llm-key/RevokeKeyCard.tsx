import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invalidateResourceLists, revokeLlmKey } from '../../api/queries'
import { toApiError } from '../../api/problem'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmNameModal,
  PermissionNotice,
  SettingRow,
} from '../ui'

interface RevokeKeyProps {
  keyId: string
  name: string
  /** 서버가 계산해 준 `accessManageAllowed`를 그대로 넘긴다. */
  allowed: boolean
}

/**
 * 키를 죽이는 행.
 *
 * 폐기 권한은 발급 권한과 다르다 — 워크스페이스 소유자와 기관·시스템 관리자는
 * 접근 목록에 없어도 폐기할 수 있다. 유출된 키를 멈출 수 있는 사람이 그 키를 이미
 * 볼 수 있는 사람뿐이면, 소유자가 떠난 키는 아무도 못 죽이거나 누군가 자기에게
 * 권한을 자가 부여해야 하는데, 서버가 그 동선을 피하려고 상시권으로 열어 둔 것이다.
 *
 * 그래서 이 행은 상세 화면 전용이 아니다. 부여 없는 워크스페이스 소유자에게는
 * 상세가 403이므로, 그 사람이 닿는 화면(접근 권한)에도 같은 행이 선다. 문구가
 * 키의 내용(용도·한도·앞부분)을 전제하지 않는 것은 그래서다 — 여기 서 있는 사람이
 * 그것들을 볼 권한이 없을 수 있다. 이름은 접근 목록 응답도 함께 주므로 확인
 * 입력으로 쓸 수 있다.
 */
export function RevokeKeyAction({ keyId, name, allowed }: RevokeKeyProps) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const revoke = useMutation({
    mutationFn: () => revokeLlmKey(keyId),
    onSuccess: async () => {
      setConfirming(false)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['llm-keys', keyId] })
      // 접근 화면은 상세를 부르지 못하므로 이름·상태를 접근 목록 응답에서 읽는다.
      // 그 응답도 무효화해야 폐기가 그 화면의 배지에 닿는다.
      await queryClient.invalidateQueries({ queryKey: ['llm-keys', keyId, 'access'] })
      await invalidateResourceLists(queryClient)
    },
    onError: (err) => {
      setConfirming(false)
      setError(toApiError(err, 'LLM API 키를 폐기하지 못했습니다.').message)
    },
  })

  return (
    <div className="space-y-2">
      <SettingRow
        label="키 폐기"
        description="키를 폐기하면 이후 이 키로 보낸 요청이 거부됩니다."
        action={
          <Button
            variant="danger"
            size="sm"
            disabled={!allowed}
            onClick={() => setConfirming(true)}
          >
            키 폐기
          </Button>
        }
      />
      {!allowed && (
        <PermissionNotice>
          키 폐기는 이 키의 소유자 또는 워크스페이스 소유자만 할 수 있습니다.
        </PermissionNotice>
      )}
      {error && <Alert variant="danger">{error}</Alert>}

      <ConfirmNameModal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="LLM API 키 폐기"
        expectedName={name}
        confirmLabel="폐기"
        loading={revoke.isPending}
        onConfirm={() => revoke.mutate()}
      >
        <div className="space-y-3 text-sm text-neutral-600">
          <Alert variant="danger" title="되돌릴 수 없습니다">
            폐기한 키는 다시 발급할 수 없습니다. 계속 쓰려면 새로 신청해야 합니다.
          </Alert>
          <p>지금까지의 사용 기록은 남습니다.</p>
        </div>
      </ConfirmNameModal>
    </div>
  )
}

/**
 * The revoke row on its own, for the screen that cannot load the key
 * detail. The detail's settings tab puts the same row under the re-issue
 * row instead ({@link ../llm-key/LlmKeyDangerCard}).
 */
export function RevokeKeyCard(props: RevokeKeyProps) {
  return (
    <Card className="border-danger-200">
      <CardHeader>
        <CardTitle className="text-danger-700">되돌릴 수 없는 작업</CardTitle>
      </CardHeader>
      <CardContent>
        <RevokeKeyAction {...props} />
      </CardContent>
    </Card>
  )
}
