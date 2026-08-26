import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchAdminWorkspace, fetchAdminWorkspaces, fetchOrgs } from '../api/queries'
import {
  Alert,
  Badge,
  Card,
  Drawer,
  WorkspaceKindBadge,
  Select,
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
import {
  WORKSPACE_ROLE_LABELS,
  USER_STATUS_LABELS,
  type UserStatus,
} from '../lib/labels'

/**
 * 관리자 워크스페이스 관리 — 조회 우선(구성원 감사·오너 부재 워크스페이스 파악).
 * 워크스페이스 변경(생성·역할 조정·삭제)은 다음 단계.
 */
export function AdminWorkspacesPage() {
  const [orgId, setOrgId] = useState<string | undefined>(undefined)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const workspaces = useQuery({
    queryKey: ['admin', 'workspaces', { orgId: orgId ?? null }],
    queryFn: () => fetchAdminWorkspaces(orgId !== undefined ? { orgId } : {}),
  })
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">워크스페이스 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          전 기관의 워크스페이스와 구성원을 조회합니다. 구성원 변경은
          워크스페이스 소유자가 수행합니다.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-600">
        기관
        <Select
          aria-label="기관 필터"
          className="w-56"
          value={orgId ?? ''}
          onChange={(event) => {
            setOrgId(event.target.value || undefined)
          }}
        >
          <option value="">전체 기관</option>
          {orgs.data?.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </Select>
      </label>

      {workspaces.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="워크스페이스 목록 불러오는 중" />
        </div>
      )}
      {workspaces.isError && <Alert variant="danger">{workspaces.error.message}</Alert>}
      {workspaces.isSuccess && workspaces.data.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">표시할 워크스페이스가 없습니다.</Card>
      )}
      {workspaces.isSuccess && workspaces.data.length > 0 && (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>이름</TH>
                <TH>종류</TH>
                <TH>구성원</TH>
                <TH>생성일</TH>
              </TR>
            </THead>
            <TBody>
              {workspaces.data.map((workspace) => (
                <TR
                  key={workspace.id}
                  className={cn(
                    'cursor-pointer',
                    workspace.id === selectedId && 'bg-primary-50 hover:bg-primary-50',
                  )}
                  onClick={() => setSelectedId(workspace.id)}
                >
                  <TD>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedId(workspace.id)
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
          </Table>
        </Card>
      )}

      <Drawer
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        title="워크스페이스 상세"
      >
        {selectedId !== null && <WorkspaceDetailBody key={selectedId} workspaceId={selectedId} />}
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

function WorkspaceDetailBody({ workspaceId }: { workspaceId: string }) {
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
        <WorkspaceKindBadge kind={workspace.kind} />
      </div>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Field label="생성일" value={formatDateTime(workspace.createdAt)} />
        <Field label="활성 구성원" value={String(workspace.memberCount)} />
        <div>
          <dt className="text-neutral-500">VM</dt>
          <dd className="font-medium text-neutral-900">
            {workspace.vmCount}대{' '}
            <Link
              to={`/admin/vms?workspaceId=${workspace.id}`}
              className="text-sm font-normal text-primary-700 hover:underline"
            >
              VM 보기
            </Link>
          </dd>
        </div>
        {workspace.description && <Field label="설명" value={workspace.description} />}
      </dl>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">구성원</h3>
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
      </section>
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
