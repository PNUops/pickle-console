import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { toApiError } from '../api/problem'
import { fetchRequest, type RequestDetail } from '../api/queries'
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
import { requestKindView } from '../components/request-kind'
import { Field } from '../components/request-kind/Field'
import { formatDateTime } from '../lib/format'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'

export function RequestDetailPage() {
  const params = useParams()
  const requestId = params.requestId ?? ''
  const idValid = isUuid(requestId)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const request = useQuery({
    queryKey: ['requests', requestId],
    queryFn: () => fetchRequest(requestId),
    // 형식부터 틀린 주소는 서버에 물어볼 것이 없다.
    enabled: idValid,
  })
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
            <h1 className="text-2xl font-bold text-neutral-900">신청 상세</h1>
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
        <Alert variant="info">처리되면 알려 드립니다.</Alert>
      )}

      {data.review && <ReviewCard request={data} review={data.review} />}

      <Card>
        <CardHeader>
          <CardTitle>신청 내용</CardTitle>
        </CardHeader>
        <CardContent>
          {/* 무엇을 신청했는지는 종류가 답한다 — 관리자 신청 상세와 같은 항목을
              같은 함수로 그린다. 신청자와 관리자가 다른 표를 보면 한쪽만 낡는다. */}
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {requestKindView(data.type).contentFields(data)}
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}

function ReviewCard({
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
          {/* 승인이 부여한 것(사양·한도·기간 등)은 종류 모듈이 그린다 — 반려면 null. */}
          {requestKindView(request.type).resultFields(request)}
        </dl>
      </CardContent>
    </Card>
  )
}

function CancelRequestButton({
  requestId,
  onError,
}: {
  requestId: string
  onError: (message: string | null) => void
}) {
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const cancel = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/requests/{requestId}/cancel', {
        params: { path: { requestId } },
      })
      if (!data) throw toApiError(error, '신청을 취소하지 못했습니다.')
      return data
    },
    onSuccess: async () => {
      setConfirmOpen(false)
      onError(null)
      await queryClient.invalidateQueries({ queryKey: ['requests'] })
    },
    onError: async (err) => {
      setConfirmOpen(false)
      onError(toApiError(err, '신청을 취소하지 못했습니다.').message)
      // 이미 처리된 신청이면 최신 상태를 다시 불러온다.
      await queryClient.invalidateQueries({ queryKey: ['requests'] })
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
          취소한 신청은 되돌릴 수 없으며, 필요하면 새로 신청해야 합니다.
        </p>
      </Modal>
    </>
  )
}
