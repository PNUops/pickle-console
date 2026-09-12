import { useState } from 'react'
import { GpuDurationField } from '../gpu/GpuDurationField'
import { FormField, Input, Textarea } from '../ui'
import { gpuDurationHours, gpuDurationLabel, type GpuDurationUnit } from '../../lib/gpu-duration'
import { todayKstDate } from '../../lib/format'
import { Field } from './Field'
import { periodText } from './period-text'
import type { RequestKindView, DecisionFormApi } from './types'
import type { RequestDetail } from '../../api/queries'

function useGpuApproveForm(request: RequestDetail): DecisionFormApi {
  const [duration, setDuration] = useState('')
  const [unit, setUnit] = useState<GpuDurationUnit>('hours')
  const [endDate, setEndDate] = useState(request.reqEndDate ?? '')
  const [comment, setComment] = useState('')
  const hours = gpuDurationHours(duration, unit)
  return {
    validate: () => {
      const errors: Record<string, string> = {}
      if (hours == null) errors['gpu.leaseHours'] = '승인할 임대 기간을 1 이상의 정수로 입력해 주세요.'
      if (endDate && endDate < todayKstDate()) errors.grantedEndDate = '사용 종료일은 오늘 이후여야 합니다.'
      return errors
    },
    fields: (errors) => (
      <>
        <p className="text-sm text-neutral-600">희망 임대 기간: {gpuDurationLabel(request.gpu?.leaseHours)}</p>
        <GpuDurationField label="승인 GPU 임대 기간" value={duration} unit={unit} onValueChange={setDuration} onUnitChange={setUnit} error={errors['gpu.leaseHours']} />
        <FormField label="승인 사용 종료일" error={errors.grantedEndDate} description="GPU 임대 만료는 이 날짜를 넘지 않습니다.">
          <Input type="date" min={todayKstDate()} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </FormField>
        <FormField label="검토 의견" error={errors.comment}>
          <Textarea value={comment} maxLength={2000} onChange={(event) => setComment(event.target.value)} />
        </FormField>
      </>
    ),
    body: () => {
      if (hours == null) throw new Error('GPU 임대 기간을 입력해 주세요.')
      return { grantedStartDate: todayKstDate(), grantedEndDate: endDate || null, comment: comment.trim() || null, gpu: { leaseHours: hours } }
    },
    confirmBody: <p>GPU 임대 {gpuDurationLabel(hours)}을 승인합니다. 승인 순서대로 빈 GPU를 할당하며, 연결은 사용자가 직접 실행합니다.</p>,
    successMessage: 'GPU 신청을 승인했습니다.',
  }
}

export const gpuRequestView: RequestKindView = {
  decisionPrefetchQueries: [],
  summaryCell: (request) => `GPU 1장 · ${gpuDurationLabel(request.gpu?.leaseHours)}`,
  contentFields: (request) => <>
    <Field label="워크스페이스">{request.workspaceName}</Field>
    <Field label="기관">{request.orgName}</Field>
    <Field label="표시명">{request.displayName}</Field>
    <Field label="사용 기간">{periodText(request)}</Field>
    <Field label="희망 GPU 임대 기간">{gpuDurationLabel(request.gpu?.leaseHours)}</Field>
    <Field label="대상 VM">{request.gpu?.vmName ?? '나중에 선택'}</Field>
    <Field label="용도">{request.purpose}</Field>
    <Field label="기타 참고">{request.extraNote ?? '—'}</Field>
  </>,
  resultFields: (request) => <Field label="승인 GPU 임대 기간">{gpuDurationLabel(request.gpu?.grantedLeaseHours)}</Field>,
  useDecisionData: () => ({ status: 'ready', value: null }),
  useApproveForm: useGpuApproveForm,
}
