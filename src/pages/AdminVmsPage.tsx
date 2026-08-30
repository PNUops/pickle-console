import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAdminWorkspaces,
  fetchAdminVms,
  type AdminVmSort,
  type VmStatus,
} from '../api/queries'
import {
  Alert,
  Badge,
  Card,
  DataTable,
  Input,
  Pagination,
  Select,
  SortableTH,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  VmStatusBadge,
} from '../components/ui'
import { cn } from '../lib/cn'
import { formatDateTime, formatSpec } from '../lib/format'
import { adminPaths } from '../lib/paths'
import { VM_STATUS_LABELS } from '../lib/status'
import { useDebouncedValue } from '../lib/use-debounced-value'
import { useAdminScope } from '../lib/use-admin-scope'
import { isUuid } from '../lib/validation'

/** 정렬 가능한 컬럼 키 (계약 sort 화이트리스트의 축). */
type SortKey = 'name' | 'endDate' | 'createdAt'

const PAGE_SIZE = 10

// 관리자 신청 큐와 같은 탭 패턴. 기본은 전체 (운영 개입 대상을 넓게 훑는 화면).
const STATUS_TABS: { label: string; status: VmStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: VM_STATUS_LABELS.RUNNING, status: 'RUNNING' },
  { label: VM_STATUS_LABELS.STOPPED, status: 'STOPPED' },
  { label: VM_STATUS_LABELS.CREATING, status: 'CREATING' },
  { label: VM_STATUS_LABELS.DELETING, status: 'DELETING' },
  { label: VM_STATUS_LABELS.NEEDS_ADMIN, status: 'NEEDS_ADMIN' },
  { label: VM_STATUS_LABELS.ERROR, status: 'ERROR' },
]

/** URL 쿼리의 식별자 파라미터. UUID가 아닌 값은 필터 미적용으로 취급한다. */
function idParam(value: string | null): string | undefined {
  return isUuid(value) ? value : undefined
}

export function AdminVmsPage() {
  const navigate = useNavigate()
  const { activeOrgId, activeOrg } = useAdminScope()
  // 교차 링크(사용자 상세의 워크스페이스 → VM 보기 등)를 위해 워크스페이스 필터는 URL
  // 쿼리로 초기화한다. 읽기 전용 초기화만이며, 이후 필터 조작은 URL에 되돌려 쓰지 않는다.
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<VmStatus | undefined>(undefined)
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(() =>
    idParam(searchParams.get('workspaceId')),
  )
  const [qInput, setQInput] = useState('')
  const [sort, setSort] = useState<AdminVmSort | undefined>(undefined)
  const [page, setPage] = useState(0)
  const previousOrgId = useRef(activeOrgId)
  useEffect(() => {
    if (previousOrgId.current === activeOrgId) return
    previousOrgId.current = activeOrgId
    setWorkspaceId(undefined)
    setPage(0)
  }, [activeOrgId])

  // 입력은 즉시 에코하되 쿼리 키는 디바운스된 값으로만 바꿔 타이핑마다
  // 요청이 나가지 않게 한다.
  const debouncedQ = useDebouncedValue(qInput).trim()
  const q = debouncedQ.length > 0 ? debouncedQ : undefined

  const vms = useQuery({
    queryKey: [
      'admin',
      'vms',
      {
        status: status ?? null,
        orgId: activeOrgId ?? null,
        workspaceId: workspaceId ?? null,
        q: q ?? null,
        sort: sort ?? null,
        page,
        size: PAGE_SIZE,
      },
    ],
    queryFn: () =>
      fetchAdminVms({ status, orgId: activeOrgId, workspaceId, q, sort, page, size: PAGE_SIZE }),
  })

  const sortDirection = (key: SortKey) =>
    sort === key ? ('asc' as const) : sort === `-${key}` ? ('desc' as const) : null
  const onSort = (key: SortKey) => (next: 'asc' | 'desc' | null) => {
    setSort(next === null ? undefined : next === 'asc' ? key : (`-${key}` as AdminVmSort))
    setPage(0)
  }

  // active scope가 있으면 해당 기관의 워크스페이스만 2차 필터로 제공한다.
  const workspaces = useQuery({
    queryKey: ['admin', 'workspaces', { orgId: activeOrgId ?? null }],
    queryFn: () =>
      fetchAdminWorkspaces(activeOrgId !== undefined ? { orgId: activeOrgId } : {}),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">VM 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {activeOrg?.name ?? '플랫폼 전체'} 가상머신을 조회합니다. 행을 선택하면 별도 상세
          페이지에서 상태와 이력을 확인하고 관리 작업을 수행할 수 있습니다.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 필터 토글 버튼 그룹 — ARIA tabs 패턴 미구현이므로 tab 롤 미사용 (진짜 탭은 ui/Tabs) */}
        <div role="group" aria-label="VM 상태 필터" className="flex flex-wrap gap-1">
          {STATUS_TABS.map((tab) => {
            const isSelected = tab.status === status
            return (
              <button
                key={tab.label}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setStatus(tab.status)
                  setPage(0)
                }}
                className={cn(
                  'cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary-600',
                  isSelected
                    ? 'bg-primary-600 text-white'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="search"
            aria-label="VM 검색"
            placeholder="이름/호스트네임 검색"
            className="w-52"
            value={qInput}
            onChange={(event) => {
              setQInput(event.target.value)
              setPage(0)
            }}
          />
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            워크스페이스
            <Select
              aria-label="워크스페이스 필터"
              className="w-56"
              value={workspaceId ?? ''}
              onChange={(event) => {
                setWorkspaceId(event.target.value || undefined)
                setPage(0)
              }}
            >
              <option value="">
                {workspaces.isError ? '전체 워크스페이스 (목록 조회 실패)' : '전체 워크스페이스'}
              </option>
              {workspaces.data?.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      {vms.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="VM 목록 불러오는 중" />
        </div>
      )}
      {vms.isError && <Alert variant="danger">{vms.error.message}</Alert>}
      {vms.isSuccess && vms.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          표시할 VM이 없습니다.
        </Card>
      )}
      {vms.isSuccess && vms.data.content.length > 0 && (
        <>
          <DataTable caption="관리자 가상머신 목록">
            <THead>
              <TR>
                <SortableTH direction={sortDirection('name')} onSort={onSort('name')}>
                  이름
                </SortableTH>
                <TH>상태</TH>
                <TH>워크스페이스</TH>
                <TH>기관</TH>
                <TH>사양</TH>
                <SortableTH direction={sortDirection('endDate')} onSort={onSort('endDate')}>
                  종료일
                </SortableTH>
                <SortableTH
                  direction={sortDirection('createdAt')}
                  onSort={onSort('createdAt')}
                >
                  생성일
                </SortableTH>
              </TR>
            </THead>
            <TBody>
              {vms.data.content.map((vm) => {
                const detailPath = adminPaths.vmDetail(vm.id, activeOrgId)
                return (
                  <TR
                    key={vm.id}
                    className="cursor-pointer"
                    onClick={() => navigate(detailPath)}
                  >
                    <TD>
                      <Link
                        to={detailPath}
                        onClick={(event) => event.stopPropagation()}
                        className="font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600"
                      >
                        {vm.displayName || vm.name}
                      </Link>
                      {vm.displayName && (
                        <span className="ml-1 text-xs text-neutral-400">{vm.name}</span>
                      )}
                      {vm.statusDetail && (
                        <span className="mt-0.5 block max-w-xs truncate text-xs text-neutral-400">
                          {vm.statusDetail}
                        </span>
                      )}
                    </TD>
                    <TD>
                      <VmStatusBadge status={vm.status} />
                      {vm.sshGatewayBlocked && (
                        <Badge variant="danger" className="ml-1">
                          차단
                        </Badge>
                      )}
                    </TD>
                    <TD>{vm.workspaceName}</TD>
                    <TD>{vm.orgName ?? '—'}</TD>
                    <TD className="whitespace-nowrap">
                      {formatSpec(vm.vcpu, vm.memoryMb, vm.diskGb)}
                    </TD>
                    <TD className="whitespace-nowrap">{vm.endDate ?? '—'}</TD>
                    <TD className="whitespace-nowrap">{formatDateTime(vm.createdAt)}</TD>
                  </TR>
                )
              })}
            </TBody>
          </DataTable>
          <Pagination
            page={vms.data.page}
            totalPages={vms.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
