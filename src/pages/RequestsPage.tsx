import { useState } from 'react'
import { Link } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchRequests, type RequestStatus } from '../api/queries'
import {
  Alert,
  Card,
  Pagination,
  RequestStatusBadge,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import { cn } from '../lib/cn'
import { formatDateTime, formatSpec } from '../lib/format'
import { REQUEST_STATUS_LABELS } from '../lib/status'

// 탭 라벨은 상태 배지와 같은 표준 라벨(status.ts)을 쓴다.
const STATUS_TABS: { label: string; status: RequestStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: REQUEST_STATUS_LABELS.SUBMITTED, status: 'SUBMITTED' },
  { label: REQUEST_STATUS_LABELS.APPROVED, status: 'APPROVED' },
  { label: REQUEST_STATUS_LABELS.REJECTED, status: 'REJECTED' },
  { label: REQUEST_STATUS_LABELS.CANCELED, status: 'CANCELED' },
]

export function RequestsPage() {
  const [status, setStatus] = useState<RequestStatus | undefined>(undefined)
  const [page, setPage] = useState(0)

  const requests = useQuery({
    queryKey: ['requests', { status: status ?? null, page }],
    queryFn: () => fetchRequests({ status, page }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">내 신청</h1>
        <p className="mt-1 text-sm text-neutral-500">
          내가 볼 수 있는 VM 신청 목록입니다. 모든 신청은 관리자 검토 후 처리됩니다.
        </p>
      </div>

      {/* 필터 토글 버튼 워크스페이스 — ARIA tabs 패턴 미구현이므로 tab 롤 미사용 (진짜 탭은 ui/Tabs) */}
      <div role="workspace" aria-label="신청 상태 필터" className="flex flex-wrap gap-1">
        {STATUS_TABS.map((tab) => {
          const selected = tab.status === status
          return (
            <button
              key={tab.label}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setStatus(tab.status)
                setPage(0)
              }}
              className={cn(
                'cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary-600',
                selected
                  ? 'bg-primary-600 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {requests.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="신청 목록 불러오는 중" />
        </div>
      )}
      {requests.isError && <Alert variant="danger">{requests.error.message}</Alert>}
      {requests.isSuccess && requests.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          표시할 신청이 없습니다.
        </Card>
      )}
      {requests.isSuccess && requests.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>용도</TH>
                  <TH>워크스페이스</TH>
                  <TH>요청 사양</TH>
                  <TH>상태</TH>
                  <TH>신청일</TH>
                </TR>
              </THead>
              <TBody>
                {requests.data.content.map((request) => (
                  <TR key={request.id}>
                    <TD className="max-w-sm">
                      <Link
                        to={`/console/requests/${request.id}`}
                        className="block truncate font-medium text-primary-700 hover:underline"
                      >
                        {request.purpose}
                      </Link>
                    </TD>
                    <TD>{request.workspaceName}</TD>
                    <TD className="whitespace-nowrap">
                      {formatSpec(request.vm?.reqVcpu, request.vm?.reqMemoryMb, request.vm?.reqDiskGb)}
                    </TD>
                    <TD>
                      <RequestStatusBadge status={request.status} />
                    </TD>
                    <TD className="whitespace-nowrap">{formatDateTime(request.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={requests.data.page}
            totalPages={requests.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
