import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { toApiError } from '../api/problem'
import {
  fetchTemplates,
  fetchVmFlavors,
  fetchVmRequest,
  type VmRequestDetail,
} from '../api/queries'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Modal,
  RequestStatusBadge,
  Spinner,
} from '../components/ui'
import { formatDateTime, formatSpec } from '../lib/format'

export function RequestDetailPage() {
  const params = useParams()
  const requestId = Number(params.requestId)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const request = useQuery({
    queryKey: ['vm-requests', requestId],
    queryFn: () => fetchVmRequest(requestId),
  })
  const templates = useQuery({ queryKey: ['templates'], queryFn: fetchTemplates })
  const flavors = useQuery({ queryKey: ['vm-flavors'], queryFn: fetchVmFlavors })

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
  const flavorName = (flavorId: number | null | undefined) => {
    if (flavorId == null) return '—'
    return flavors.data?.find((f) => f.id === flavorId)?.displayName ?? `프리셋 #${flavorId}`
  }

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link to="/console/requests" className="text-primary-700 hover:underline">
          ← 내 신청
        </Link>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-neutral-900">신청 #{data.id}</h1>
            <RequestStatusBadge status={data.status} />
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {formatDateTime(data.createdAt)} 제출 · 신청자 {data.requesterName}
          </p>
        </div>
        {data.status === 'SUBMITTED' && (
          <CancelRequestButton requestId={data.id} onError={setCancelError} />
        )}
      </div>

      {cancelError && <Alert variant="danger">{cancelError}</Alert>}

      {data.status === 'SUBMITTED' && (
        <Alert variant="info">관리자 검토를 기다리고 있습니다. 처리되면 알려 드립니다.</Alert>
      )}

      {data.review && (
        <ReviewCard review={data.review} templateName={templateName(data.review.grantedTemplateId)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>신청 내용</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <Field label="그룹">{data.groupName}</Field>
            <Field label="기관">{data.orgName}</Field>
            <Field label="OS">{templateName(data.templateId)}</Field>
            <Field label="사양 프리셋">{flavorName(data.flavorId)}</Field>
            <Field label="요청 사양">
              {formatSpec(data.reqVcpu, data.reqMemoryMb, data.reqDiskGb)}
            </Field>
            <Field label="용도">{data.purpose}</Field>
            <Field label="수업/프로젝트">{data.courseOrProject ?? '—'}</Field>
            <Field label="사양 사유">{data.specReason ?? '—'}</Field>
            <Field label="기타 참고">{data.extraNote ?? '—'}</Field>
            <Field label="사용 기간">
              {data.reqStartDate ?? '미지정'} ~ {data.reqEndDate ?? '미지정'}
            </Field>
            <Field label="표시명">{data.displayName ?? '—'}</Field>
            <Field label="호스트명(SSH 접속명)">{data.desiredSlug ?? '자동 생성'}</Field>
            <Field label="서브도메인 선지정">
              {data.desiredSubdomain && data.rootDomain
                ? `${data.desiredSubdomain}.${data.rootDomain}`
                : '—'}
            </Field>
          </dl>
        </CardContent>
      </Card>
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

function ReviewCard({
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
        </dl>
      </CardContent>
    </Card>
  )
}

function CancelRequestButton({
  requestId,
  onError,
}: {
  requestId: number
  onError: (message: string | null) => void
}) {
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const cancel = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/vm-requests/{requestId}/cancel', {
        params: { path: { requestId } },
      })
      if (!data) throw toApiError(error, '신청을 취소하지 못했습니다.')
      return data
    },
    onSuccess: async () => {
      setConfirmOpen(false)
      onError(null)
      await queryClient.invalidateQueries({ queryKey: ['vm-requests'] })
    },
    onError: async (err) => {
      setConfirmOpen(false)
      onError(toApiError(err, '신청을 취소하지 못했습니다.').message)
      // 이미 처리된 신청이면 최신 상태를 다시 불러온다.
      await queryClient.invalidateQueries({ queryKey: ['vm-requests'] })
    },
  })

  return (
    <>
      <Button variant="danger" onClick={() => setConfirmOpen(true)}>
        신청 취소
      </Button>
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="신청 취소"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              돌아가기
            </Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              신청 취소
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-600">
          정말 이 신청을 취소하시겠습니까? 취소한 신청은 되돌릴 수 없으며, 필요하면 새로
          신청해야 합니다.
        </p>
      </Modal>
    </>
  )
}
