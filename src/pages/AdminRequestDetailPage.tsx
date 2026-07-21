import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { canDecideRequest } from '../auth/permissions'
import {
  fetchAdminVmRequest,
  fetchApprovalContext,
  fetchTemplates,
  type ApprovalContext,
  type ApproveVmRequest,
  type VmRequestDetail,
  type VmTemplate,
} from '../api/queries'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  FormField,
  GroupKindBadge,
  GroupRoleBadge,
  Input,
  Modal,
  RequestStatusBadge,
  Select,
  Spinner,
  Textarea,
  VmStatusBadge,
} from '../components/ui'
import { cn } from '../lib/cn'
import { fieldErrorsOf } from '../lib/field-errors'
import { SUBDOMAIN_RE } from '../lib/validation'
import { formatDateTime, formatMemory, formatSpec } from '../lib/format'

interface Notice {
  variant: 'success' | 'warning' | 'danger'
  message: string
}

export function AdminRequestDetailPage() {
  const params = useParams()
  const requestId = Number(params.requestId)
  const [notice, setNotice] = useState<Notice | null>(null)
  const { user } = useAuth()
  // 승인·반려는 org 계층 + SYS_ADMIN만 — SYS_MANAGER는 조회만(§3.9 †15).
  const canDecide = !!user && canDecideRequest(user.role)

  const request = useQuery({
    queryKey: ['admin', 'vm-requests', requestId],
    queryFn: () => fetchAdminVmRequest(requestId),
  })
  const templates = useQuery({ queryKey: ['templates'], queryFn: fetchTemplates })

  if (request.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="신청 정보 불러오는 중" />
      </div>
    )
  }
  if (request.isError) {
    return <Alert variant="danger">{request.error.message}</Alert>
  }

  const data = request.data
  const templateName = (templateId: number | null | undefined) => {
    if (templateId == null) return '—'
    return (
      templates.data?.find((t) => t.id === templateId)?.displayName ?? `템플릿 #${templateId}`
    )
  }

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link to="/admin/requests" className="text-primary-700 hover:underline">
          ← 승인 대기
        </Link>
      </nav>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-neutral-900">신청 #{data.id}</h1>
          <RequestStatusBadge status={data.status} />
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {formatDateTime(data.createdAt)} 제출 · 신청자 {data.requesterName} ·{' '}
          {data.orgName}
        </p>
      </div>

      {notice && <Alert variant={notice.variant}>{notice.message}</Alert>}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          {data.review && (
            <DecisionResultCard
              review={data.review}
              templateName={templateName(data.review.grantedTemplateId)}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle>신청 내용</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                <Field label="신청자">{data.requesterName}</Field>
                <Field label="그룹">{data.groupName}</Field>
                <Field label="기관">{data.orgName}</Field>
                <Field label="템플릿">{templateName(data.templateId)}</Field>
                <Field label="요청 사양">
                  {formatSpec(data.reqVcpu, data.reqMemoryMb, data.reqDiskGb)}
                </Field>
                <Field label="사용 기간">
                  {data.reqStartDate ?? '미지정'} ~ {data.reqEndDate ?? '미지정'}
                </Field>
                <Field label="용도">{data.purpose}</Field>
                <Field label="수업/프로젝트">{data.courseOrProject ?? '—'}</Field>
                <Field label="사양 사유">{data.specReason ?? '—'}</Field>
                <Field label="기타 참고">{data.extraNote ?? '—'}</Field>
                <Field label="네트워크">
                  {[
                    data.needSsh && 'SSH',
                    data.needHttp && 'HTTP',
                    data.needPublic && '외부 공개',
                  ]
                    .filter(Boolean)
                    .join(' · ') || '없음'}
                </Field>
                <Field label="희망 호스트명(슬러그)">{data.desiredSlug ?? '자동 생성'}</Field>
                <Field label="도메인">
                  {data.desiredSubdomain && data.rootDomain
                    ? `${data.desiredSubdomain}.${data.rootDomain}`
                    : '—'}
                </Field>
                <Field label="커스텀 도메인">{data.customDomain ?? '—'}</Field>
              </dl>
            </CardContent>
          </Card>

          {/* 템플릿 조회가 실패해도 결정 폼 자리를 비워 두지 않는다 — 실패를
              명시하고 재시도 경로를 제공한다 (무음 실종 방지). */}
          {data.status === 'SUBMITTED' &&
            canDecide &&
            (templates.isError ? (
              <Alert variant="danger" title="템플릿 목록을 불러오지 못했습니다">
                <div className="space-y-2">
                  <p>승인·반려를 결정하려면 템플릿 목록이 필요합니다.</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={templates.isFetching}
                    onClick={() => void templates.refetch()}
                  >
                    다시 시도
                  </Button>
                </div>
              </Alert>
            ) : templates.data ? (
              <DecisionSection
                // 같은 라우트 패턴 간 이동(A→B) 시 재마운트를 강제해 이전 신청의
                // 프리필(슬러그·사양)이 남지 않게 한다.
                key={data.id}
                request={data}
                templates={templates.data}
                onNotice={setNotice}
              />
            ) : (
              <div className="flex justify-center py-6">
                <Spinner label="템플릿 목록 불러오는 중" />
              </div>
            ))}
        </div>

        <ApprovalContextPanel requestId={requestId} />
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-800">{children}</dd>
    </div>
  )
}

function DecisionResultCard({
  review,
  templateName,
}: {
  review: NonNullable<VmRequestDetail['review']>
  templateName: string
}) {
  const approved = review.decision === 'APPROVE'
  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <CardTitle>검토 결과</CardTitle>
        <Badge variant={approved ? 'success' : 'danger'}>{approved ? '승인' : '반려'}</Badge>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <Field label="검토자">{review.reviewerName}</Field>
          <Field label="처리 시각">{formatDateTime(review.decidedAt)}</Field>
          {review.comment && <Field label="검토 의견">{review.comment}</Field>}
          {approved &&
            review.grantedVcpu != null &&
            review.grantedMemoryMb != null &&
            review.grantedDiskGb != null && (
              <Field label="부여 사양">
                {formatSpec(review.grantedVcpu, review.grantedMemoryMb, review.grantedDiskGb)}
              </Field>
            )}
          {approved && <Field label="부여 템플릿">{templateName}</Field>}
          {approved && (
            <Field label="부여 기간">
              {review.grantedStartDate ?? '미지정'} ~ {review.grantedEndDate ?? '미지정'}
            </Field>
          )}
          {approved && (
            <Field label="배치 노드">
              {review.nodeId == null ? '자동 배치' : `노드 #${review.nodeId}`}
            </Field>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}

/* ─── 승인/반려 결정 폼 ─── */

function DecisionSection({
  request,
  templates,
  onNotice,
}: {
  request: VmRequestDetail
  templates: VmTemplate[]
  onNotice: (notice: Notice | null) => void
}) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'approve' | 'reject'>('approve')

  // 승인 폼 — 요청 사양으로 프리필
  const [vcpu, setVcpu] = useState(String(request.reqVcpu))
  const [memoryMb, setMemoryMb] = useState(String(request.reqMemoryMb))
  const [diskGb, setDiskGb] = useState(String(request.reqDiskGb))
  const [templateId, setTemplateId] = useState(String(request.templateId))
  const [startDate, setStartDate] = useState(request.reqStartDate ?? '')
  const [endDate, setEndDate] = useState(request.reqEndDate ?? '')
  const [grantedSlug, setGrantedSlug] = useState(request.desiredSlug ?? '')
  const [grantedSubdomain, setGrantedSubdomain] = useState(request.desiredSubdomain ?? '')
  const [grantSsh, setGrantSsh] = useState(request.needSsh)
  const [grantHttp, setGrantHttp] = useState(request.needHttp)
  const [grantPublic, setGrantPublic] = useState(request.needPublic)
  const [nodeId, setNodeId] = useState('')
  const [approveComment, setApproveComment] = useState('')

  // 반려 폼
  const [rejectComment, setRejectComment] = useState('')

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null)

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'vm-requests'] })

  const handleError = (error: unknown, fallback: string) => {
    setConfirm(null)
    const apiError = toApiError(error, fallback)
    if (apiError.code === 'REQUEST_ALREADY_DECIDED') {
      onNotice({
        variant: 'warning',
        message:
          '이미 처리된 신청입니다. 다른 관리자가 먼저 처리했을 수 있어 최신 상태로 새로 고쳤습니다.',
      })
      void refresh()
      return
    }
    const mapped = fieldErrorsOf(apiError.problem)
    if (Object.keys(mapped).length > 0) {
      setFieldErrors(mapped)
      // 폼에 표시 자리가 없는 필드 오류(예: 계약이 새로 추가한 키)가 조용히
      // 사라지지 않도록 요약 notice도 함께 띄운다.
      onNotice({ variant: 'danger', message: apiError.message })
      return
    }
    onNotice({ variant: 'danger', message: apiError.message })
  }

  const approve = useMutation({
    mutationFn: async (body: ApproveVmRequest) => {
      const { data, error } = await api.POST('/admin/vm-requests/{requestId}/approve', {
        params: { path: { requestId: request.id } },
        body,
      })
      if (!data) throw toApiError(error, '신청을 승인하지 못했습니다.')
      return data
    },
    onSuccess: async () => {
      setConfirm(null)
      onNotice({
        variant: 'success',
        message: '신청을 승인했습니다. VM 생성이 시작되었습니다.',
      })
      await refresh()
    },
    onError: (error) => handleError(error, '신청을 승인하지 못했습니다.'),
  })

  const reject = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/admin/vm-requests/{requestId}/reject', {
        params: { path: { requestId: request.id } },
        body: { comment: rejectComment.trim() },
      })
      if (!data) throw toApiError(error, '신청을 반려하지 못했습니다.')
      return data
    },
    onSuccess: async () => {
      setConfirm(null)
      onNotice({
        variant: 'success',
        message: '신청을 반려했습니다. 반려 사유가 신청자에게 전달됩니다.',
      })
      await refresh()
    },
    onError: (error) => handleError(error, '신청을 반려하지 못했습니다.'),
  })

  const approveBody = (): ApproveVmRequest => ({
    grantedVcpu: Number(vcpu),
    grantedMemoryMb: Number(memoryMb),
    grantedDiskGb: Number(diskGb),
    grantedTemplateId: Number(templateId),
    grantedStartDate: startDate || null,
    grantedEndDate: endDate || null,
    grantSsh,
    grantHttp,
    grantPublic,
    grantedSlug: grantedSlug.trim() || null,
    // 서브도메인 확정은 신청서에 루트 도메인이 있을 때만 의미가 있다 — 루트 없이
    // 서브도메인만 보내면 서버가 grantedRootDomain 422를 반환한다(계약).
    grantedSubdomain:
      grantHttp && request.rootDomain ? grantedSubdomain.trim() || null : null,
    grantedRootDomain:
      grantHttp && request.rootDomain && grantedSubdomain.trim()
        ? request.rootDomain
        : null,
    nodeId: nodeId ? Number(nodeId) : null,
    comment: approveComment.trim() ? approveComment.trim() : null,
  })

  const submitApprove = (event: FormEvent) => {
    event.preventDefault()
    onNotice(null)
    const errors: Record<string, string> = {}
    const template = templates.find((t) => t.id === Number(templateId))
    if (!Number.isInteger(Number(vcpu)) || Number(vcpu) < 1)
      errors.grantedVcpu = 'vCPU는 1 이상의 정수로 입력해 주세요.'
    if (!Number.isInteger(Number(memoryMb)) || Number(memoryMb) < 256)
      errors.grantedMemoryMb = '메모리는 256 MiB 이상으로 입력해 주세요.'
    if (!Number.isInteger(Number(diskGb)) || Number(diskGb) < 1)
      errors.grantedDiskGb = '디스크는 1 GiB 이상으로 입력해 주세요.'
    else if (template && Number(diskGb) < template.minDiskGb)
      errors.grantedDiskGb = `디스크는 이 템플릿의 최소 크기(${template.minDiskGb} GiB) 이상이어야 합니다.`
    if (nodeId && (!Number.isInteger(Number(nodeId)) || Number(nodeId) < 1))
      errors.nodeId = '노드 ID는 1 이상의 정수로 입력하거나 비워 두세요.'
    if (grantedSlug.trim() && !SUBDOMAIN_RE.test(grantedSlug.trim()))
      errors.grantedSlug =
        '호스트명(슬러그)은 소문자·숫자·하이픈만 사용해 3~40자로 입력해 주세요.'
    if (grantHttp && grantedSubdomain.trim() && !SUBDOMAIN_RE.test(grantedSubdomain.trim()))
      errors.grantedSubdomain =
        '서브도메인은 소문자·숫자·하이픈만 사용해 3~40자로 입력해 주세요.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    setConfirm('approve')
  }

  const submitReject = (event: FormEvent) => {
    event.preventDefault()
    onNotice(null)
    if (!rejectComment.trim()) {
      setFieldErrors({ comment: '반려 사유를 입력해 주세요. 사유는 신청자에게 전달됩니다.' })
      return
    }
    setFieldErrors({})
    setConfirm('reject')
  }

  const switchMode = (next: 'approve' | 'reject') => {
    setMode(next)
    setFieldErrors({})
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle>검토 결정</CardTitle>
        <div role="tablist" aria-label="결정 종류" className="flex gap-1">
          {(
            [
              { key: 'approve', label: '승인' },
              { key: 'reject', label: '반려' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={mode === tab.key}
              onClick={() => switchMode(tab.key)}
              className={cn(
                'cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary-600',
                mode === tab.key
                  ? tab.key === 'approve'
                    ? 'bg-primary-600 text-white'
                    : 'bg-danger-600 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {mode === 'approve' ? (
          <form onSubmit={submitApprove} className="space-y-4" noValidate>
            <p className="text-sm text-neutral-500">
              요청 사양으로 미리 채워져 있습니다. 필요하면 조정한 뒤 승인해 주세요.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField label="vCPU" required error={fieldErrors.grantedVcpu}>
                <Input
                  type="number"
                  min={1}
                  value={vcpu}
                  onChange={(event) => setVcpu(event.target.value)}
                />
              </FormField>
              <FormField label="메모리 (MiB)" required error={fieldErrors.grantedMemoryMb}>
                <Input
                  type="number"
                  min={256}
                  step={256}
                  value={memoryMb}
                  onChange={(event) => setMemoryMb(event.target.value)}
                />
              </FormField>
              <FormField label="디스크 (GiB)" required error={fieldErrors.grantedDiskGb}>
                <Input
                  type="number"
                  min={1}
                  value={diskGb}
                  onChange={(event) => setDiskGb(event.target.value)}
                />
              </FormField>
            </div>
            <FormField label="템플릿" required error={fieldErrors.grantedTemplateId}>
              <Select
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.displayName}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="사용 시작일" error={fieldErrors.grantedStartDate}>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </FormField>
              <FormField label="사용 종료일" error={fieldErrors.grantedEndDate}>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </FormField>
            </div>
            <FormField
              label="호스트명(슬러그) 확정"
              error={fieldErrors.grantedSlug}
              description="SSH 접속명·VM 이름으로 쓰입니다. 신청자의 희망값이 채워져 있으며, 비우면 자동 생성됩니다."
            >
              <Input
                value={grantedSlug}
                onChange={(event) => setGrantedSlug(event.target.value)}
                placeholder="비우면 자동 생성"
                maxLength={40}
              />
            </FormField>
            {grantHttp && request.rootDomain && (
              <FormField
                label="서브도메인 확정"
                error={fieldErrors.grantedSubdomain}
                description={`신청자의 희망 서브도메인이 채워져 있으며, 비우면 자동 생성됩니다. (루트: ${request.rootDomain})`}
              >
                <Input
                  value={grantedSubdomain}
                  onChange={(event) => setGrantedSubdomain(event.target.value)}
                  placeholder="비우면 자동 생성"
                  maxLength={40}
                />
              </FormField>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Checkbox
                label="SSH 접속"
                checked={grantSsh}
                onChange={(event) => setGrantSsh(event.target.checked)}
              />
              <Checkbox
                label="HTTP 게시"
                checked={grantHttp}
                onChange={(event) => setGrantHttp(event.target.checked)}
              />
              <Checkbox
                label="외부 공개"
                checked={grantPublic}
                onChange={(event) => setGrantPublic(event.target.checked)}
              />
            </div>
            <FormField
              label="배치 노드 ID"
              error={fieldErrors.nodeId}
              description="비워 두면 자동 배치됩니다."
            >
              <Input
                type="number"
                min={1}
                value={nodeId}
                onChange={(event) => setNodeId(event.target.value)}
                placeholder="자동 배치"
              />
            </FormField>
            <FormField label="승인 의견" description="신청자에게 전달됩니다. (선택)">
              <Textarea
                value={approveComment}
                onChange={(event) => setApproveComment(event.target.value)}
                maxLength={2000}
                placeholder="요청 사양 그대로 승인합니다."
              />
            </FormField>
            <div className="flex justify-end">
              <Button type="submit">승인하기</Button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitReject} className="space-y-4" noValidate>
            <FormField
              label="반려 사유"
              required
              error={fieldErrors.comment}
              description="반려 사유는 신청자에게 메일로 전달됩니다."
            >
              <Textarea
                value={rejectComment}
                onChange={(event) => setRejectComment(event.target.value)}
                maxLength={2000}
                placeholder="반려 사유를 구체적으로 적어 주세요."
              />
            </FormField>
            <div className="flex justify-end">
              <Button type="submit" variant="danger">
                반려하기
              </Button>
            </div>
          </form>
        )}

        <Modal
          open={confirm === 'approve'}
          onClose={() => setConfirm(null)}
          title="신청 승인"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                돌아가기
              </Button>
              <Button
                loading={approve.isPending}
                onClick={() => approve.mutate(approveBody())}
              >
                승인 확정
              </Button>
            </>
          }
        >
          <div className="space-y-2 text-sm text-neutral-600">
            <p>아래 사양으로 승인하시겠습니까? 승인 즉시 VM 생성이 시작됩니다.</p>
            <p className="font-medium text-neutral-800">
              {formatSpec(Number(vcpu), Number(memoryMb), Number(diskGb))} ·{' '}
              {templates.find((t) => t.id === Number(templateId))?.displayName}
            </p>
            <p>{nodeId ? `노드 #${nodeId}에 배치` : '자동 배치'}</p>
          </div>
        </Modal>

        <Modal
          open={confirm === 'reject'}
          onClose={() => setConfirm(null)}
          title="신청 반려"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                돌아가기
              </Button>
              <Button
                variant="danger"
                loading={reject.isPending}
                onClick={() => reject.mutate()}
              >
                반려 확정
              </Button>
            </>
          }
        >
          <p className="text-sm text-neutral-600">
            이 신청을 반려하시겠습니까? 입력한 반려 사유가 신청자에게 전달됩니다.
          </p>
        </Modal>
      </CardContent>
    </Card>
  )
}

/* ─── 승인 판단 참고 패널 ─── */

function ApprovalContextPanel({ requestId }: { requestId: number }) {
  const context = useQuery({
    queryKey: ['admin', 'vm-requests', requestId, 'context'],
    queryFn: () => fetchApprovalContext(requestId),
  })

  if (context.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="승인 참고 정보 불러오는 중" />
      </div>
    )
  }
  if (context.isError) {
    return (
      <Alert variant="warning" title="승인 참고 정보를 불러오지 못했습니다">
        참고 정보 없이도 승인 또는 반려할 수 있습니다.
      </Alert>
    )
  }

  const data = context.data
  return (
    <aside aria-label="승인 판단 참고 정보" className="space-y-4">
      <Alert
        variant={data.orgHeadroom.warnings.length > 0 ? 'warning' : 'info'}
        title="판단 안내"
      >
        {data.guidance}
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">신청자</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-neutral-700">
          <p className="font-medium text-neutral-900">{data.applicant.name}</p>
          <p className="text-xs text-neutral-500">{data.applicant.email}</p>
          <p>가입일 {formatDateTime(data.applicant.signupAt)}</p>
          <p>
            승인 {data.applicant.approvedCount}회 · 반려 {data.applicant.rejectedCount}회
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">신청자 보유 자원</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-neutral-700">
          <VmBriefList vms={data.applicantResources.activeVms} />
          <TotalsLine totals={data.applicantResources.totals} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center gap-2">
          <CardTitle className="text-sm">신청 그룹</CardTitle>
          <GroupKindBadge kind={data.group.kind} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-neutral-700">
          <p className="font-medium text-neutral-900">{data.group.name}</p>
          <ul className="space-y-1">
            {data.group.members.map((member) => (
              <li key={member.userId} className="flex items-center justify-between gap-2">
                <span>{member.name}</span>
                <GroupRoleBadge role={member.role} />
              </li>
            ))}
          </ul>
          <div className="border-t border-neutral-100 pt-2">
            <p className="mb-1 text-xs font-medium text-neutral-500">그룹 보유 VM</p>
            <VmBriefList vms={data.group.activeVms} />
            <TotalsLine totals={data.group.totals} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">신청 이력</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-neutral-700">
          {data.history.length === 0 ? (
            <p className="text-neutral-500">이전 신청 이력이 없습니다.</p>
          ) : (
            <ul className="space-y-3">
              {data.history.map((item) => (
                <li key={item.requestId} className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">신청 #{item.requestId}</span>
                    <RequestStatusBadge status={item.status} />
                  </div>
                  <p className="text-xs text-neutral-500">
                    {formatDateTime(item.submittedAt)} 제출
                    {item.reviewerName ? ` · 검토자 ${item.reviewerName}` : ''}
                  </p>
                  {item.comment && <p className="text-xs text-neutral-600">{item.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">기관 자원 여유</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-neutral-700">
          {data.orgHeadroom.warnings.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.orgHeadroom.warnings.map((warning) => (
                <Badge key={warning} variant="danger">
                  {warning}
                </Badge>
              ))}
            </div>
          )}
          <RatioBar
            label="vCPU 할당"
            valueLabel={`${data.orgHeadroom.allocated.vcpu} vCPU / ${data.orgHeadroom.capacity.cpuThreads} 스레드`}
            ratio={data.orgHeadroom.vcpuOvercommitRatio}
          />
          <RatioBar
            label="메모리 할당"
            valueLabel={`${formatMemory(data.orgHeadroom.allocated.memoryMb)} / ${formatMemory(data.orgHeadroom.capacity.memoryMb)}`}
            ratio={data.orgHeadroom.memoryUsageRatio}
          />
          <p className="text-xs text-neutral-500">
            vCPU 오버커밋 ×{data.orgHeadroom.vcpuOvercommitRatio.toFixed(2)} · 메모리 사용률{' '}
            {Math.round(data.orgHeadroom.memoryUsageRatio * 100)}% · 디스크 할당 합계{' '}
            {data.orgHeadroom.allocated.diskGb} GiB
          </p>
        </CardContent>
      </Card>
    </aside>
  )
}

function VmBriefList({ vms }: { vms: ApprovalContext['applicantResources']['activeVms'] }) {
  if (vms.length === 0) {
    return <p className="text-neutral-500">보유 중인 VM이 없습니다.</p>
  }
  return (
    <ul className="space-y-1.5">
      {vms.map((vm) => (
        <li key={vm.id} className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate font-medium text-neutral-900">{vm.name}</span>
            <span className="block text-xs text-neutral-500">
              {formatSpec(vm.vcpu, vm.memoryMb, vm.diskGb)}
              {vm.endDate ? ` · ~${vm.endDate}` : ''}
            </span>
          </span>
          <VmStatusBadge status={vm.status} />
        </li>
      ))}
    </ul>
  )
}

function TotalsLine({ totals }: { totals: ApprovalContext['applicantResources']['totals'] }) {
  return (
    <p className="text-xs text-neutral-500">
      합계 {formatSpec(totals.vcpu, totals.memoryMb, totals.diskGb)}
    </p>
  )
}

/** 할당/용량 비율 바 — 임계(0.7 경고, 0.9 위험)에 따라 색이 바뀐다. */
function RatioBar({
  label,
  valueLabel,
  ratio,
}: {
  label: string
  valueLabel: string
  ratio: number
}) {
  const percent = Math.min(100, Math.round(ratio * 100))
  const color =
    ratio >= 0.9 ? 'bg-danger-500' : ratio >= 0.7 ? 'bg-warning-500' : 'bg-primary-500'
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-neutral-600">{label}</span>
        <span className="text-neutral-500">{valueLabel}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-full bg-neutral-100"
      >
        <div className={cn('h-full rounded-full', color)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
