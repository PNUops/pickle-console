import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateVmPeriod } from '../api/queries'
import { toApiError } from '../api/problem'
import { Alert, Button, FormField, Input, Modal } from './ui'
import { fieldErrorsOf } from '../lib/field-errors'
import { todayKstDate } from '../lib/format'

/**
 * VM 사용 기간 연장 모달. 만료 관리 목록과 VM 관리 드로어가 공유한다.
 * 연장은 관리자 4역할 전부 수행 가능(기관 계층은 자기 기관 VM 한정 — 서버 강제).
 */
export function ExtendVmPeriodModal({
  vm,
  onClose,
  onDone,
}: {
  vm: { id: number; name: string; endDate?: string | null }
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const extend = useMutation({
    mutationFn: () => updateVmPeriod(vm.id, { endDate }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
      await queryClient.invalidateQueries({ queryKey: ['vms'] })
      onDone('연장되었습니다. 중지된 VM은 VM 관리에서 다시 시작해 주세요.')
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
    if (!endDate) {
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
        <FormField label="새 종료일" required error={fieldErrors.endDate}>
          <Input
            type="date"
            min={todayKstDate()}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="w-44"
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" loading={extend.isPending}>
            연장
          </Button>
        </div>
      </form>
    </Modal>
  )
}
