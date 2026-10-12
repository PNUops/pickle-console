import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAdminRequests,
  fetchAdminWorkspace,
  fetchAdminUser,
  type RequestStatus,
} from '../api/queries'
import {
  Alert,
  Card,
  LinkButton,
  Pagination,
  RequestStatusBadge,
  Select,
  Input,
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
import { useAuth } from '../auth/auth-context'
import { approvesAnywhere } from '../auth/permissions'
import { requestListParams, requestListState, withListReturn } from '../lib/list-url'
import { useDebouncedValue } from '../lib/use-debounced-value'
import { requestRecipientStatusLabel } from '../lib/request-recipient-status'
import { useListUrl } from '../lib/use-list-url'

const PAGE_SIZE = 10

// 탭 라벨은 상태 배지와 같은 표준 라벨(status.ts)을 쓴다. 기본 탭은 승인 대기(SUBMITTED),
// '전체'는 status 미지정 (계약 v0.2.3부터 전체 상태를 반환).
const STATUS_TABS: { label: string; status: RequestStatus | undefined }[] = [
  { label: REQUEST_STATUS_LABELS.SUBMITTED, status: 'SUBMITTED' },
  { label: REQUEST_STATUS_LABELS.APPROVED, status: 'APPROVED' },
  { label: REQUEST_STATUS_LABELS.REJECTED, status: 'REJECTED' },
  { label: REQUEST_STATUS_LABELS.CANCELED, status: 'CANCELED' },
  { label: '전체', status: undefined },
]

export function AdminRequestsPage() {
  const navigate = useNavigate()
  const { activeOrgId } = useAdminScope()
  const { user } = useAuth()
  const [searchParams, change, normalize] = useListUrl()
  const state = requestListState(searchParams)
  const { status, type, page, workspaceId, relatedUserId, requestedEndFrom, requestedEndTo, reqIndefinite } = state
  const q = useDebouncedValue(state.q).trim() || undefined
  const dateConflict = !!requestedEndFrom && !!requestedEndTo && requestedEndFrom > requestedEndTo
  const relatedUser = useQuery({ queryKey: ['admin', 'users', 'detail', relatedUserId], queryFn: () => fetchAdminUser(relatedUserId!), enabled: relatedUserId != null })
  const workspace = useQuery({ queryKey: ['admin', 'workspaces', 'detail', workspaceId], queryFn: () => fetchAdminWorkspace(workspaceId!), enabled: workspaceId != null })
  const canonical = requestListParams(state, activeOrgId).toString()
  useEffect(() => {
    normalize(canonical)
  }, [canonical, normalize])
  const listPath = `/admin/requests${canonical ? `?${canonical}` : ''}`

  const requests = useQuery({
    queryKey: [
      'admin',
      'requests',
      { status: status ?? null, type: type ?? null, orgId: activeOrgId ?? null, workspaceId: workspaceId ?? null, relatedUserId: relatedUserId ?? null, q, requestedEndFrom, requestedEndTo, reqIndefinite, page, size: PAGE_SIZE },
    ],
    queryFn: () => fetchAdminRequests({ status, type, workspaceId, relatedUserId, q, requestedEndFrom, requestedEndTo, reqIndefinite, orgId: activeOrgId, page, size: PAGE_SIZE }),
    enabled: !dateConflict,
    // 승인 큐를 띄워둔 관리자가 새 신청을 놓치지 않게 알림 벨과 같은 주기로 갱신.
    refetchInterval: 30_000,
  })
  useEffect(() => {
    if (!requests.isSuccess) return
    const lastPage = Math.max(0, requests.data.totalPages - 1)
    if (page > lastPage) normalize(requestListParams({ ...state, page: lastPage }, activeOrgId).toString())
  }, [page, requests.data, requests.isSuccess, normalize, state, activeOrgId])
  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">신청 검토</h1>
          <p className="mt-1 text-sm text-neutral-500">
            제출된 리소스 신청을 검토하고 승인 또는 반려합니다.
          </p>
        </div>
        {approvesAnywhere(user) && (
          <LinkButton to={adminPaths.newRequest(activeOrgId)}>새 신청</LinkButton>
        )}
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
                  change({ status: tab.status ?? 'all' }, true)
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
            change({ type: event.target.value }, true)
          }}
        >
          <option value="">전체 리소스</option>
          <option value="VM">가상머신</option>
          <option value="LLM_API_KEY">LLM API 키</option>
          <option value="GPU">GPU</option>
          <option value="DOMAIN">도메인</option>
        </Select>
      </div>
      <div role="search" aria-label="신청 검색과 희망 기간 조건" className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 text-sm">신청 검색<Input aria-label="신청 검색" type="search" maxLength={100} placeholder="신청명 / 신청자 이름·이메일 / 워크스페이스" value={state.q} onChange={(event) => change({ q: event.target.value }, true, true)} /></label>
        <label className="text-sm">희망 종료일 이후<Input aria-label="희망 종료일 이후" type="date" value={requestedEndFrom ?? ''} onChange={(event) => change({ requestedEndFrom: event.target.value, ...(event.target.value && reqIndefinite === true ? { reqIndefinite: 'false' } : {}) }, true)} /></label>
        <label className="text-sm">희망 종료일 이전<Input aria-label="희망 종료일 이전" type="date" value={requestedEndTo ?? ''} onChange={(event) => change({ requestedEndTo: event.target.value, ...(event.target.value && reqIndefinite === true ? { reqIndefinite: 'false' } : {}) }, true)} /></label>
        <label className="text-sm">희망 기간<Select aria-label="희망 기간 종류" value={reqIndefinite == null ? 'all' : String(reqIndefinite)} onChange={(event) => change({ reqIndefinite: event.target.value === 'all' ? undefined : event.target.value, ...(event.target.value === 'true' ? { requestedEndFrom: undefined, requestedEndTo: undefined } : {}) }, true)}><option value="all">전체</option><option value="false">종료일 지정</option><option value="true">무기한 요청</option></Select></label>
      </div>
      {dateConflict && <Alert variant="danger">희망 종료일 범위의 앞뒤 날짜를 확인해 주세요.</Alert>}
      <p className="text-sm text-foreground-muted">최신 신청순. 기간 조건은 제출 당시 희망 종료일을 조회합니다.</p>
      {relatedUserId && <p className="text-sm text-neutral-600">관련 사용자: {relatedUser.data?.name ?? '사용자 정보 조회 불가'} <button className="text-primary-700 hover:underline" type="button" onClick={() => change({ relatedUserId: undefined }, true)}>사용자 조건 해제</button></p>}
      {workspaceId && <p className="text-sm text-neutral-600">
        워크스페이스: {workspace.isSuccess ? <Link className="text-primary-700 hover:underline" to={adminPaths.workspaceDetail(workspaceId, activeOrgId)}>{workspace.data.name}</Link> : '워크스페이스 정보 조회 불가'}{' '}
        <button type="button" className="text-primary-700 hover:underline" onClick={() => change({ workspaceId: undefined }, true)}>워크스페이스 필터 해제</button>
      </p>}

      {!dateConflict && requests.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="신청 목록 불러오는 중" />
        </div>
      )}
      {!dateConflict && requests.isError && <Alert variant="danger">{requests.error.message}</Alert>}
      {!dateConflict && requests.isSuccess && requests.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          표시할 신청이 없습니다.
        </Card>
      )}
      {!dateConflict && requests.isSuccess && requests.data.content.length > 0 && (
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
                    onClick={() => navigate(withListReturn(adminPaths.requestDetail(request.id, request.orgId ?? activeOrgId), listPath))}
                  >
                    <TD>
                      <Link
                        to={withListReturn(adminPaths.requestDetail(request.id, request.orgId ?? activeOrgId), listPath)}
                        className="font-medium text-primary-700 hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {request.requesterName}
                      </Link>
                      <span className="mt-0.5 block max-w-xs truncate text-xs text-neutral-400">
                        {request.purpose}
                      </span>
                    </TD>
                    <TD>
                      {request.workspaceName}
                      {activeOrgId == null && <span className="block text-xs text-foreground-muted">{request.orgName}</span>}
                    </TD>
                    {/* 종류별 요약(OS·사양 등)은 그 종류의 모듈이 그린다. */}
                    <TD className="whitespace-nowrap">
                      {requestKindView(request.type).summaryCell(request)}
                    </TD>
                    <TD className="whitespace-nowrap">{formatDateTime(request.createdAt)}</TD>
                    <TD>
                      <RequestStatusBadge status={request.status} />
                      {(request.recipients?.length ?? 0) > 0 && <span className="mt-1 block text-xs text-foreground-muted">대상 {request.recipients!.length}명 / {[...new Set(request.recipients!.map((recipient) => recipient.status))].map((recipientState) => `${requestRecipientStatusLabel(request.status, recipientState, true)} ${request.recipients!.filter((recipient) => recipient.status === recipientState).length}명`).join(', ')}</span>}
                    </TD>
                  </TR>
                ))}
              </TBody>
          </DataTable>
          <Pagination
            page={requests.data.page}
            totalPages={requests.data.totalPages}
            onPageChange={(next) => change({ page: next })}
          />
        </>
      )}
    </div>
  )
}
