import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchAdminRequests,
  type ResourceType,
  type RequestStatus,
} from '../api/queries'
import {
  Alert,
  Card,
  Pagination,
  RequestStatusBadge,
  Select,
  Spinner,
  DataTable,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import {
  KIND_SUMMARY_COLUMN_TITLE,
  requestKindView,
} from '../components/request-kind'
import { cn } from '../lib/cn'
import { formatDateTime } from '../lib/format'
import { REQUEST_STATUS_LABELS } from '../lib/status'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'

const PAGE_SIZE = 10

// 탭 라벨은 상태 배지와 같은 표준 라벨(status.ts)을 쓴다. 기본 탭은 승인 대기(SUBMITTED),
// '전체'는 status 미지정 (계약 v0.2.3부터 전체 상태를 반환).
const STATUS_TABS: { label: string; status: RequestStatus | undefined }[] = [
  { label: REQUEST_STATUS_LABELS.SUBMITTED, status: 'SUBMITTED' },
  { label: REQUEST_STATUS_LABELS.APPROVED, status: 'APPROVED' },
  { label: REQUEST_STATUS_LABELS.REJECTED, status: 'REJECTED' },
  { label: '전체', status: undefined },
]

export function AdminRequestsPage() {
  const navigate = useNavigate()
  const { activeOrgId } = useAdminScope()
  const [status, setStatus] = useState<RequestStatus | undefined>('SUBMITTED')
  const [type, setType] = useState<ResourceType | undefined>(undefined)
  const [page, setPage] = useState(0)

  const requests = useQuery({
    queryKey: [
      'admin',
      'requests',
      { status: status ?? null, type: type ?? null, orgId: activeOrgId ?? null, page, size: PAGE_SIZE },
    ],
    queryFn: () => fetchAdminRequests({ status, type, orgId: activeOrgId, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    // 승인 큐를 띄워둔 관리자가 새 신청을 놓치지 않게 알림 벨과 같은 주기로 갱신.
    refetchInterval: 30_000,
  })
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">승인 대기</h1>
        <p className="mt-1 text-sm text-neutral-500">
          제출된 리소스 신청을 종류별 참고 정보와 함께 검토하고 승인 또는 반려합니다.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 필터 토글 버튼 그룹 — ARIA tabs 패턴 미구현이므로 tab 롤 미사용 (진짜 탭은 ui/Tabs) */}
        <div role="group" aria-label="신청 상태 필터" className="flex flex-wrap gap-1">
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
        <Select
          aria-label="리소스 종류 필터"
          className="w-full sm:w-44"
          value={type ?? ''}
          onChange={(event) => {
            setType((event.target.value || undefined) as ResourceType | undefined)
            setPage(0)
          }}
        >
          <option value="">전체 리소스</option>
          <option value="VM">가상머신</option>
          <option value="LLM_API_KEY">LLM API 키</option>
        </Select>
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
          <DataTable caption="관리자 신청 목록">
              <THead>
                <TR>
                  <TH>신청자</TH>
                  <TH>워크스페이스</TH>
                  <TH>{KIND_SUMMARY_COLUMN_TITLE}</TH>
                  <TH>신청일</TH>
                  <TH>상태</TH>
                </TR>
              </THead>
              <TBody>
                {requests.data.content.map((request) => (
                  <TR
                    key={request.id}
                    className="cursor-pointer hover:bg-neutral-50"
                    onClick={() => navigate(adminPaths.requestDetail(request.id, activeOrgId))}
                  >
                    <TD>
                      <Link
                        to={adminPaths.requestDetail(request.id, activeOrgId)}
                        className="font-medium text-primary-700 hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {request.requesterName}
                      </Link>
                      <span className="mt-0.5 block max-w-xs truncate text-xs text-neutral-400">
                        {request.purpose}
                      </span>
                    </TD>
                    <TD>{request.workspaceName}</TD>
                    {/* 종류별 요약(OS·사양 등)은 그 종류의 모듈이 그린다. */}
                    <TD className="whitespace-nowrap">
                      {requestKindView(request.type).summaryCell(request)}
                    </TD>
                    <TD className="whitespace-nowrap">{formatDateTime(request.createdAt)}</TD>
                    <TD>
                      <RequestStatusBadge status={request.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
          </DataTable>
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
