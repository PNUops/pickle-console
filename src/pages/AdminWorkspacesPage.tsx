import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { useQueries, useQuery } from '@tanstack/react-query'
import { fetchAdminLlmKeys, fetchAdminDomains, fetchAdminVms, fetchAdminWorkspace, fetchAdminWorkspaces, fetchAdminWorkspaceInvitations } from '../api/queries'
import { fetchAdminGpuAllocations } from '../api/gpu'
import { useAuth } from '../auth/auth-context'
import { supportsInvitationRead } from '../api/admin-user-support'
import { gpuPreviewEnabled } from '../lib/gpu-preview'
import { withListReturn } from '../lib/list-url'
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
    change({ workspaceId: undefined, tab: undefined, inspect: undefined }, false, true)
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
    <div className="space-y-6 [overflow-wrap:anywhere]">
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
            onChange={(event) => change({ q: event.target.value, workspaceId: undefined, tab: undefined, inspect: undefined }, true, true)} />
        </label>
        <label className="text-sm">
          유형
          <Select aria-label="워크스페이스 유형 필터" value={state.kind ?? ''}
            onChange={(event) => change({ kind: event.target.value, workspaceId: undefined, tab: undefined, inspect: undefined }, true)}>
            <option value="">전체 유형</option>
            {Object.entries(WORKSPACE_KIND_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
          </Select>
        </label>
        <label className="text-sm">
          정렬
          <Select aria-label="워크스페이스 정렬" value={state.sort}
            onChange={(event) => change({ sort: event.target.value, workspaceId: undefined, tab: undefined, inspect: undefined }, true)}>
            {WORKSPACE_SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </label>
        <Button variant="secondary" onClick={() => change({ q: undefined, kind: undefined, sort: undefined, workspaceId: undefined, tab: undefined, inspect: undefined }, true)}>
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
                  onClick={() => change({ workspaceId: workspace.id, tab: undefined, inspect: undefined })}
                >
                  <TD>
                    <button
                      type="button"
                      data-workspace-id={workspace.id}
                      onClick={(event) => {
                        event.stopPropagation()
                        change({ workspaceId: workspace.id, tab: undefined, inspect: undefined })
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
            : state.inspect ? <WorkspaceDetailBody key={selectedId} workspaceId={selectedId} tab={state.tab}
                onTab={(tab) => change({ tab: tab === 'overview' ? undefined : tab }, false, true)} />
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
  const { user } = useAuth()
  const location = useLocation()
  const canReadInvitations = supportsInvitationRead(user?.role)
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
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 text-lg font-semibold text-neutral-900">{workspace.name}</h3>
        <div className="flex gap-2"><Badge>조회 전용</Badge><WorkspaceKindBadge kind={workspace.kind} /></div>
      </div>
      <p className="text-sm text-neutral-500">구성원은 전체 워크스페이스 기준이며 자원과 신청은 현재 관리 기관에서 조회합니다.</p>
      <Tabs aria-label="워크스페이스 상세 탭" idPrefix="workspace-detail-" value={tab} onChange={onTab}
        tabs={[{ id: 'overview', label: '개요' }, { id: 'members', label: '구성원' }, { id: 'resources', label: '자원과 신청' }, ...(canReadInvitations ? [{ id: 'invitations', label: '대기 초대' }] : [])]} />
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
                    <Link to={withListReturn(adminPaths.userSupport(member.userId, activeOrgId), `${location.pathname}${location.search}`)} className="text-primary-700 hover:underline">{member.name}</Link>
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
      <TabPanel id="resources" idPrefix="workspace-detail-" active={tab === 'resources'}>
        <WorkspaceResources workspaceId={workspaceId} />
      </TabPanel>
      <TabPanel id="invitations" idPrefix="workspace-detail-" active={tab === 'invitations'}>
        {canReadInvitations ? <WorkspaceInvitations workspaceId={workspaceId} /> : <Alert>이 역할에서는 대기 초대 정보를 조회할 수 없습니다.</Alert>}
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


function WorkspaceResources({ workspaceId }: { workspaceId: string }) {
  const { activeOrgId } = useAdminScope()
  const kinds = [
    { type: 'VM', label: '가상머신', to: adminPaths.vms(activeOrgId, workspaceId), read: async () => (await fetchAdminVms({ workspaceId, orgId: activeOrgId, size: 1 })).totalElements },
    { type: 'LLM_API_KEY', label: 'LLM API 키', to: adminPaths.llmKeys(activeOrgId, workspaceId), read: async () => (await fetchAdminLlmKeys({ workspaceId, orgId: activeOrgId, size: 1 })).totalElements },
    { type: 'DOMAIN', label: '도메인', to: adminPaths.domains(activeOrgId, workspaceId), read: async () => (await fetchAdminDomains({ workspaceId, orgId: activeOrgId, size: 1 })).totalElements },
    { type: 'GPU', label: 'GPU', to: gpuPreviewEnabled() ? adminPaths.gpus(activeOrgId, workspaceId) : undefined, read: async () => (await fetchAdminGpuAllocations({ workspaceId, orgId: activeOrgId, size: 1 })).totalElements },
  ]
  const counts = useQueries({ queries: kinds.map((kind) => ({ queryKey: ['admin', 'workspace-resources', workspaceId, activeOrgId ?? null, kind.type], queryFn: kind.read })) })
  return <div className="space-y-3 text-sm">
    <p className="text-neutral-500">자원과 신청은 현재 관리 기관의 범위에서 조회합니다.</p>
    <p className="text-neutral-500">개수는 연결된 목록의 조회 조건을 따릅니다. 종료 이력을 포함한 개수와 다를 수 있습니다.</p>
    <ul className="space-y-2">{kinds.map((kind, index) => <li key={kind.type} className="flex flex-wrap items-center gap-2">
      {kind.to ? <Link to={kind.to} className="text-primary-700 hover:underline">{kind.label} 목록</Link> : <span>{kind.label}</span>}
      {counts[index].isPending ? <Spinner label={`${kind.label} 수 확인 중`} /> : counts[index].isError ? <span className="text-danger-700">개수를 확인하지 못했습니다.</span> : <span>{counts[index].data}개</span>}
    </li>)}</ul>
    <Link to={adminPaths.requests(activeOrgId, workspaceId)} className="inline-flex text-primary-700 hover:underline">이 워크스페이스의 신청 보기</Link>
  </div>
}

function WorkspaceInvitations({ workspaceId }: { workspaceId: string }) {
  const invitations = useQuery({ queryKey: ['admin', 'workspace-invitations', workspaceId], queryFn: () => fetchAdminWorkspaceInvitations(workspaceId) })
  return <div className="space-y-3 text-sm [overflow-wrap:anywhere]">
    {invitations.isPending ? <Spinner label="대기 초대 불러오는 중" /> : invitations.isError ? <Alert variant="danger">{invitations.error.message}</Alert>
      : invitations.data.length === 0 ? <p className="text-neutral-500">대기 중인 초대가 없습니다.</p>
        : <ul className="space-y-3">{invitations.data.map((invitation) => <li key={invitation.id} className="rounded border border-neutral-200 p-3">
          <p>{invitation.email ?? invitation.studentNo ?? '초대 대상 정보 없음'}</p>
          <p className="mt-1 text-neutral-500">{WORKSPACE_ROLE_LABELS[invitation.role]} / {formatDateTime(invitation.invitedAt)} 초대</p>
          <p className="text-neutral-500">초대한 사람: {invitation.invitedBy.name}</p>
        </li>)}</ul>}
  </div>
}
