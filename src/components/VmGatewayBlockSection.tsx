import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invalidateResourceLists, updateVmGatewayBlock } from '../api/queries'
import { toApiError } from '../api/problem'
import { Alert, Button, Modal, Textarea } from './ui'

/**
 * Administrator VM detail control for SSH and web-terminal blocking.
 * Only SYS_ADMIN may act; other administrators do not receive the controls.
 */
export function VmGatewayBlockSection({
  vm,
  canManage,
  onDone,
}: {
  vm: { id: string; sshGatewayBlocked?: boolean | null }
  canManage: boolean
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const nextBlocked = !vm.sshGatewayBlocked

  const toggle = useMutation({
    mutationFn: () =>
      updateVmGatewayBlock(vm.id, {
        blocked: nextBlocked,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    onSuccess: async () => {
      setOpen(false)
      setReason('')
      setError(null)
      onDone(nextBlocked ? '이 VM의 접속 차단을 설정했어요.' : '차단을 해제했어요.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
      await invalidateResourceLists(queryClient)
    },
    onError: (err) => {
      setError(toApiError(err, '차단 상태를 변경하지 못했어요.').message)
    },
  })

  if (!canManage) return null

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">SSH·웹 터미널 차단</h3>
      <p className="text-sm text-neutral-500">
        {vm.sshGatewayBlocked
          ? '새 SSH 연결과 웹 터미널 생성을 차단한 상태예요. 열려 있는 웹 터미널은 다음 권한 검사(1분 간격) 때 닫혀요. 즉시 닫으려면 웹 터미널 세션 화면에서 강제 종료해 주세요.'
          : '이 VM의 새 SSH 연결과 웹 터미널 생성을 차단해요. 열려 있는 웹 터미널도 다음 권한 검사 때 닫혀요.'}
      </p>
      {error && !open && <Alert variant="danger">{error}</Alert>}
      <Button
        variant={vm.sshGatewayBlocked ? 'secondary' : 'danger'}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        {vm.sshGatewayBlocked ? '차단 해제' : '접속 차단'}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={nextBlocked ? 'SSH·웹 터미널 차단' : '차단 해제'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              돌아가기
            </Button>
            <Button
              variant={nextBlocked ? 'danger' : 'primary'}
              loading={toggle.isPending}
              onClick={() => toggle.mutate()}
            >
              {nextBlocked ? '차단' : '해제'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {nextBlocked ? (
            <Alert variant="warning">
              새 SSH 연결과 웹 터미널 생성이 거부돼요. 이미 열린 SSH 연결은 유지돼요.
              열려 있는 웹 터미널은 다음 권한 검사(1분 간격) 때 닫혀요.
              워크스페이스 구성원에게 별도 알림은 보내지 않아요.
            </Alert>
          ) : (
            <p className="text-sm text-neutral-600">
              이 VM의 차단을 해제해요. SSH와 웹 터미널 각각의 전역 설정은 계속 적용돼요.
            </p>
          )}
          {error && <Alert variant="danger">{error}</Alert>}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-neutral-700">사유 (선택)</span>
            <Textarea
              rows={2}
              value={reason}
              maxLength={200}
              onChange={(event) => setReason(event.target.value)}
              placeholder="VM 이벤트와 감사 기록에 포함돼요."
            />
          </label>
        </div>
      </Modal>
    </section>
  )
}
