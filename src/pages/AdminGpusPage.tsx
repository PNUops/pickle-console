import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { decideGpuReview, fetchAdminGpuAllocations, fetchAdminGpus, fetchGpuReviews, updateAdminGpu, type Gpu, type GpuReview } from '../api/gpu'
import { useAuth } from '../auth/auth-context'
import { canRunSysRoutine } from '../auth/permissions'
import { GpuReviewEvidence } from '../components/gpu/GpuReviewEvidence'
import { GpuAllocationTable } from '../components/gpu/GpuAllocationTable'
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, FormField, Modal, PageHeader, Pagination, Select, Spinner, Table, TBody, TD, Textarea, TH, THead, TR } from '../components/ui'
import { gpuListPollInterval } from '../lib/gpu-polling'
import { formatDateTime } from '../lib/format'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'

const GPU_STATUS_LABELS: Record<Gpu['status'], string> = { ACTIVE: '활성', MAINTENANCE: '점검 중', RETIRED: '사용 종료' }
const REVIEW_REASONS: Record<string, string> = { UNATTACHED: '장시간 미연결', LOW_UTILIZATION: '낮은 이용률', LEASE_EXPIRED: '임대 만료', CONNECTION_ERROR: '연결 오류' }

export function AdminGpusPage() {
  const { user } = useAuth()
  const scope = useAdminScope()
  const [pagination, setPagination] = useState({ orgId: scope.activeOrgId, page: 0, reviewPage: 0 })
  const page = pagination.orgId === scope.activeOrgId ? pagination.page : 0
  const reviewPage = pagination.orgId === scope.activeOrgId ? pagination.reviewPage : 0
  const setPage = (next: number) => setPagination({ orgId: scope.activeOrgId, page: next, reviewPage })
  const setReviewPage = (next: number) => setPagination({ orgId: scope.activeOrgId, page, reviewPage: next })
  const [queuedOnly, setQueuedOnly] = useState(false)
  const canManage = !!user && canRunSysRoutine(user.role)
  const [gpu, setGpu] = useState<Gpu | null>(null)
  const [review, setReview] = useState<GpuReview | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const allocations = useQuery({
    queryKey: ['admin', 'gpu-allocations', { orgId: scope.activeOrgId, page, queuedOnly }],
    queryFn: () => fetchAdminGpuAllocations({ orgId: scope.activeOrgId, page, status: queuedOnly ? 'QUEUED' : undefined }), enabled: scope.ready,
    refetchInterval: (result) => gpuListPollInterval(result.state.data?.content),
  })
  const inventory = useQuery({ queryKey: ['admin', 'gpus'], queryFn: fetchAdminGpus, enabled: canManage })
  const reviews = useQuery({ queryKey: ['admin', 'gpu-reviews', { orgId: scope.activeOrgId, page: reviewPage }], queryFn: () => fetchGpuReviews({ orgId: scope.activeOrgId, page: reviewPage }), enabled: canManage && scope.ready })
  return <div className="space-y-6">
    <PageHeader title="GPU" />
    {notice && <Alert variant="success">{notice}</Alert>}
    <Select aria-label="GPU 할당 필터" className="max-w-48" value={queuedOnly ? 'queued' : 'all'} onChange={(event) => { setQueuedOnly(event.target.value === 'queued'); setPage(0) }}><option value="all">전체 할당</option><option value="queued">대기열</option></Select>
    {allocations.isPending && <Spinner label="GPU 할당 불러오는 중" />}
    {allocations.isError && <Alert variant="danger">{allocations.error.message}</Alert>}
    {allocations.data && (allocations.data.content.length === 0 ? <EmptyState title={queuedOnly ? '대기 중인 GPU 신청이 없습니다' : 'GPU 할당이 없습니다'} /> : <>
      <GpuAllocationTable rows={allocations.data.content} admin orgId={scope.activeOrgId} />
      <Pagination page={allocations.data.page} totalPages={allocations.data.totalPages} onPageChange={setPage} />
    </>)}
    {canManage && <>
      <Card><CardHeader><CardTitle>GPU 인벤토리</CardTitle></CardHeader><CardContent>
        {inventory.isPending && <Spinner label="GPU 인벤토리 불러오는 중" />}
        {inventory.isError && <Alert variant="danger">{inventory.error.message}</Alert>}
        {inventory.data?.length === 0 && <p className="text-sm text-neutral-600">등록된 GPU가 없습니다.</p>}
        {inventory.data && inventory.data.length > 0 && <Table><THead><TR><TH>GPU</TH><TH>VRAM</TH><TH>상태</TH><TH>할당</TH><TH><span className="sr-only">작업</span></TH></TR></THead><TBody>{inventory.data.map((item) => <TR key={item.id}>
          <TD>{item.model}</TD><TD>{(item.vramMb / 1024).toLocaleString('ko-KR')} GiB</TD><TD>{GPU_STATUS_LABELS[item.status]}</TD><TD>{item.available ? '가능' : '불가'}</TD><TD>{canManage && <Button variant="secondary" size="sm" onClick={() => setGpu(item)}>상태 변경</Button>}</TD>
        </TR>)}</TBody></Table>}
      </CardContent></Card>
      {canManage && <Card><CardHeader><CardTitle>회수 검토</CardTitle></CardHeader><CardContent>
        {reviews.isPending && <Spinner label="회수 검토 불러오는 중" />}
        {reviews.isError && <Alert variant="danger">{reviews.error.message}</Alert>}
        {reviews.data?.content.length === 0 && <p className="text-sm text-neutral-600">검토할 GPU 할당이 없습니다.</p>}
        {reviews.data && reviews.data.content.length > 0 && <Table><THead><TR><TH>할당</TH><TH>검토 사유</TH><TH>생성 시각</TH><TH>결정</TH></TR></THead><TBody>{reviews.data.content.map((item) => <TR key={item.id}>
          <TD><Link to={adminPaths.gpuDetail(item.allocationId, scope.activeOrgId)} className="text-primary-700 hover:underline">{item.allocationName}</Link></TD><TD>{REVIEW_REASONS[item.reason] ?? item.reason}</TD><TD>{formatDateTime(item.createdAt)}</TD><TD><Button variant="secondary" size="sm" onClick={() => setReview(item)}>{item.decision === 'KEEP' ? '유지 결정' : item.decision === 'RECLAIM' ? '회수 결정' : '검토'}</Button></TD>
        </TR>)}</TBody></Table>}
        {reviews.data && <Pagination page={reviews.data.page} totalPages={reviews.data.totalPages} onPageChange={setReviewPage} />}
      </CardContent></Card>}
    </>}
    {gpu && <GpuStatusModal gpu={gpu} onClose={() => setGpu(null)} onDone={() => { setGpu(null); setNotice('GPU 상태를 변경했습니다.') }} />}
    {review && <GpuReviewModal review={review} onClose={() => setReview(null)} onDone={() => { setReview(null); setNotice('검토 결과를 저장했습니다.') }} />}
  </div>
}

function GpuStatusModal({ gpu, onClose, onDone }: { gpu: Gpu; onClose: () => void; onDone: () => void }) {
  const client = useQueryClient()
  const [status, setStatus] = useState(gpu.status)
  const [reason, setReason] = useState('')
  const save = useMutation({ mutationFn: () => updateAdminGpu(gpu.id, { status, reason: reason.trim() }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['admin', 'gpus'] }); onDone() } })
  return <Modal open title="GPU 상태 변경" onClose={onClose}><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (reason.trim()) save.mutate() }}>
    <p>{gpu.model}</p>
    {save.isError && <Alert variant="danger">{save.error.message}</Alert>}
    <FormField label="상태"><Select value={status} onChange={(event) => { const value = event.target.value; if (value === 'ACTIVE' || value === 'MAINTENANCE' || value === 'RETIRED') setStatus(value) }}>{Object.entries(GPU_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField>
    <FormField label="변경 사유" required><Textarea value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} /></FormField>
    <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>취소</Button><Button type="submit" disabled={!reason.trim() || status === gpu.status} loading={save.isPending}>저장</Button></div>
  </form></Modal>
}

function GpuReviewModal({ review, onClose, onDone }: { review: GpuReview; onClose: () => void; onDone: () => void }) {
  const client = useQueryClient()
  const [decision, setDecision] = useState<'KEEP' | 'RECLAIM'>('KEEP')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const save = useMutation({ mutationFn: () => decideGpuReview(review.id, decision, reason.trim()), onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ['admin', 'gpu-reviews'] }), client.invalidateQueries({ queryKey: ['admin', 'gpu-allocations'] })]); onDone() } })
  return <Modal open title="GPU 회수 검토" onClose={onClose}><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (reason.trim() && (decision === 'KEEP' || confirmed)) save.mutate() }}>
    <p className="font-medium">{review.allocationName}</p>
    <dl className="space-y-3"><div><dt className="text-sm text-neutral-500">검토 사유</dt><dd>{REVIEW_REASONS[review.reason] ?? review.reason}</dd></div><div><dt className="text-sm text-neutral-500">판단 당시 근거</dt><dd><GpuReviewEvidence evidence={review.evidence} /></dd></div></dl>
    {review.decision ? <p>{review.decision === 'KEEP' ? '유지' : '회수'} · {review.decisionReason}</p> : <>
      {save.isError && <Alert variant="danger">{save.error.message}</Alert>}
      <FormField label="검토 결과"><Select value={decision} onChange={(event) => { setDecision(event.target.value === 'RECLAIM' ? 'RECLAIM' : 'KEEP'); setConfirmed(false) }}><option value="KEEP">유지</option><option value="RECLAIM">회수</option></Select></FormField>
      <FormField label="결정 사유" required><Textarea value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} /></FormField>
      {decision === 'RECLAIM' && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />연결된 VM을 정상 종료해 GPU 회수를 시도합니다. 정상 종료에 실패하면 관리자 확인이 필요합니다.</label>}
      <Button type="submit" variant={decision === 'RECLAIM' ? 'danger' : 'primary'} disabled={!reason.trim() || (decision === 'RECLAIM' && !confirmed)} loading={save.isPending}>결정 저장</Button>
    </>}
  </form></Modal>
}
