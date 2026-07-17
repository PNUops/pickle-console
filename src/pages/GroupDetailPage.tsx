import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { toApiError } from '../api/problem'
import { fetchGroup, type GroupDetail, type GroupMember, type GroupMemberRole } from '../api/queries'
import { useAuth } from '../auth/auth-context'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  GroupKindBadge,
  GroupRoleBadge,
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
import { GROUP_ROLE_LABELS } from '../lib/labels'
import { formatDateTime } from '../lib/format'

const ASSIGNABLE_ROLES: GroupMemberRole[] = ['OWNER', 'EDITOR', 'MEMBER', 'VIEWER']

export function GroupDetailPage() {
  const params = useParams()
  const groupId = Number(params.groupId)
  const group = useQuery({
    queryKey: ['groups', groupId],
    queryFn: () => fetchGroup(groupId),
  })

  if (group.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="그룹 정보 불러오는 중" />
      </div>
    )
  }
  if (group.isError) {
    return <Alert variant="danger">{group.error.message}</Alert>
  }

  const data = group.data
  // 계약 v0.3.x부터 서버가 내 역할을 직접 내려준다 (구성원 목록 스캔 불필요).
  const myRole = data.myRole

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link to="/console/groups" className="text-primary-700 hover:underline">
          ← 내 그룹
        </Link>
      </nav>
      <GroupInfoSection group={data} myRole={myRole} />
      <MembersSection group={data} myRole={myRole} />
    </div>
  )
}

/* ─── group info + edit (contract: OWNER only) ─── */

function GroupInfoSection({
  group,
  myRole,
}: {
  group: GroupDetail
  myRole: GroupMemberRole | null
}) {
  const [editOpen, setEditOpen] = useState(false)

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-neutral-900">{group.name}</h1>
            <GroupKindBadge kind={group.kind} />
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {group.slug} · 생성일 {formatDateTime(group.createdAt)}
          </p>
          {group.description && (
            <p className="mt-2 text-sm text-neutral-600">{group.description}</p>
          )}
        </div>
        {myRole === 'OWNER' && (
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            정보 수정
          </Button>
        )}
      </div>
      {/* 열 때마다 마운트해 지난 편집의 임시 입력이 남지 않게 한다. */}
      {editOpen && <EditGroupModal group={group} onClose={() => setEditOpen(false)} />}
    </div>
  )
}

function EditGroupModal({
  group,
  onClose,
}: {
  group: GroupDetail
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description ?? '')
  const [error, setError] = useState<string | null>(null)

  const update = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await api.PATCH('/groups/{groupId}', {
        params: { path: { groupId: group.id } },
        body: { name, description: description || null },
      })
      if (!data) throw toApiError(err, '그룹 정보를 수정하지 못했습니다.')
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['groups'] })
      onClose()
    },
    onError: (err) => setError(toApiError(err, '그룹 정보를 수정하지 못했습니다.').message),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('그룹 이름을 입력해 주세요.')
      return
    }
    update.mutate()
  }

  return (
    <Modal open onClose={onClose} title="그룹 정보 수정">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert variant="danger">{error}</Alert>}
        <FormField label="그룹 이름" required>
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
  group,
  myRole,
}: {
  group: GroupDetail
  myRole: GroupMemberRole | null
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const toast = useToast()
  const [actionError, setActionError] = useState<string | null>(null)
  const [transferTarget, setTransferTarget] = useState<GroupMember | null>(null)
  const [removeTarget, setRemoveTarget] = useState<GroupMember | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)

  const isPersonal = group.kind === 'PERSONAL'
  const canManage = myRole === 'OWNER' && !isPersonal

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['groups'] })

  const changeRole = useMutation({
    mutationFn: async ({ member, role }: { member: GroupMember; role: GroupMemberRole }) => {
      const { data, error } = await api.PATCH('/groups/{groupId}/members/{userId}', {
        params: { path: { groupId: group.id, userId: member.userId } },
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
    mutationFn: async (member: GroupMember) => {
      const { error, response } = await api.DELETE('/groups/{groupId}/members/{userId}', {
        params: { path: { groupId: group.id, userId: member.userId } },
      })
      if (!response.ok) throw toApiError(error, '구성원을 제거하지 못했습니다.')
      return member
    },
    onSuccess: async (member) => {
      setRemoveTarget(null)
      setLeaveOpen(false)
      if (member.userId === user?.id) {
        toast.success('그룹에서 나갔습니다.')
        navigate('/console/groups')
        await queryClient.invalidateQueries({ queryKey: ['groups'] })
        return
      }
      toast.success(`${member.name} 님을 그룹에서 제거했습니다.`)
      await refresh()
    },
    onError: (err) => {
      setRemoveTarget(null)
      setLeaveOpen(false)
      setActionError(toApiError(err, '구성원을 제거하지 못했습니다.').message)
    },
  })

  const onRoleSelect = (member: GroupMember, role: GroupMemberRole) => {
    setActionError(null)
    if (role === member.role) return
    if (role === 'OWNER') {
      setTransferTarget(member)
      return
    }
    changeRole.mutate({ member, role })
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>구성원 ({group.members.length}명)</CardTitle>
        {!isPersonal && myRole && (
          <Button variant="secondary" size="sm" onClick={() => setLeaveOpen(true)}>
            그룹 나가기
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isPersonal && (
          <Alert variant="info">
            개인 그룹은 회원가입 시 자동으로 생성되는 그룹으로, 구성원을 추가하거나 역할을
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
            {group.members.map((member) => {
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
                            onRoleSelect(member, event.target.value as GroupMemberRole)
                          }
                        >
                          {ASSIGNABLE_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {GROUP_ROLE_LABELS[role]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ) : (
                      <GroupRoleBadge role={member.role} />
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
        {canManage && <AddMemberForm groupId={group.id} onAdded={refresh} />}
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
          {removeTarget?.name}({removeTarget?.email}) 님을 이 그룹에서 제거하시겠습니까?
        </p>
      </Modal>

      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="그룹 나가기"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLeaveOpen(false)}>
              취소
            </Button>
            <Button
              variant="danger"
              loading={removeMember.isPending}
              onClick={() => {
                const self = group.members.find((m) => m.userId === user?.id)
                if (self) removeMember.mutate(self)
              }}
            >
              나가기
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-600">
          정말 이 그룹에서 나가시겠습니까? 나간 후에는 다시 초대받아야 합니다.
        </p>
      </Modal>
    </Card>
  )
}

/* ─── add member (contract: OWNER only) ─── */

function AddMemberForm({ groupId, onAdded }: { groupId: number; onAdded: () => void }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<GroupMemberRole>('MEMBER')
  const [error, setError] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await api.POST('/groups/{groupId}/members', {
        params: { path: { groupId } },
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
            onChange={(event) => setRole(event.target.value as GroupMemberRole)}
          >
            <option value="EDITOR">{GROUP_ROLE_LABELS.EDITOR}</option>
            <option value="MEMBER">{GROUP_ROLE_LABELS.MEMBER}</option>
            <option value="VIEWER">{GROUP_ROLE_LABELS.VIEWER}</option>
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
  target: GroupMember | null
  pending: boolean
  onCancel: () => void
  onConfirm: (member: GroupMember) => void
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
      title="소유권 이전"
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
            소유권 이전
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          정말 소유권을 이전하시겠습니까? {target?.name} 님이 새 소유자(OWNER)가 되고,
          회원님은 편집자(EDITOR)로 변경됩니다. 이 작업은 새 소유자만 되돌릴 수 있습니다.
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
