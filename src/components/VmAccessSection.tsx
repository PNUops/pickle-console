import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addVmAccessGrant,
  fetchWorkspace,
  fetchVmAccessGrants,
  removeVmAccessGrant,
  updateVmAccessGrant,
  type ResourceRole,
  type VmAccessGrant,
} from '../api/queries'
import { toApiError } from '../api/problem'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Modal,
  ResourceRoleBadge,
  Select,
  Spinner,
} from './ui'
import { RESOURCE_ROLE_HINTS, RESOURCE_ROLE_LABELS } from '../lib/labels'
import { formatDateTime } from '../lib/format'

const ASSIGNABLE: ResourceRole[] = ['OWNER', 'EDITOR', 'MEMBER', 'VIEWER']
/** 워크스페이스 전체에는 리소스를 좌우하는 등급을 줄 수 없다 (서버도 같은 제한). */
const WORKSPACE_WIDE_ASSIGNABLE: ResourceRole[] = ['MEMBER', 'VIEWER']

/**
 * 이 VM에 누가 접근할 수 있는지를 정하는 탭.
 *
 * 접근은 이 목록으로만 판정한다 — 워크스페이스에 속해 있다는 것만으로는 이 VM에 닿지
 * 않는다. 그래서 화면의 중심은 "누구에게 무엇까지"이고, 회수할 때는 회수가
 * 닿지 않는 것(이미 본 비밀번호, 이미 열린 SSH 세션)을 같이 말해 준다.
 */
export function VmAccessSection({ vmId }: { vmId: number }) {
  const queryClient = useQueryClient()
  const access = useQuery({
    queryKey: ['vms', vmId, 'access'],
    queryFn: () => fetchVmAccessGrants(vmId),
  })
  // 소유 워크스페이스는 응답이 알려 준다 — VM 상세를 못 여는 사람도 이 화면은 열기 때문에
  // 워크스페이스 id 를 상세에서 가져올 수 없다.
  const workspaceId = access.data?.resource.workspaceId
  const workspace = useQuery({
    queryKey: ['workspaces', workspaceId],
    queryFn: () => fetchWorkspace(workspaceId!),
    enabled: workspaceId != null,
  })
  const [error, setError] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<VmAccessGrant | null>(null)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['vms', vmId, 'access'] })
    void queryClient.invalidateQueries({ queryKey: ['vms', vmId] })
  }

  const changeRole = useMutation({
    mutationFn: ({ grantId, role }: { grantId: number; role: ResourceRole }) =>
      updateVmAccessGrant(vmId, grantId, role),
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err) => setError(toApiError(err, '등급을 변경하지 못했습니다.').message),
  })

  const revoke = useMutation({
    mutationFn: (grantId: number) => removeVmAccessGrant(vmId, grantId),
    onSuccess: () => {
      setError(null)
      setRevokeTarget(null)
      invalidate()
    },
    onError: (err) => {
      setRevokeTarget(null)
      setError(toApiError(err, '접근 권한을 회수하지 못했습니다.').message)
    },
  })

  const rows = access.data?.grants ?? []
  const listed = new Set(rows.map((grant) => grant.user?.userId).filter(Boolean))
  const candidates = (workspace.data?.members ?? []).filter(
    (member) => !listed.has(member.userId),
  )
  const hasWorkspaceWide = rows.some((grant) => grant.granteeType === 'WORKSPACE')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>접근 권한 ({rows.length}건)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-neutral-600">
            이 VM에는 아래 목록에 있는 사람만 접근할 수 있습니다. 같은 워크스페이스이라도
            목록에 없으면 이름과 상태만 보입니다.
          </p>
          {error && <Alert variant="danger">{error}</Alert>}
          {access.isPending ? (
            <Spinner />
          ) : access.isError ? (
            <Alert variant="warning" title="접근 권한을 불러오지 못했습니다">
              <Button size="sm" variant="secondary" onClick={() => void access.refetch()}>
                다시 시도
              </Button>
            </Alert>
          ) : (
            <ul className="divide-y divide-neutral-200">
              {rows.map((grant) => (
                <li key={grant.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {grant.granteeType === 'WORKSPACE' ? '워크스페이스 전체' : grant.user?.name}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {grant.granteeType === 'WORKSPACE'
                        ? '이 VM을 소유한 워크스페이스의 구성원 전원'
                        : grant.user?.email}
                      {' · '}
                      {formatDateTime(grant.createdAt)} 부여
                    </p>
                  </div>
                  <ResourceRoleBadge role={grant.role} />
                  <Select
                    className="w-32"
                    value={grant.role}
                    disabled={changeRole.isPending}
                    onChange={(event) =>
                      changeRole.mutate({
                        grantId: grant.id,
                        role: event.target.value as ResourceRole,
                      })
                    }
                  >
                    {(grant.granteeType === 'WORKSPACE' ? WORKSPACE_WIDE_ASSIGNABLE : ASSIGNABLE).map(
                      (role) => (
                        <option key={role} value={role}>
                          {RESOURCE_ROLE_LABELS[role]}
                        </option>
                      ),
                    )}
                  </Select>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setRevokeTarget(grant)}
                  >
                    회수
                  </Button>
                </li>
              ))}
              {rows.length === 0 && (
                <li className="py-6 text-sm text-neutral-500">
                  접근 권한이 하나도 없습니다. 이 VM에 닿을 수 있는 사람이 없습니다.
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddGrantForm
        vmId={vmId}
        candidates={candidates}
        hasWorkspaceWide={hasWorkspaceWide}
        onError={setError}
        onDone={invalidate}
      />

      {revokeTarget && (
        <RevokeModal
          grant={revokeTarget}
          pending={revoke.isPending}
          onCancel={() => setRevokeTarget(null)}
          onConfirm={() => revoke.mutate(revokeTarget.id)}
        />
      )}
    </div>
  )
}

function AddGrantForm({
  vmId,
  candidates,
  hasWorkspaceWide,
  onError,
  onDone,
}: {
  vmId: number
  candidates: { userId: number; name: string; email: string }[]
  hasWorkspaceWide: boolean
  onError: (message: string | null) => void
  onDone: () => void
}) {
  const [target, setTarget] = useState<string>('')
  const [role, setRole] = useState<ResourceRole>('MEMBER')
  const workspaceWide = target === 'WORKSPACE'
  const assignable = workspaceWide ? WORKSPACE_WIDE_ASSIGNABLE : ASSIGNABLE

  const add = useMutation({
    mutationFn: () =>
      addVmAccessGrant(vmId, {
        granteeType: workspaceWide ? 'WORKSPACE' : 'USER',
        userId: workspaceWide ? undefined : Number(target),
        role,
      }),
    onSuccess: () => {
      onError(null)
      setTarget('')
      setRole('MEMBER')
      onDone()
    },
    onError: (err) => onError(toApiError(err, '접근 권한을 부여하지 못했습니다.').message),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!target) return
    add.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>접근 권한 부여</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <FormField label="대상" className="w-full sm:w-64">
            <Select value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">선택</option>
              {!hasWorkspaceWide && <option value="WORKSPACE">워크스페이스 전체</option>}
              {candidates.map((member) => (
                <option key={member.userId} value={String(member.userId)}>
                  {member.name} ({member.email})
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="등급"
            className="w-full sm:w-44"
            description={RESOURCE_ROLE_HINTS[role]}
          >
            <Select
              value={role}
              onChange={(event) => setRole(event.target.value as ResourceRole)}
            >
              {assignable.map((value) => (
                <option key={value} value={value}>
                  {RESOURCE_ROLE_LABELS[value]}
                </option>
              ))}
            </Select>
          </FormField>
          <Button type="submit" loading={add.isPending} disabled={!target}>
            부여
          </Button>
        </form>
        <p className="mt-3 text-xs text-neutral-500">
          이 VM을 소유한 워크스페이스의 구성원만 부여 대상이 됩니다. 워크스페이스 전체에는 참여자
          또는 열람자까지만 줄 수 있습니다.
        </p>
      </CardContent>
    </Card>
  )
}

/** 회수가 되돌리지 못하는 것을 여기서 한 번은 말해 준다. */
function RevokeModal({
  grant,
  pending,
  onCancel,
  onConfirm,
}: {
  grant: VmAccessGrant
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const who = grant.granteeType === 'WORKSPACE' ? '워크스페이스 전체' : (grant.user?.name ?? '이 사용자')
  return (
    <Modal
      open
      onClose={onCancel}
      title="접근 권한 회수"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            취소
          </Button>
          <Button variant="danger" loading={pending} onClick={onConfirm}>
            회수
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-neutral-600">
        <p>{who}의 이 VM 접근 권한을 회수합니다.</p>
        <Alert variant="warning" title="회수가 되돌리지 못하는 것">
          <ul className="list-disc space-y-1 pl-4">
            <li>
              이미 열람한 초기 비밀번호는 그대로 남습니다. 완전히 막으려면 개요 탭에서
              비밀번호를 재생성해 주세요.
            </li>
            <li>
              이미 열려 있는 SSH 세션은 끊기지 않습니다. 웹 터미널은 1분 안에 닫힙니다.
            </li>
          </ul>
        </Alert>
      </div>
    </Modal>
  )
}
