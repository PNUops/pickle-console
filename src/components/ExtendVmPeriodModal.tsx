import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invalidateResourceLists, updateVmPeriod } from '../api/queries'
import { toApiError } from '../api/problem'
import { Alert, Button, Checkbox, FormField, Input, Modal } from './ui'
import { fieldErrorsOf } from '../lib/field-errors'
import { todayKstDate } from '../lib/format'

/**
 * VM 사용 기간 연장 모달. 만료 관리 목록과 VM 관리 드로어가 공유한다.
 * 연장은 운영 역할만 수행 가능 — 열람 역할은 조회만이고, 기관 계층은 자기가
 * 운영하는 기관의 VM 한정이다 (서버 강제).
 */
export function ExtendVmPeriodModal({
  vm,
  onClose,
  onDone,
}: {
  vm: { id: string; name: string; endDate?: string | null }
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [endDate, setEndDate] = useState('')
  const [indefinite, setIndefinite] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const extend = useMutation({
    // 서버는 날짜 지정과 지우기를 함께 받지 않는다. 화면도 한쪽만 보낸다.
    mutationFn: () =>
      updateVmPeriod(vm.id, indefinite ? { clearEndDate: true } : { endDate }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
      await invalidateResourceLists(queryClient)
      onDone(
        indefinite
          ? '무기한으로 바꿨습니다. 중지된 VM은 VM 관리에서 다시 시작해 주세요.'
          : '연장되었습니다. 중지된 VM은 VM 관리에서 다시 시작해 주세요.',
      )
    },
    onError: (err) => {
      const apiError = toApiError(err, '사용 기간을 변경하지 못했습니다.')
      setFieldErrors(fieldErrorsOf(apiError.problem))
      setError(apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    if (!indefinite && !endDate) {
      setFieldErrors({ endDate: '새 종료일을 선택해 주세요.' })
      return
    }
    extend.mutate()
  }

  return (
    <Modal open onClose={onClose} title={`기간 연장 — ${vm.name}`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-neutral-600">
          현재 종료일: <strong>{vm.endDate ?? '미지정'}</strong>. 새 종료일 당일까지 사용할
          수 있으며, 만료로 중지된 VM은 연장 후 다시 시작할 수 있습니다.
        </p>
        {error && Object.keys(fieldErrors).length === 0 && (
          <Alert variant="danger">{error}</Alert>
        )}
        {!indefinite && (
          <FormField label="새 종료일" required error={fieldErrors.endDate}>
            <Input
              type="date"
              min={todayKstDate()}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-44"
            />
          </FormField>
        )}
        <Checkbox
          label="무기한"
          description="종료일을 지웁니다. 만료로 자동 중지되지 않습니다."
          checked={indefinite}
          onChange={(event) => setIndefinite(event.target.checked)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" loading={extend.isPending}>
            {indefinite ? '무기한으로' : '연장'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
