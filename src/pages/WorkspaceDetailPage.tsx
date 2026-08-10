import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { toApiError } from '../api/problem'
import { fetchWorkspace, type WorkspaceDetail, type WorkspaceMember, type WorkspaceMemberRole } from '../api/queries'
import { useAuth } from '../auth/auth-context'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmNameModal,
  FormField,
  WorkspaceKindBadge,
  WorkspaceRoleBadge,
  Input,
  Modal,
  Select,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  useToast,
} from '../components/ui'
import { WORKSPACE_ROLE_LABELS } from '../lib/labels'
import { formatDateTime } from '../lib/format'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'

const ASSIGNABLE_ROLES: WorkspaceMemberRole[] = ['OWNER', 'MEMBER']

export function WorkspaceDetailPage() {
  const params = useParams()
  const workspaceId = params.workspaceId ?? ''
  const idValid = isUuid(workspaceId)
  const workspace = useQuery({
    queryKey: ['workspaces', workspaceId],
    queryFn: () => fetchWorkspace(workspaceId),
    // 형식부터 틀린 주소는 서버에 물어볼 것이 없다.
    enabled: idValid,
  })

  if (!idValid) {
    return <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
  }
  if (workspace.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="워크스페이스 정보 불러오는 중" />
      </div>
    )
  }
  if (workspace.isError) {
    return <Alert variant="danger">{workspace.error.message}</Alert>
  }

  const data = workspace.data
  // 계약 v0.3.x부터 서버가 내 역할을 직접 내려준다 (구성원 목록 스캔 불필요).
  const myRole = data.myRole

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link to="/console/workspaces" className="text-primary-700 hover:underline">
          ← 내 워크스페이스
        </Link>
      </nav>
      <WorkspaceInfoSection workspace={data} myRole={myRole} />
      <MembersSection workspace={data} myRole={myRole} />
      {myRole === 'OWNER' && data.kind !== 'PERSONAL' && <DangerZoneSection workspace={data} />}
    </div>
  )
}

/* ─── danger zone: workspace delete (contract: OWNER only, name-confirmed) ─── */

function DangerZoneSection({ workspace }: { workspace: WorkspaceDetail }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = useMutation({
    mutationFn: async () => {
      const { error: err, response } = await api.DELETE('/workspaces/{workspaceId}', {
        params: { path: { workspaceId: workspace.id } },
      })
      if (!response.ok) throw toApiError(err, '워크스페이스를 삭제하지 못했습니다.')
    },
    onSuccess: async () => {
      setOpen(false)
      toast.success('워크스페이스를 삭제했습니다.')
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      navigate('/console/workspaces')
    },
    onError: (err) => {
      setOpen(false)
      // 활성 VM 보유·PERSONAL 등 서버의 problem detail을 그대로 노출한다.
      setError(toApiError(err, '워크스페이스를 삭제하지 못했습니다.').message)
    },
  })

  return (
    <Card className="border-danger-200">
      <CardHeader>
        <CardTitle className="text-danger-700">위험 구역</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-600">
            워크스페이스를 삭제하면 모든 목록에서 사라집니다. 삭제되지 않은 VM이 있으면 먼저
            VM을 삭제(파기 완료)해야 합니다. 구성원 전원에게 알림이 발송됩니다.
          </p>
          <Button
            variant="danger"
            onClick={() => {
              setError(null)
              setOpen(true)
            }}
          >
            워크스페이스 삭제
          </Button>
        </div>
      </CardContent>
      <ConfirmNameModal
        open={open}
        onClose={() => setOpen(false)}
        title="워크스페이스 삭제"
        expectedName={workspace.name}
        confirmLabel="워크스페이스 삭제"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      >
        <Alert variant="danger">
          이 작업은 되돌릴 수 없습니다. 같은 이름·슬러그로 새 워크스페이스를 다시 만들 수는 있지만,
          기존 워크스페이스의 구성원 구성은 복구되지 않습니다.
        </Alert>
      </ConfirmNameModal>
    </Card>
  )
}

/* ─── workspace info + edit (contract: OWNER only) ─── */

function WorkspaceInfoSection({
  workspace,
  myRole,
}: {
  workspace: WorkspaceDetail
  myRole: WorkspaceMemberRole | null
}) {
  const [editOpen, setEditOpen] = useState(false)

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-neutral-900">{workspace.name}</h1>
            <WorkspaceKindBadge kind={workspace.kind} />
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            생성일 {formatDateTime(workspace.createdAt)}
          </p>
          {workspace.description && (
            <p className="mt-2 text-sm text-neutral-600">{workspace.description}</p>
          )}
        </div>
        {myRole === 'OWNER' && (
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            정보 수정
          </Button>
        )}
      </div>
      {/* 열 때마다 마운트해 지난 편집의 임시 입력이 남지 않게 한다. */}
      {editOpen && <EditWorkspaceModal workspace={workspace} onClose={() => setEditOpen(false)} />}
    </div>
  )
}

function EditWorkspaceModal({
  workspace,
  onClose,
}: {
  workspace: WorkspaceDetail
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(workspace.name)
  const [description, setDescription] = useState(workspace.description ?? '')
  const [error, setError] = useState<string | null>(null)

  const update = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await api.PATCH('/workspaces/{workspaceId}', {
        params: { path: { workspaceId: workspace.id } },
        body: { name, description: description || null },
      })
      if (!data) throw toApiError(err, '워크스페이스 정보를 수정하지 못했습니다.')
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      onClose()
    },
    onError: (err) => setError(toApiError(err, '워크스페이스 정보를 수정하지 못했습니다.').message),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('워크스페이스 이름을 입력해 주세요.')
      return
    }
    update.mutate()
  }

  return (
    <Modal open onClose={onClose} title="워크스페이스 정보 수정">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert variant="danger">{error}</Alert>}
        <FormField label="워크스페이스 이름" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
        </FormField>
        <FormField label="설명">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            취소
          </Button>
          <Button type="submit" loading={update.isPending}>
            저장
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* ─── members ─── */

function MembersSection({
  workspace,
  myRole,
}: {
  workspace: WorkspaceDetail
  myRole: WorkspaceMemberRole | null
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const toast = useToast()
  const [actionError, setActionError] = useState<string | null>(null)
  const [transferTarget, setTransferTarget] = useState<WorkspaceMember | null>(null)
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMember | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)

  const isPersonal = workspace.kind === 'PERSONAL'
  const canManage = myRole === 'OWNER' && !isPersonal

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['workspaces'] })

  const changeRole = useMutation({
    mutationFn: async ({ member, role }: { member: WorkspaceMember; role: WorkspaceMemberRole }) => {
      const { data, error } = await api.PATCH('/workspaces/{workspaceId}/members/{userId}', {
        params: { path: { workspaceId: workspace.id, userId: member.userId } },
        body: { role },
      })
      if (!data) throw toApiError(error, '역할을 변경하지 못했습니다.')
      return data
    },
    onSuccess: async (_data, { member, role }) => {
      setTransferTarget(null)
      toast.success(
        role === 'OWNER'
          ? `${member.name} 님에게 소유권을 이전했습니다.`
          : `${member.name} 님의 역할을 변경했습니다.`,
      )
      await refresh()
    },
    onError: (err) => {
      setTransferTarget(null)
      setActionError(toApiError(err, '역할을 변경하지 못했습니다.').message)
    },
  })

  const removeMember = useMutation({
    mutationFn: async (member: WorkspaceMember) => {
      const { error, response } = await api.DELETE('/workspaces/{workspaceId}/members/{userId}', {
        params: { path: { workspaceId: workspace.id, userId: member.userId } },
      })
      if (!response.ok) throw toApiError(error, '구성원을 제거하지 못했습니다.')
      return member
    },
    onSuccess: async (member) => {
      setRemoveTarget(null)
      setLeaveOpen(false)
      if (member.userId === user?.id) {
        toast.success('워크스페이스에서 나갔습니다.')
        navigate('/console/workspaces')
        await queryClient.invalidateQueries({ queryKey: ['workspaces'] })
        return
      }
      toast.success(`${member.name} 님을 워크스페이스에서 제거했습니다.`)
      await refresh()
    },
    onError: (err) => {
      setRemoveTarget(null)
      setLeaveOpen(false)
      setActionError(toApiError(err, '구성원을 제거하지 못했습니다.').message)
    },
  })

  const onRoleSelect = (member: WorkspaceMember, role: WorkspaceMemberRole) => {
    setActionError(null)
    if (role === member.role) return
    // 소유자는 여러 명일 수 있다. 지정은 확인을 한 번 받고(워크스페이스 전체를 다룰 수
    // 있게 되는 일이라), 해제는 바로 반영한다 — 마지막 한 명이면 서버가 막는다.
    if (role === 'OWNER') {
      setTransferTarget(member)
      return
    }
    changeRole.mutate({ member, role })
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>구성원 ({workspace.members.length}명)</CardTitle>
        {!isPersonal && myRole && (
          <Button variant="secondary" size="sm" onClick={() => setLeaveOpen(true)}>
            워크스페이스 나가기
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isPersonal && (
          <Alert variant="info">
            개인 워크스페이스는 회원가입 시 자동으로 생성되는 워크스페이스로, 구성원을 추가하거나 역할을
            변경할 수 없습니다.
          </Alert>
        )}
        {actionError && <Alert variant="danger">{actionError}</Alert>}
        <Table>
          <THead>
            <TR>
              <TH>이름</TH>
              <TH>이메일</TH>
              <TH>역할</TH>
              {canManage && <TH>관리</TH>}
            </TR>
          </THead>
          <TBody>
            {workspace.members.map((member) => {
              const isSelf = member.userId === user?.id
              return (
                <TR key={member.userId}>
                  <TD className="font-medium text-neutral-900">
                    {member.name}
                    {isSelf && <span className="ml-1 text-xs text-neutral-400">(나)</span>}
                  </TD>
                  <TD>{member.email}</TD>
                  <TD>
                    {canManage && !isSelf ? (
                      <div className="w-36">
                        <Select
                          aria-label={`${member.name} 역할 변경`}
                          value={member.role}
                          onChange={(event) =>
                            onRoleSelect(member, event.target.value as WorkspaceMemberRole)
                          }
                        >
                          {ASSIGNABLE_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {WORKSPACE_ROLE_LABELS[role]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ) : (
                      <WorkspaceRoleBadge role={member.role} />
                    )}
                  </TD>
                  {canManage && (
                    <TD>
                      {!isSelf && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger-600 hover:bg-danger-50 hover:text-danger-700"
                          onClick={() => {
                            setActionError(null)
                            setRemoveTarget(member)
                          }}
                        >
                          제거
                        </Button>
                      )}
                    </TD>
                  )}
                </TR>
              )
            })}
          </TBody>
        </Table>
        {canManage && <AddMemberForm workspaceId={workspace.id} onAdded={refresh} />}
      </CardContent>

      <OwnershipTransferModal
        target={transferTarget}
        pending={changeRole.isPending}
        onCancel={() => setTransferTarget(null)}
        onConfirm={(member) => changeRole.mutate({ member, role: 'OWNER' })}
      />

      <Modal
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title="구성원 제거"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveTarget(null)}>
              취소
            </Button>
            <Button
              variant="danger"
              loading={removeMember.isPending}
              onClick={() => removeTarget && removeMember.mutate(removeTarget)}
            >
              제거
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-600">
          {removeTarget?.name}({removeTarget?.email}) 님을 이 워크스페이스에서 제거하시겠습니까?
        </p>
      </Modal>

      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="워크스페이스 나가기"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLeaveOpen(false)}>
              취소
            </Button>
            <Button
              variant="danger"
              loading={removeMember.isPending}
              onClick={() => {
                const self = workspace.members.find((m) => m.userId === user?.id)
                if (self) removeMember.mutate(self)
              }}
            >
              나가기
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-600">
          정말 이 워크스페이스에서 나가시겠습니까? 나간 후에는 다시 초대받아야 합니다.
        </p>
      </Modal>
    </Card>
  )
}

/* ─── add member (contract: OWNER only) ─── */

function AddMemberForm({ workspaceId, onAdded }: { workspaceId: string; onAdded: () => void }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<WorkspaceMemberRole>('MEMBER')
  const [error, setError] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await api.POST('/workspaces/{workspaceId}/members', {
        params: { path: { workspaceId } },
        body: { email, role },
      })
      if (!data) throw toApiError(err, '구성원을 추가하지 못했습니다.')
      return data
    },
    onSuccess: (member) => {
      setEmail('')
      setRole('MEMBER')
      toast.success(`${member.name} 님을 구성원으로 추가했습니다.`)
      onAdded()
    },
    onError: (err) => setError(toApiError(err, '구성원을 추가하지 못했습니다.').message),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!email.trim()) {
      setError('추가할 사용자의 이메일을 입력해 주세요.')
      return
    }
    add.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg bg-neutral-50 p-4" noValidate>
      <h3 className="text-sm font-semibold text-neutral-800">구성원 추가</h3>
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <FormField label="이메일" required className="flex-1">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="cheolsu.kim@pusan.ac.kr"
          />
        </FormField>
        <FormField label="역할" className="w-full sm:w-36">
          <Select
            value={role}
            onChange={(event) => setRole(event.target.value as WorkspaceMemberRole)}
          >
            <option value="MEMBER">{WORKSPACE_ROLE_LABELS.MEMBER}</option>
          </Select>
        </FormField>
        <Button type="submit" loading={add.isPending}>
          추가
        </Button>
      </div>
    </form>
  )
}

/* ─── ownership transfer confirm (type-to-confirm) ─── */

function OwnershipTransferModal({
  target,
  pending,
  onCancel,
  onConfirm,
}: {
  target: WorkspaceMember | null
  pending: boolean
  onCancel: () => void
  onConfirm: (member: WorkspaceMember) => void
}) {
  const [confirmEmail, setConfirmEmail] = useState('')

  const close = () => {
    setConfirmEmail('')
    onCancel()
  }

  return (
    <Modal
      open={target !== null}
      onClose={close}
      title="소유자 지정"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            취소
          </Button>
          <Button
            variant="danger"
            loading={pending}
            disabled={confirmEmail !== target?.email}
            onClick={() => {
              if (target) {
                onConfirm(target)
                setConfirmEmail('')
              }
            }}
          >
            소유자로 지정
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          {target?.name} 님을 소유자로 지정합니다. 소유자는 워크스페이스 정보와 구성원을 관리하고,
          워크스페이스가 소유한 리소스를 조회·삭제하며 접근 권한을 관리할 수 있습니다. 회원님의
          소유자 권한은 그대로 유지됩니다.
        </p>
        <FormField
          label="확인 이메일"
          required
          description={`계속하려면 새 소유자의 이메일(${target?.email ?? ''})을 입력해 주세요.`}
        >
          <Input
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
            placeholder={target?.email ?? ''}
          />
        </FormField>
      </div>
    </Modal>
  )
}
