import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  cancelScheduledVmDeletion,
  forceDeleteVm,
  invalidateResourceLists,
  scheduleVmDeletion,
  type VmDetail,
} from '../../api/queries'
import { toApiError } from '../../api/problem'
import { fieldErrorsOf } from '../../lib/field-errors'
import { formatDateTime, isShortNotice, minScheduleDate } from '../../lib/format'
import { Alert, Button, ConfirmNameModal, FormField, Input, Textarea } from '../ui'

/** Existing deletion actions belong to the exact VM detail, not a list preview. */
export function AdminVmDeletionSections({ vm, canDelete, canForceDelete, onDone }: {
  vm: VmDetail
  canDelete: boolean
  canForceDelete: boolean
  onDone: (message: string) => void
}) {
  const canSchedule = canDelete && vm.deletion == null && vm.status !== 'DELETED' && vm.status !== 'DELETING'
  const canCancel = canDelete && vm.status !== 'DELETED' && vm.deletion?.cancelable === true
  const canForce = canForceDelete && vm.status !== 'DELETED'
  if (vm.deletion == null && !canSchedule && !canForce) return null

  return (
    <div className="space-y-6">
      {vm.deletion && <DeletionStatus deletion={vm.deletion} deleted={vm.status === 'DELETED'} />}
      {canSchedule && <ScheduleDeleteForm vm={vm} onDone={onDone} />}
      {canCancel && <CancelDeleteAction vm={vm} onDone={onDone} />}
      {canForce && <ForceDeleteAction vm={vm} onDone={onDone} />}
    </div>
  )
}

function DeletionStatus({ deletion, deleted }: { deletion: NonNullable<VmDetail['deletion']>; deleted: boolean }) {
  if (deleted) return <Alert variant="info" title="삭제됨">{deletion.reason && <p>사유: {deletion.reason}</p>}</Alert>
  return (
    <Alert
      variant={deletion.cancelable ? 'warning' : 'danger'}
      title={deletion.cancelable ? '삭제 예약됨' : '삭제가 진행 중입니다'}
    >
      <p>{formatDateTime(deletion.scheduledFor)} 파기 예정</p>
      {deletion.reason && <p>사유: {deletion.reason}</p>}
      {!deletion.cancelable && <p>이미 파기가 시작됐거나 강제 삭제라 취소할 수 없습니다.</p>}
    </Alert>
  )
}



function ScheduleDeleteForm({
  vm,
  onDone,
}: {
  vm: VmDetail
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const schedule = useMutation({
    mutationFn: () =>
      scheduleVmDeletion(vm.id, {
        // Preserve the selected KST calendar day when serializing the deletion time.
        scheduledFor: new Date(`${date}T00:00:00+09:00`).toISOString(),
        reason,
      }),
    onSuccess: async () => {
      setError(null)
      setFieldErrors({})
      setDate('')
      setReason('')
      onDone('삭제 예약을 접수했습니다. 사용자에게 사유가 포함된 통보 메일이 발송됩니다.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
      await invalidateResourceLists(queryClient)
    },
    onError: (err) => {
      const apiError = toApiError(err, '삭제 예약을 접수하지 못했습니다.')
      setFieldErrors(fieldErrorsOf(apiError.problem))
      setError(apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    if (!date) {
      setFieldErrors({ scheduledFor: '파기 예정일을 선택해 주세요.' })
      return
    }
    if (!reason.trim()) {
      setFieldErrors({ reason: '삭제 사유를 입력해 주세요.' })
      return
    }
    schedule.mutate()
  }

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">삭제 예약</h3>
      <p className="text-sm text-neutral-500">
        접수 즉시 사용자에게 통보 메일이 발송됩니다. 파기가 시작되기 전까지는 취소할 수
        있습니다.
      </p>
      {date && isShortNotice(date) && (
        <Alert variant="warning">
          권장 통보 기간(7일)보다 이른 파기 예정일입니다.
        </Alert>
      )}
      {error && Object.keys(fieldErrors).length === 0 && (
        <Alert variant="danger">{error}</Alert>
      )}
      <form onSubmit={submit} className="flex flex-wrap items-start gap-4" noValidate>
        <FormField label="파기 예정일" required error={fieldErrors.scheduledFor}>
          <Input
            type="date"
            min={minScheduleDate()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-44"
          />
        </FormField>
        <FormField
          label="삭제 사유"
          required
          error={fieldErrors.reason}
          className="min-w-64 flex-1"
        >
          <Textarea
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="사용자 통보 메일에 그대로 포함됩니다."
          />
        </FormField>
        <Button
          type="submit"
          variant="danger"
          loading={schedule.isPending}
          className="mt-6"
        >
          삭제 예약
        </Button>
      </form>
    </section>
  )
}

function CancelDeleteAction({
  vm,
  onDone,
}: {
  vm: VmDetail
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const cancel = useMutation({
    mutationFn: () => cancelScheduledVmDeletion(vm.id),
    onSuccess: async (data) => {
      setError(null)
      onDone(data.message)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
      await invalidateResourceLists(queryClient)
    },
    onError: (err) => setError(toApiError(err, '접수된 삭제를 취소하지 못했습니다.').message),
  })

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">대기 중인 삭제 취소</h3>
      <p className="text-sm text-neutral-500">
        본인 삭제를 취소하면 VM은 중지됨 상태로 남고(시작은 사용자가 수행), 관리자 삭제를
        취소하면 현재 전원 상태가 유지됩니다.
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      <Button
        variant="secondary"
        loading={cancel.isPending}
        onClick={() => cancel.mutate()}
      >
        삭제 취소
      </Button>
    </section>
  )
}

function ForceDeleteAction({
  vm,
  onDone,
}: {
  vm: VmDetail
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const destroy = useMutation({
    mutationFn: (confirmName: string) => forceDeleteVm(vm.id, confirmName),
    onSuccess: async (data) => {
      setOpen(false)
      setError(null)
      onDone(data.message)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
      await invalidateResourceLists(queryClient)
    },
    onError: async (err) => {
      // Preserve the entered name and show the error inside the open confirmation.
      setError(toApiError(err, '강제 삭제를 접수하지 못했습니다.').message)
      // Refetch metadata after a name or state conflict without retrying the mutation.
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
    },
  })

  return (
    <section className="space-y-3 rounded-lg border border-danger-200 p-4">
      <h3 className="text-sm font-semibold text-danger-700">강제 삭제</h3>
      <p className="text-sm text-neutral-500">
        보안 사고 등 비상 상황에서 씁니다.
      </p>
      {error && !open && <Alert variant="danger">{error}</Alert>}
      <Button
        variant="danger"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        강제 삭제
      </Button>
      <ConfirmNameModal
        open={open}
        onClose={() => setOpen(false)}
        title="VM 강제 삭제"
        expectedName={vm.name}
        confirmLabel="즉시 파기"
        loading={destroy.isPending}
        // Send the entered name; the server performs the exact-name confirmation.
        onConfirm={(typedName) => destroy.mutate(typedName)}
      >
        <Alert variant="danger" title="되돌릴 수 없는 작업입니다">
          유예 없이 즉시 강제 종료 후 파기되며, 데이터는 복구할 수 없습니다. 기관
          관리자와 사용자에게 통지되고 감사 기록이 남습니다.
        </Alert>
        {error && <Alert variant="danger">{error}</Alert>}
      </ConfirmNameModal>
    </section>
  )
}
