import { invalidateAdminDeadlines } from '../lib/admin-deadline-cache'
import { AdminResourceAccessLink } from '../components/resource/AdminResourceAccessLink'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { extendAdminGpu, fetchAdminGpuAllocation, prioritizeGpu, reclaimGpu, reconcileGpu, type GpuAllocation } from '../api/gpu'
import { useAuth } from '../auth/auth-context'
import { SYS_OPERATORS, SYS_READERS } from '../auth/institution-authority'
import { GPU_READ_COMMANDS, useInstitutionResourcePermissions } from '../lib/institution-resource-work'
import { InstitutionAdminGpuInfo } from '../components/gpu/InstitutionAdminGpuProjection'
import { GpuDurationField } from '../components/gpu/GpuDurationField'
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, FormField, Input, Modal, PageHeader, Spinner, Textarea } from '../components/ui'
import { gpuDurationHours, type GpuDurationUnit } from '../lib/gpu-duration'
import { gpuDetailPollInterval } from '../lib/gpu-polling'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'
import { WorkspaceSourceReturnLink } from '../components/workspace/WorkspaceSourceReturnLink'

type AdminAction = 'priority' | 'extend' | 'reclaim' | 'reconcile'
const TITLES: Record<AdminAction, string> = { priority: '대기 우선순위 변경', extend: 'GPU 임대 연장', reclaim: 'GPU 회수', reconcile: 'GPU 상태 다시 확인' }

export function AdminGpuDetailPage() {
  const { user } = useAuth()
  const allocationId = useParams().allocationId ?? ''
  const scope = useAdminScope()
  const permissions = useInstitutionResourcePermissions()
  const canRead = permissions.canAnyWork(GPU_READ_COMMANDS, SYS_READERS)
  const allocation = useQuery({ queryKey: ['admin', 'gpu-allocations', allocationId, { orgId: scope.activeOrgId, reader: `${user?.id ?? 'none'}:${permissions.fingerprint}` }], queryFn: () => fetchAdminGpuAllocation(allocationId), enabled: isUuid(allocationId) && scope.ready && canRead,
    refetchInterval: (result) => gpuDetailPollInterval(result.state.data),
  })
  if (!isUuid(allocationId)) return <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
  if (!canRead) return <Alert variant="danger">GPU 할당을 조회할 권한이 없습니다.</Alert>
  if (allocation.isPending) return <Spinner label="GPU 할당 불러오는 중" />
  if (allocation.isError) return <Alert variant="danger">{allocation.error.message}</Alert>
  const data = allocation.data
  if (scope.activeOrgId && data.orgId !== scope.activeOrgId) return <Alert variant="danger">선택한 기관의 GPU 할당이 아닙니다.</Alert>
  return <AdminGpuDetail key={`${data.id}:${scope.activeOrgId ?? ''}:${user?.id ?? 'none'}:${permissions.fingerprint}`} data={data} />
}

/** A route or scope change discards all local mutation feedback for the previous target. */
function AdminGpuDetail({ data }: { data: GpuAllocation }) {
  const allocationId = data.id
  const scope = useAdminScope()
  const permissions = useInstitutionResourcePermissions()
  const [action, setAction] = useState<AdminAction | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const sysManage = SYS_OPERATORS.includes(permissions.role)
  const canExtend = permissions.forRow(data, 'gpu.period', SYS_OPERATORS)
  const canRecall = permissions.forRow(data, 'gpu.recall', SYS_OPERATORS)
  const canAccess = permissions.forRow(data, 'gpu.acl.support.read') || permissions.forRow(data, 'gpu.acl.support.manage', ['SYS_ADMIN'])
  const stable = data.connectionStatus == null || data.connectionStatus === 'NONE' || data.connectionStatus === 'ATTACHED'
  const actionAllowed = action === 'extend' ? canExtend : action === 'reclaim' ? canRecall : sysManage
  useEffect(() => { if (action && !actionAllowed) setAction(null) }, [action, actionAllowed])
  return <div className="space-y-6">
    <WorkspaceSourceReturnLink workspaceId={data.workspaceId} admin />
    <Link to={adminPaths.gpus(scope.activeOrgId)} className="text-sm text-primary-700 hover:underline">← GPU</Link>
    <PageHeader title={data.name} description={data.orgName} actions={canAccess ? <AdminResourceAccessLink type="GPU" resourceId={data.id} orgId={data.orgId} workspaceId={data.workspaceId} /> : undefined} />
    {notice && <Alert variant="success">{notice}</Alert>}
    {data.metadataVisible && data.error && <Alert variant="danger">{data.error}</Alert>}
    <InstitutionAdminGpuInfo allocation={data} />
    {sysManage && data.connectionStatus === 'ERROR' && <Card><CardHeader><CardTitle>GPU 상태 확인</CardTitle></CardHeader><CardContent><Button variant="secondary" onClick={() => setAction('reconcile')}>상태 다시 확인</Button></CardContent></Card>}
    {sysManage && data.status === 'QUEUED' && <Card><CardHeader><CardTitle>대기 순서</CardTitle></CardHeader><CardContent><Button variant="secondary" onClick={() => setAction('priority')}>우선순위 변경</Button></CardContent></Card>}
    {canExtend && data.status === 'ALLOCATED' && stable && <Card><CardHeader><CardTitle>임대 연장</CardTitle></CardHeader><CardContent><Button variant="secondary" onClick={() => setAction('extend')}>임대 연장</Button></CardContent></Card>}
    {canRecall && stable && (data.status === 'ALLOCATED' || data.status === 'QUEUED') && <Card><CardHeader><CardTitle>GPU 회수</CardTitle></CardHeader><CardContent><Button variant="danger" onClick={() => setAction('reclaim')}>회수</Button></CardContent></Card>}
    {action && actionAllowed && <AdminGpuActionModal key={`${allocationId}-${action}`} action={action} allocation={data} onClose={() => setAction(null)} onDone={() => { setAction(null); setNotice(`${TITLES[action]} 요청을 접수했습니다.`) }} />}
  </div>
}

function AdminGpuActionModal({ action, allocation, onClose, onDone }: { action: AdminAction; allocation: GpuAllocation; onClose: () => void; onDone: () => void }) {
  const client = useQueryClient()
  const [reason, setReason] = useState('')
  const [priority, setPriority] = useState(String(allocation.priority ?? 0))
  const [duration, setDuration] = useState('')
  const [unit, setUnit] = useState<GpuDurationUnit>('hours')
  const [confirmed, setConfirmed] = useState(false)
  const hours = gpuDurationHours(duration, unit)
  const validPriority = /^-?\d+$/.test(priority) && Number.isSafeInteger(Number(priority)) && Number(priority) >= -2_147_483_648 && Number(priority) <= 2_147_483_647
  const ready = !!reason.trim() && (action === 'priority' ? validPriority : action === 'extend' ? hours != null : action === 'reconcile' || confirmed)
  const save = useMutation({ mutationFn: () => {
    if (action === 'priority') return prioritizeGpu(allocation.id, Number(priority), reason.trim())
    if (action === 'reconcile') return reconcileGpu(allocation.id, reason.trim())
    if (action === 'reclaim') return reclaimGpu(allocation.id, reason.trim())
    if (hours == null) throw new Error('연장할 기간을 입력해 주세요.')
    return extendAdminGpu(allocation.id, hours, reason.trim())
  }, onSuccess: async () => { await Promise.all([invalidateAdminDeadlines(client), client.invalidateQueries({ queryKey: ['admin', 'gpu-allocations'] }), client.invalidateQueries({ queryKey: ['gpu-allocations'] }), client.invalidateQueries({ queryKey: ['resources'] })]); onDone() } })
  return <Modal open title={TITLES[action]} onClose={save.isPending ? () => {} : onClose}><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (ready) save.mutate() }}>
    {save.isError && <Alert variant="danger">{save.error.message}</Alert>}
    {action === 'priority' && <FormField label="우선순위" required description="큰 값부터 할당하며 같은 값에서는 승인 순서를 따릅니다."><Input type="number" step={1} value={priority} onChange={(event) => setPriority(event.target.value)} /></FormField>}
    {action === 'extend' && <GpuDurationField label="추가 임대 기간" value={duration} unit={unit} onValueChange={setDuration} onUnitChange={setUnit} />}
    <FormField label="처리 사유" required><Textarea value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} /></FormField>
    {action === 'reclaim' && <Checkbox label="연결된 VM을 정상 종료해 GPU를 회수합니다. 정상 종료에 실패하면 회수를 보류합니다." checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />}
    <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={save.isPending} onClick={onClose}>취소</Button><Button type="submit" variant={action === 'reclaim' ? 'danger' : 'primary'} disabled={!ready} loading={save.isPending}>{TITLES[action]}</Button></div>
  </form></Modal>
}
