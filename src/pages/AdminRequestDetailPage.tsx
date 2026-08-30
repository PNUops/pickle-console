import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { canDecideRequest, isSysTier, operatesOrg } from '../auth/permissions'
import {
  fetchAdminRequest,
  fetchApprovalContext,
  type ApprovalContext,
  type RequestDetail,
} from '../api/queries'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  WorkspaceKindBadge,
  WorkspaceRoleBadge,
  Modal,
  RequestStatusBadge,
  Spinner,
  Textarea,
  VmStatusBadge,
} from '../components/ui'
import {
  requestKindView,
  useDecisionCatalogPrefetch,
} from '../components/request-kind'
import { Field } from '../components/request-kind/Field'
import type { RequestKindView } from '../components/request-kind/types'
import { cn } from '../lib/cn'
import { fieldErrorsOf } from '../lib/field-errors'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'
import { formatDateTime, formatMemory, formatSpec } from '../lib/format'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'

interface Notice {
  variant: 'success' | 'warning' | 'danger'
  message: string
}

export function AdminRequestDetailPage() {
  const { activeOrgId } = useAdminScope()
  const params = useParams()
  const requestId = params.requestId ?? ''
  const idValid = isUuid(requestId)
  const [notice, setNotice] = useState<Notice | null>(null)
  const { user } = useAuth()
  // 승인과 반려는 기관 운영 역할 + SYS_ADMIN만 — SYS_MANAGER와 열람 역할은
  // 조회만(§3.9 †15). 역할이 닿아도 이 신청의 기관에서 행위할 수 있어야 한다:
  // 열람 역할로만 보이는 기관의 신청에 승인을 시도하면 API가 404로 거부한다.
  const roleCanDecide = !!user && canDecideRequest(user.role)

  const request = useQuery({
    queryKey: ['admin', 'requests', requestId],
    queryFn: () => fetchAdminRequest(requestId),
    // 형식부터 틀린 주소는 서버에 물어볼 것이 없다.
    enabled: idValid,
  })
  // 결정 폼이 열릴 때 종류별 카탈로그가 이미 와 있도록 진입 즉시 당겨 둔다.
  useDecisionCatalogPrefetch()

  if (!idValid) {
    return <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
  }
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
  // 신청 내용·검토 결과·결정 폼의 종류별 부분은 전부 이 모듈이 답한다.
  const kind = requestKindView(data.type)
  const canDecide =
    roleCanDecide &&
    !!user &&
    (isSysTier(user.role) ||
      (data.orgId != null && operatesOrg(user.managedOrgs, data.orgId)))

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link to={adminPaths.requests(activeOrgId)} className="text-primary-700 hover:underline">
          ← 승인 대기
        </Link>
      </nav>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-neutral-900">신청 상세</h1>
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
          {data.review && <DecisionResultCard request={data} review={data.review} />}

          <Card>
            <CardHeader>
              <CardTitle>신청 내용</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                {kind.contentFields(data)}
              </dl>
            </CardContent>
          </Card>

          {data.status === 'SUBMITTED' && canDecide && (
            <DecisionArea
              // 같은 라우트 패턴 간 이동(A→B) 시 재마운트를 강제해 이전 신청의
              // 프리필(슬러그·사양)이 남지 않게 한다.
              key={data.id}
              request={data}
              onNotice={setNotice}
            />
          )}
        </div>

        <ApprovalContextPanel requestId={requestId} />
      </div>
    </div>
  )
}

function DecisionResultCard({
  request,
  review,
}: {
  request: RequestDetail
  review: NonNullable<RequestDetail['review']>
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
          {/* 승인이 부여한 것(사양·기간·배치 등)은 종류 모듈이 그린다. */}
          {requestKindView(request.type).resultFields(request)}
        </dl>
      </CardContent>
    </Card>
  )
}

/* ─── 승인/반려 결정 폼 ─── */

/**
 * 결정 영역의 종류별 준비(카탈로그 로딩·오류)를 폼 앞단에서 거른다.
 * blocked면 결정 카드 자리 전체에 gate를 그린다 — 반려 폼만 남은 절반짜리
 * 결정 화면을 만들지 않기 위해서다. 폼 상태는 ready일 때만 마운트되는
 * DecisionSection이 들고 있어, 오류로 gate가 열리면 통째로 초기화된다.
 */
function DecisionArea({
  request,
  onNotice,
}: {
  request: RequestDetail
  onNotice: (notice: Notice | null) => void
}) {
  const kind = requestKindView(request.type)
  const decision = kind.useDecisionData()
  if (decision.status === 'blocked') return decision.gate
  return (
    <DecisionSection
      request={request}
      kind={kind}
      decisionValue={decision.value}
      onNotice={onNotice}
    />
  )
}

function DecisionSection({
  request,
  kind,
  decisionValue,
  onNotice,
}: {
  request: RequestDetail
  kind: RequestKindView
  decisionValue: unknown
  onNotice: (notice: Notice | null) => void
}) {
  const queryClient = useQueryClient()
  const form = kind.useApproveForm(request, decisionValue)
  const [mode, setMode] = useState<'approve' | 'reject'>('approve')

  // 반려 폼
  const [rejectComment, setRejectComment] = useState('')

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null)

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'requests'] })

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
    mutationFn: async () => {
      const { data, error } = await api.POST('/admin/requests/{requestId}/approve', {
        params: { path: { requestId: request.id } },
        body: form.body(),
      })
      if (!data) throw toApiError(error, '신청을 승인하지 못했습니다.')
      return data
    },
    onSuccess: async () => {
      setConfirm(null)
      onNotice({ variant: 'success', message: form.successMessage })
      await refresh()
    },
    onError: (error) => handleError(error, '신청을 승인하지 못했습니다.'),
  })

  const reject = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/admin/requests/{requestId}/reject', {
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

  const submitApprove = (event: FormEvent) => {
    event.preventDefault()
    onNotice(null)
    const errors = form.validate()
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
        {/* 모드 전환 토글 버튼 — ARIA tabs 패턴 미구현이므로 tab 롤 미사용 */}
        <div role="group" aria-label="결정 종류" className="flex gap-1">
          {(
            [
              { key: 'approve', label: '승인' },
              { key: 'reject', label: '반려' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={mode === tab.key}
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
            {form.fields(fieldErrors)}
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
              <Button loading={approve.isPending} onClick={() => approve.mutate()}>
                승인 확정
              </Button>
            </>
          }
        >
          {form.confirmBody}
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

function ApprovalContextPanel({ requestId }: { requestId: string }) {
  const context = useQuery({
    queryKey: ['admin', 'requests', requestId, 'context'],
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
          <CardTitle className="text-sm">신청자 보유 리소스</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-neutral-700">
          <VmBriefList vms={data.applicantResources.activeVms} />
          <TotalsLine totals={data.applicantResources.totals} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center gap-2">
          <CardTitle className="text-sm">신청 워크스페이스</CardTitle>
          <WorkspaceKindBadge kind={data.workspace.kind} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-neutral-700">
          <p className="font-medium text-neutral-900">{data.workspace.name}</p>
          <ul className="space-y-1">
            {data.workspace.members.map((member) => (
              <li key={member.userId} className="flex items-center justify-between gap-2">
                <span>{member.name}</span>
                <WorkspaceRoleBadge role={member.role} />
              </li>
            ))}
          </ul>
          <div className="border-t border-neutral-100 pt-2">
            <p className="mb-1 text-xs font-medium text-neutral-500">워크스페이스 보유 VM</p>
            <VmBriefList vms={data.workspace.activeVms} />
            <TotalsLine totals={data.workspace.totals} />
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
                    <span className="font-medium">지난 신청</span>
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
          <CardTitle className="text-sm">기관 리소스 여유</CardTitle>
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
