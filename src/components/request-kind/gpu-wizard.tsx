import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchVm } from '../../api/queries'
import { fetchGpuRequestVms } from '../../api/gpu'
import { GpuDurationField } from '../gpu/GpuDurationField'
import { Alert, FormField, Select } from '../ui'
import { gpuDurationHours, gpuDurationLabel, type GpuDurationUnit } from '../../lib/gpu-duration'
import type { CommonWizardState, FieldErrors, KindWizard, RequestKindModule } from './types'

interface GpuSpecState { vmId: string; duration: string; unit: GpuDurationUnit }

function initialSpec(draft: unknown): GpuSpecState {
  const base: GpuSpecState = { vmId: '', duration: '', unit: 'hours' }
  if (typeof draft !== 'object' || draft == null) return base
  return {
    vmId: 'vmId' in draft && typeof draft.vmId === 'string' ? draft.vmId : '',
    duration: 'duration' in draft && typeof draft.duration === 'string' ? draft.duration : '',
    unit: 'unit' in draft && draft.unit === 'days' ? 'days' : 'hours',
  }
}

function useGpuWizard(draft: unknown, common: CommonWizardState): KindWizard {
  const [spec, setSpec] = useState(() => initialSpec(draft))
  const vms = useQuery({
    queryKey: ['vms', 'gpu-request', { workspaceId: common.workspaceId }],
    queryFn: () => fetchGpuRequestVms(common.workspaceId ?? undefined),
  })
  const options = (vms.data ?? []).filter((vm) => !vm.accessLimited && vm.status !== 'DELETED' && vm.status !== 'DELETING')
  const selectedDetail = useQuery({ queryKey: ['vms', spec.vmId], queryFn: () => fetchVm(spec.vmId), enabled: !!spec.vmId })
  const selected = options.find((vm) => vm.id === spec.vmId)
  const hours = gpuDurationHours(spec.duration, spec.unit)
  return {
    spec,
    isPending: false,
    error: null,
    validateStep: (step) => {
      const errors: FieldErrors = {}
      if (step !== 'resource') return errors
      if (hours == null) errors['gpu.leaseHours'] = '희망 임대 기간을 1 이상의 정수로 입력해 주세요.'
      if (spec.vmId && !selected) errors['gpu.vmId'] = '선택한 워크스페이스의 VM을 다시 고르거나 선택을 해제해 주세요.'
      if (spec.vmId && !selectedDetail.data) errors['gpu.vmId'] = '선택한 VM의 권한을 확인하지 못했습니다. 다시 선택하거나 선택을 해제해 주세요.'
      if (spec.vmId && selectedDetail.data && !selectedDetail.data.settingsEditAllowed) errors['gpu.vmId'] = 'VM 편집자 이상의 권한이 필요합니다.'
      return errors
    },
    resourceFields: (errors) => (
      <>
        <GpuDurationField label="희망 GPU 임대 기간" value={spec.duration} unit={spec.unit}
          onValueChange={(duration) => setSpec((prev) => ({ ...prev, duration }))}
          onUnitChange={(unit) => setSpec((prev) => ({ ...prev, unit }))} error={errors['gpu.leaseHours']} />
        {vms.isError && <Alert variant="warning">VM 목록을 불러오지 못했습니다. VM은 신청 후에도 선택할 수 있습니다.</Alert>}
        <FormField label="대상 VM" description="나중에 선택할 수 있습니다. GPU 할당 후 연결을 직접 실행합니다." error={errors['gpu.vmId']}>
          <Select value={spec.vmId} onChange={(event) => setSpec((prev) => ({ ...prev, vmId: event.target.value }))}>
            <option value="">나중에 선택</option>
            {spec.vmId && !selected && <option value={spec.vmId}>선택한 VM을 확인할 수 없습니다</option>}
            {options.map((vm) => <option key={vm.id} value={vm.id}>{vm.name} · {vm.workspaceName}</option>)}
          </Select>
        </FormField>
      </>
    ),
    reviewRows: () => ({ resource: [['GPU 임대 기간', gpuDurationLabel(hours)], ['대상 VM', selected?.name ?? '나중에 선택']] }),
    notice: <p className="text-sm text-neutral-600">임대는 GPU를 할당받은 순간부터 계산합니다. VM 미연결·정지 중에도 임대 시간이 흐릅니다.</p>,
    payload: () => {
      if (hours == null) throw new Error('GPU 임대 기간을 입력해 주세요.')
      return { type: 'GPU', gpu: { vmId: spec.vmId || null, leaseHours: hours } }
    },
  }
}

export const gpuRequestKind: RequestKindModule = {
  type: 'GPU',
  picker: { title: 'GPU', description: 'GPU를 할당받아 VM에 연결합니다.' },
  copy: { noWorkspaceNotice: 'GPU를 소유할 워크스페이스를 먼저 만들어 주세요.', displayNameHint: null },
  fields: {
    'gpu.vmId': { label: '대상 VM', step: 'resource' },
    'gpu.leaseHours': { label: '희망 GPU 임대 기간', step: 'resource' },
  },
  useWizard: useGpuWizard,
}
