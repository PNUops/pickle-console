import { requestReaderKey } from '../api/request-review'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAdminWorkspaces,
  fetchAdminVms,
  type AdminVmSort,
  type VmStatus,
} from '../api/queries'
import { useAuth } from '../auth/auth-context'
import { canAdminManageAccess, canOperateVm } from '../auth/permissions'
import {
  Alert,
  Badge,
  Card,
  Input,
  Pagination,
  Select,
  SortableTH,
  Spinner,
  DataTable,
  TBody,
  TD,
  TH,
  THead,
  TR,
  VmStatusBadge,
} from '../components/ui'
import { cn } from '../lib/cn'
import { formatDateTime, formatSpec } from '../lib/format'
import { useDebouncedValue } from '../lib/use-debounced-value'
import { VM_STATUS_LABELS } from '../lib/status'
import { isUuid } from '../lib/validation'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'
import { useBulkSelection } from '../lib/bulk-selection'
import { vmListReturn, type VmListReturn } from '../lib/vm-list-return'
import {
  BulkSelectionBar,
  SelectPageHeader,
  SelectRowCell,
} from '../components/bulk/BulkSelection'

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
  const { user } = useAuth()
  const { activeOrgId } = useAdminScope()
  return <AdminVmsPageContent key={`${activeOrgId ?? 'all'}:${requestReaderKey(user)}`} />
}

function AdminVmsPageContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { activeOrgId, activeOrg, activeOrgRole, tier } = useAdminScope()
  const role = user?.role
  const effectiveRole = tier === 'org' ? activeOrgRole : role
  // List scope controls filtering; exact resource operations live on the detail route.
  const canOperate = !!effectiveRole && canOperateVm(effectiveRole)
  // Selection also permits global access-list support.
  const canSelect = canOperate || (!!user && canAdminManageAccess(user.role))
  const selection = useBulkSelection('vms', `${requestReaderKey(user)}:${activeOrgId ?? ''}`)
  // Cross-links initialize the workspace filter; detail round trips restore
  // local controls from this reader's history entry without changing URL filters.
  const [searchParams] = useSearchParams()
  const reader = requestReaderKey(user)
  const [returned] = useState(() => vmListReturn(location.state?.vmList, reader, activeOrgId))
  const [status, setStatus] = useState<VmStatus | undefined>(returned?.filters.status)
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(() =>
    returned ? returned.filters.workspaceId : idParam(searchParams.get('workspaceId')),
  )
  const [qInput, setQInput] = useState(returned?.filters.qInput ?? '')
  const [sort, setSort] = useState<AdminVmSort | undefined>(returned?.filters.sort)
  const [page, setPage] = useState(returned?.filters.page ?? 0)
  const listReturn = useMemo<VmListReturn>(() => ({
    reader,
    path: adminPaths.vms(activeOrgId, idParam(searchParams.get('workspaceId'))),
    filters: { status, workspaceId, qInput, sort, page },
  }), [reader, activeOrgId, searchParams, status, workspaceId, qInput, sort, page])
  useEffect(() => {
    if (JSON.stringify(location.state?.vmList) === JSON.stringify(listReturn)) return
    void navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, {
      replace: true,
      state: { ...location.state, vmList: listReturn },
    })
  }, [listReturn, location, navigate])
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
        orgId: activeOrgId ?? null, reader: requestReaderKey(user),
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
    queryKey: ['admin', 'workspaces', { orgId: activeOrgId ?? null, reader: requestReaderKey(user) }],
    queryFn: () =>
      fetchAdminWorkspaces(activeOrgId !== undefined ? { orgId: activeOrgId } : {}),
  })

  const pageTargets = (vms.data?.content ?? []).map((vm) => ({
    id: vm.id,
    name: vm.displayName || vm.name,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">VM 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {activeOrg?.name ?? '플랫폼 전체'} 가상머신을 조회하고 삭제 예약과 취소 등
          관리 작업을 수행합니다.
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

      {canSelect && (
        <BulkSelectionBar
          selected={selection.selected}
          capped={selection.capped}
          onClear={selection.clear}
          to={adminPaths.bulkVms(activeOrgId)}
        />
      )}

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
                  {canSelect && (
                    <SelectPageHeader
                      rows={pageTargets}
                      selected={selection.selected}
                      onToggle={(on) => selection.togglePage(pageTargets, on)}
                    />
                  )}
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
                {vms.data.content.map((vm) => (
                  <TR
                    key={vm.id}
                    className="cursor-pointer"
                    onClick={() => navigate(adminPaths.vmDetail(vm.id, vm.orgId ?? activeOrgId), { state: { vmList: listReturn } })}
                  >
                    {canSelect && (
                      <SelectRowCell
                        target={{ id: vm.id, name: vm.displayName || vm.name }}
                        checked={selection.selected.some((item) => item.id === vm.id)}
                        onToggle={(on) =>
                          selection.toggle({ id: vm.id, name: vm.displayName || vm.name }, on)
                        }
                      />
                    )}
                    <TD>
                      <Link
                        to={adminPaths.vmDetail(vm.id, vm.orgId ?? activeOrgId)}
                        state={{ vmList: listReturn }}
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
                ))}
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
