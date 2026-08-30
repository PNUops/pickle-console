import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invalidateResourceLists, updateVmGatewayBlock } from '../api/queries'
import { toApiError } from '../api/problem'
import { Alert, Button, Modal, Textarea } from './ui'

/**
 * 관리자 VM 상세의 SSH·웹 터미널 차단 토글 섹션. 수행은 SYS_ADMIN 전용이며,
 * 비권한 관리자에게는 섹션 자체를 렌더하지 않는다.
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
      onDone(nextBlocked ? 'SSH·웹 터미널 접속을 차단했습니다.' : '차단을 해제했습니다.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
      await invalidateResourceLists(queryClient)
    },
    onError: (err) => {
      setError(toApiError(err, '차단 상태를 변경하지 못했습니다.').message)
    },
  })

  if (!canManage) return null

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">SSH·웹 터미널 차단</h3>
      <p className="text-sm text-neutral-500">
        {vm.sshGatewayBlocked
          ? '현재 차단됨 — SSH 게이트웨이·웹 터미널 접속이 거부됩니다. 이미 열린 웹 터미널 세션은 웹 터미널 세션 화면에서 별도로 강제 종료해야 합니다.'
          : 'VM 단위 킬 스위치입니다. 차단하면 SSH 게이트웨이·웹 터미널 접속이 모두 거부됩니다. 전역 킬 스위치와 독립적으로 동작합니다.'}
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
              차단 즉시 이 VM으로의 SSH 게이트웨이 라우팅과 웹 터미널 세션 생성이
              거부됩니다. 워크스페이스 구성원에게 별도 통지는 발송되지 않습니다.
            </Alert>
          ) : (
            <p className="text-sm text-neutral-600">
              차단을 해제하면 SSH 게이트웨이·웹 터미널 접속이 다시 허용됩니다.
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
              placeholder="VM 이벤트·감사 기록에 포함됩니다."
            />
          </label>
        </div>
      </Modal>
    </section>
  )
}
