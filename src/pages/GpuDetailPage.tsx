import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { attachGpu, detachGpu, extendGpu, fetchGpuAllocation, fetchGpuAttachmentOptions, releaseGpu, type GpuAllocation } from '../api/gpu'
import { fetchVm, invalidateResourceLists } from '../api/queries'
import { GpuUtilization } from '../components/gpu/GpuUtilization'
import { GpuDurationField } from '../components/gpu/GpuDurationField'
import { GpuStatusBadge, GpuConnectionBadge } from '../components/gpu/GpuStatus'
import { Field } from '../components/request-kind/Field'
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, FormField, Modal, PageHeader, Select, Spinner } from '../components/ui'
import { gpuDurationHours, gpuDurationLabel, type GpuDurationUnit } from '../lib/gpu-duration'
import { gpuDetailPollInterval } from '../lib/gpu-polling'
import { formatDateTime } from '../lib/format'
import { consolePaths } from '../lib/paths'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'

type Action = 'attach' | 'detach' | 'release' | 'extend'
const ACTION_TITLES: Record<Action, string> = { attach: 'VM 연결', detach: 'VM 연결 해제', release: 'GPU 반납', extend: 'GPU 임대 연장' }

export function GpuInfoCard({ allocation }: { allocation: GpuAllocation }) {
  return <Card><CardHeader><CardTitle>GPU 정보</CardTitle></CardHeader><CardContent>
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="워크스페이스">{allocation.workspaceName}</Field>
      <Field label="GPU">{allocation.gpu?.model ?? '미할당'}</Field>
      <Field label="할당 상태"><GpuStatusBadge status={allocation.status} /></Field>
      <Field label="VM 연결"><GpuConnectionBadge status={allocation.connectionStatus} /></Field>
      <Field label="연결된 VM">{allocation.vmName ?? '—'}</Field>
      <Field label="승인 임대 기간">{gpuDurationLabel(allocation.grantedLeaseHours)}</Field>
      <Field label="할당 시각">{allocation.allocatedAt ? formatDateTime(allocation.allocatedAt) : '—'}</Field>
      <Field label="임대 만료">{allocation.leaseEndsAt ? formatDateTime(allocation.leaseEndsAt) : '—'}</Field>
      {allocation.queuePosition != null && <Field label="대기 순서">{allocation.queuePosition}번째</Field>}
      <Field label="GPU 이용률"><GpuUtilization value={allocation.utilizationPercent} observedAt={allocation.sampleObservedAt} /></Field>
    </dl>
  </CardContent></Card>
}

export function GpuDetailPage() {
  const allocationId = useParams().allocationId ?? ''
  const query = useQuery({
    queryKey: ['gpu-allocations', allocationId], queryFn: () => fetchGpuAllocation(allocationId), enabled: isUuid(allocationId),
    refetchInterval: (result) => gpuDetailPollInterval(result.state.data),
  })
  if (!isUuid(allocationId)) return <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
  if (query.isPending) return <Spinner label="GPU 할당 불러오는 중" />
  if (query.isError) return <Alert variant="danger">{query.error.message}</Alert>
  return <GpuDetail key={query.data.id} allocation={query.data} />
}

/** Keep dialogs and their completion callbacks inside this allocation's mounted state. */
function GpuDetail({ allocation }: { allocation: GpuAllocation }) {
  const allocationId = allocation.id
  const connectedVmId = allocation.vmId
  const connectedVm = useQuery({ queryKey: ['vms', connectedVmId], queryFn: () => fetchVm(connectedVmId!), enabled: !!connectedVmId && allocation.connectionStatus === 'ATTACHED' && (allocation.myRole === 'OWNER' || allocation.myRole === 'EDITOR') })
  const [action, setAction] = useState<Action | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const canEdit = allocation.myRole === 'OWNER' || allocation.myRole === 'EDITOR'
  const stable = allocation.connectionStatus === 'NONE' || allocation.connectionStatus === 'ATTACHED'
  const active = allocation.status === 'ALLOCATED'
  const canRelease = allocation.myRole === 'OWNER' || allocation.accessManageAllowed
  return <div className="space-y-6">
    <Link to={consolePaths.gpus(null)} className="text-sm text-primary-700 hover:underline">← 내 GPU</Link>
    <PageHeader title={allocation.name} actions={allocation.accessManageAllowed ? <Link className="text-primary-700 hover:underline" to={consolePaths.gpuAccess(allocationId)}>접근 권한 관리</Link> : undefined} />
    {notice && <Alert variant="success">{notice}</Alert>}
    {allocation.error && <Alert variant="danger">{allocation.error}</Alert>}
    <GpuInfoCard allocation={allocation} />
    {canEdit && active && stable && (allocation.connectionStatus === 'NONE' || connectedVm.data?.settingsEditAllowed) && <Card><CardHeader><CardTitle>VM 연결</CardTitle></CardHeader><CardContent>
      {allocation.connectionStatus === 'NONE' && <Button onClick={() => setAction('attach')}>VM 연결</Button>}
      {allocation.connectionStatus === 'ATTACHED' && connectedVm.data?.settingsEditAllowed && <Button variant="secondary" onClick={() => setAction('detach')}>연결 해제</Button>}
    </CardContent></Card>}
    {canEdit && active && stable && <Card><CardHeader><CardTitle>임대 연장</CardTitle></CardHeader><CardContent>
      <Button variant="secondary" onClick={() => setAction('extend')}>임대 연장</Button>
    </CardContent></Card>}
    {canRelease && stable && (active || allocation.status === 'QUEUED') && <Card><CardHeader><CardTitle>{allocation.status === 'QUEUED' ? 'GPU 대기 취소' : 'GPU 반납'}</CardTitle></CardHeader><CardContent>
      <Button variant="danger" onClick={() => setAction('release')}>{allocation.status === 'QUEUED' ? '대기 취소' : 'GPU 반납'}</Button>
    </CardContent></Card>}
    {action && <GpuActionModal key={`${allocationId}-${action}`} action={action} allocation={allocation} onClose={() => setAction(null)} onDone={() => { setAction(null); setNotice(`${ACTION_TITLES[action]} 요청을 접수했습니다.`) }} />}
  </div>
}

function GpuActionModal({ action, allocation, onClose, onDone }: { action: Action; allocation: GpuAllocation; onClose: () => void; onDone: () => void }) {
  const client = useQueryClient()
  const [vmId, setVmId] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [duration, setDuration] = useState('')
  const [unit, setUnit] = useState<GpuDurationUnit>('hours')
  const hours = gpuDurationHours(duration, unit)
  const options = useQuery({ queryKey: ['gpu-allocations', allocation.id, 'attachment-options'], queryFn: () => fetchGpuAttachmentOptions(allocation.id), enabled: action === 'attach', staleTime: 0 })
  const selected = options.data?.find((vm) => vm.vmId === vmId)
  const mutation = useMutation({
    mutationFn: async () => {
      if (action === 'attach') return attachGpu(allocation.id, vmId)
      if (action === 'detach') return detachGpu(allocation.id)
      if (action === 'release') return releaseGpu(allocation.id)
      if (hours == null) throw new Error('연장할 기간을 입력해 주세요.')
      return extendGpu(allocation.id, hours)
    },
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ['gpu-allocations', allocation.id] }), invalidateResourceLists(client)])
      onDone()
    },
  })
  const ready = action === 'extend' ? hours != null : confirmed && (action !== 'attach' || selected?.ready === true)
  return <Modal open onClose={mutation.isPending ? () => {} : onClose} title={ACTION_TITLES[action]}>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (ready) mutation.mutate() }}>
      {mutation.isError && <Alert variant="danger">{mutation.error.message}</Alert>}
      {action === 'attach' && <>
        {options.isPending && <Spinner label="연결할 VM 확인 중" />}
        {options.isError && <Alert variant="danger">{options.error.message}</Alert>}
        <FormField label="연결할 VM" required>
          <Select value={vmId} onChange={(event) => { setVmId(event.target.value); setConfirmed(false) }}>
            <option value="">VM 선택</option>
            {options.data?.map((vm) => <option key={vm.vmId} value={vm.vmId}>{vm.vmName}</option>)}
          </Select>
        </FormField>
        {options.data?.length === 0 && <p className="text-sm text-neutral-600">같은 워크스페이스에서 연결할 VM을 찾을 수 없습니다.</p>}
        {selected && !selected.ready && <Alert variant="warning">{selected.reason ?? '이 VM은 GPU 연결 준비가 필요합니다.'}</Alert>}
      </>}
      {action === 'extend' ? <>
        <GpuDurationField label="추가 임대 기간" value={duration} unit={unit} onValueChange={setDuration} onUnitChange={setUnit} />
        <p className="text-sm text-neutral-600">대기자가 없을 때 승인된 전체 사용기간 안에서 연장할 수 있습니다.</p>
      </> : <>
        {action === 'detach' && <p className="text-sm text-neutral-600">연결을 해제해도 남은 GPU 임대는 유지됩니다.</p>}
        {action === 'release' && <p className="text-sm text-neutral-600">반납이 완료되면 GPU 임대가 종료되고 다음 신청자에게 할당될 수 있습니다.</p>}
        {(action === 'attach' || action === 'detach' || (action === 'release' && allocation.connectionStatus === 'ATTACHED')) && <p className="text-sm text-neutral-700">실행 중인 VM은 재시작되며 작업이 중단될 수 있습니다. 정지된 VM은 작업 후에도 정지 상태를 유지합니다.</p>}
        <Checkbox label={action === 'release' && allocation.status === 'QUEUED' ? 'GPU 대기를 취소합니다.' : `위 내용을 확인하고 ${ACTION_TITLES[action]}에 동의합니다.`} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      </>}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={mutation.isPending} onClick={onClose}>취소</Button><Button type="submit" variant={action === 'release' ? 'danger' : 'primary'} disabled={!ready} loading={mutation.isPending}>{ACTION_TITLES[action]}</Button></div>
    </form>
  </Modal>
}
