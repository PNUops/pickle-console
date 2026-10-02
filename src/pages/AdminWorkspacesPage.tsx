import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchAdminWorkspace, fetchAdminWorkspaces } from '../api/queries'
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Drawer,
  Input,
  Pagination,
  Select,
  Tabs,
  TabPanel,
  WorkspaceKindBadge,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import { cn } from '../lib/cn'
import { formatDateTime } from '../lib/format'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'
import { useListUrl } from '../lib/use-list-url'
import { filterWorkspaces, WORKSPACE_SORTS, workspaceListParams, workspaceListState } from '../lib/workspace-list'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'
import {
  WORKSPACE_ROLE_LABELS,
  USER_STATUS_LABELS,
  WORKSPACE_KIND_LABELS,
  type UserStatus,
} from '../lib/labels'

/**
 * 관리자 워크스페이스 관리 — 조회 우선(구성원 감사·오너 부재 워크스페이스 파악).
 * 워크스페이스 변경(생성·역할 조정·삭제)은 다음 단계.
 */
export function AdminWorkspacesPage() {
  const { activeOrgId, activeOrg } = useAdminScope()
  const [searchParams, change, normalize] = useListUrl()
  const state = workspaceListState(searchParams)
  const { selectedId } = state
  const searchRef = useRef<HTMLInputElement>(null)

  const workspaces = useQuery({
    queryKey: ['admin', 'workspaces', { orgId: activeOrgId ?? null }],
    queryFn: () => fetchAdminWorkspaces(activeOrgId !== undefined ? { orgId: activeOrgId } : {}),
  })
  const filtered = filterWorkspaces(workspaces.data ?? [], state)
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10))
  const page = workspaces.data ? Math.min(state.page, totalPages - 1) : state.page
  const canonical = workspaceListParams({ ...state, page }, activeOrgId).toString()
  useEffect(() => {
    normalize(canonical)
  }, [canonical, normalize])
  const close = () => {
    change({ workspaceId: undefined, tab: undefined }, false, true)
    requestAnimationFrame(() => {
      if (!searchRef.current?.isConnected) return
      const trigger = selectedId && isUuid(selectedId)
        ? document.querySelector<HTMLButtonElement>(`[data-workspace-id="${selectedId}"]`)
        : null
      ;(trigger ?? searchRef.current)?.focus()
    })
  }
  const selectedInScope = workspaces.data?.some((workspace) => workspace.id === selectedId) ?? false

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">워크스페이스 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {activeOrg?.name ?? '플랫폼 전체'} 워크스페이스와 구성원을 조회합니다.
          구성원 변경은 워크스페이스 소유자가 수행합니다.
        </p>
      </div>

      <div role="search" aria-label="워크스페이스 조회 조건" className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 text-sm">
          이름 검색
          <Input ref={searchRef} aria-label="워크스페이스 이름 검색" type="search" maxLength={200} value={state.q}
            onChange={(event) => change({ q: event.target.value, workspaceId: undefined, tab: undefined }, true, true)} />
        </label>
        <label className="text-sm">
          유형
          <Select aria-label="워크스페이스 유형 필터" value={state.kind ?? ''}
            onChange={(event) => change({ kind: event.target.value, workspaceId: undefined, tab: undefined }, true)}>
            <option value="">전체 유형</option>
            {Object.entries(WORKSPACE_KIND_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
          </Select>
        </label>
        <label className="text-sm">
          정렬
          <Select aria-label="워크스페이스 정렬" value={state.sort}
            onChange={(event) => change({ sort: event.target.value, workspaceId: undefined, tab: undefined }, true)}>
            {WORKSPACE_SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </label>
        <Button variant="secondary" onClick={() => change({ q: undefined, kind: undefined, sort: undefined, workspaceId: undefined, tab: undefined }, true)}>
          조건 초기화
        </Button>
      </div>

      {workspaces.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="워크스페이스 목록 불러오는 중" />
        </div>
      )}
      {workspaces.isError && <Alert variant="danger">{workspaces.error.message}</Alert>}
      {workspaces.isSuccess && filtered.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          {workspaces.data.length === 0 ? '표시할 워크스페이스가 없습니다.' : '조회 조건에 맞는 워크스페이스가 없습니다.'}
        </Card>
      )}
      {workspaces.isSuccess && filtered.length > 0 && (
        <>
          <p className="text-sm text-foreground-muted" role="status">{filtered.length}개 워크스페이스</p>
          <DataTable caption="관리자 워크스페이스 목록">
            <THead>
              <TR>
                <TH>이름</TH>
                <TH>유형</TH>
                <TH>구성원</TH>
                <TH>생성일</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.slice(page * 10, (page + 1) * 10).map((workspace) => (
                <TR
                  key={workspace.id}
                  className={cn(
                    'cursor-pointer',
                    workspace.id === selectedId && 'bg-primary-50 hover:bg-primary-50',
                  )}
                  onClick={() => change({ workspaceId: workspace.id, tab: undefined })}
                >
                  <TD>
                    <button
                      type="button"
                      data-workspace-id={workspace.id}
                      onClick={(event) => {
                        event.stopPropagation()
                        change({ workspaceId: workspace.id, tab: undefined })
                      }}
                      className="cursor-pointer font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600"
                    >
                      {workspace.name}
                    </button>
                  </TD>
                  <TD>
                    <WorkspaceKindBadge kind={workspace.kind} />
                  </TD>
                  <TD>{workspace.memberCount}</TD>
                  <TD className="whitespace-nowrap">{formatDateTime(workspace.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
          <Pagination page={page} totalPages={totalPages} onPageChange={(next) => change({ page: next })} />
        </>
      )}

      <Drawer
        open={selectedId !== null}
        onClose={close}
        title="워크스페이스 상세"
      >
        {selectedId !== null && (
          !isUuid(selectedId) ? <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
            : workspaces.isPending ? <Spinner label="관리 범위의 대상 확인 중" />
              : workspaces.isError ? <Alert variant="danger">{workspaces.error.message}</Alert>
                : !selectedInScope ? <Alert variant="danger">현재 관리 범위의 목록에 이 워크스페이스가 없습니다.</Alert>
                  : <WorkspaceDetailBody key={selectedId} workspaceId={selectedId} tab={state.tab}
                    onTab={(tab) => change({ tab: tab === 'overview' ? undefined : tab }, false, true)} />
        )}
      </Drawer>
    </div>
  )
}

/* ─── 상세 드로어 본문 ─── */

const USER_STATUS_VARIANT: Record<UserStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  PENDING_VERIFICATION: 'warning',
  DISABLED: 'danger',
  WITHDRAWN: 'neutral',
}

function WorkspaceDetailBody({ workspaceId, tab, onTab }: { workspaceId: string; tab: string; onTab: (tab: string) => void }) {
  const { activeOrgId } = useAdminScope()
  const detail = useQuery({
    queryKey: ['admin', 'workspaces', 'detail', workspaceId],
    queryFn: () => fetchAdminWorkspace(workspaceId),
  })

  if (detail.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="워크스페이스 상세 불러오는 중" />
      </div>
    )
  }
  if (detail.isError) {
    return <Alert variant="danger">{detail.error.message}</Alert>
  }

  const workspace = detail.data
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-900">{workspace.name}</h3>
        <div className="flex gap-2"><Badge>조회 전용</Badge><WorkspaceKindBadge kind={workspace.kind} /></div>
      </div>
      <Tabs aria-label="워크스페이스 상세 탭" idPrefix="workspace-detail-" value={tab} onChange={onTab}
        tabs={[{ id: 'overview', label: '개요' }, { id: 'members', label: '구성원' }]} />
      <TabPanel id="overview" idPrefix="workspace-detail-" active={tab === 'overview'}>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Field label="생성일" value={formatDateTime(workspace.createdAt)} />
        <Field label="활성 구성원" value={String(workspace.memberCount)} />
        <div>
          <dt className="text-neutral-500">워크스페이스 전체 VM</dt>
          <dd className="font-medium text-neutral-900">
            {workspace.vmCount}대{' '}
            <Link
              to={adminPaths.vms(activeOrgId, workspace.id)}
              className="text-sm font-normal text-primary-700 hover:underline"
            >
              {activeOrgId == null ? 'VM 보기' : '현재 관리 기관의 VM 보기'}
            </Link>
          </dd>
        </div>
        {workspace.description && <Field label="설명" value={workspace.description} />}
      </dl>
      </TabPanel>

      <TabPanel id="members" idPrefix="workspace-detail-" active={tab === 'members'} className="space-y-2">
        {workspace.members.length === 0 ? (
          <p className="text-sm text-neutral-500">구성원이 없습니다.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>이름</TH>
                <TH>역할</TH>
                <TH>계정 상태</TH>
                <TH>참여일</TH>
              </TR>
            </THead>
            <TBody>
              {workspace.members.map((member) => (
                <TR key={member.userId}>
                  <TD>
                    {member.name}
                    <span className="block text-xs text-neutral-500">{member.email}</span>
                  </TD>
                  <TD>{WORKSPACE_ROLE_LABELS[member.workspaceRole]}</TD>
                  <TD>
                    <Badge variant={USER_STATUS_VARIANT[member.userStatus]}>
                      {USER_STATUS_LABELS[member.userStatus]}
                    </Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-neutral-500">
                    {formatDateTime(member.joinedAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </TabPanel>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  )
}
