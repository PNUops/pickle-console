import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { toApiError } from '../../api/problem'
import type { WorkspaceDetail, WorkspaceMember } from '../../api/queries'
import { Alert, Button, FormField, Input, Modal, Select, Textarea } from '../ui'
import { CREATABLE_WORKSPACE_KINDS, WORKSPACE_KIND_HINTS, WORKSPACE_KIND_LABELS, type CreatableWorkspaceKind } from '../../lib/labels'
import { useActiveResult } from '../../lib/use-active-result'

export function EditWorkspaceModal({
  workspace,
  onClose,
  saveInfo,
}: {
  workspace: Pick<WorkspaceDetail, 'id' | 'name' | 'description' | 'kind'>
  onClose: () => void
  saveInfo?: (body: { name: string; description: string | null; kind?: CreatableWorkspaceKind }) => Promise<unknown>
}) {
  const queryClient = useQueryClient()
  const active = useActiveResult()
  const [name, setName] = useState(workspace.name)
  const [description, setDescription] = useState(workspace.description ?? '')
  // A personal workspace cannot be reclassified: automatic creation, the
  // undeletable rule and the closed member list all decide by that value.
  const personal = workspace.kind === 'PERSONAL'
  // A kind this build cannot offer (retired TEAM, or one the server shipped
  // first) has no option to select. Starting on it would leave the select
  // showing its first entry while the state held the old value, so saving
  // would send nothing and the screen would claim a change it never made.
  // Start unset instead and make the owner choose.
  const creatable = CREATABLE_WORKSPACE_KINDS.includes(
    workspace.kind as CreatableWorkspaceKind,
  )
  const [kind, setKind] = useState<CreatableWorkspaceKind | ''>(
    personal || !creatable ? '' : (workspace.kind as CreatableWorkspaceKind),
  )
  const [error, setError] = useState<string | null>(null)

  const update = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        description: description || null,
        ...(kind !== '' && kind !== workspace.kind ? { kind } : {}),
      }
      if (saveInfo) return saveInfo(body)
      const { data, error: err } = await api.PATCH('/workspaces/{workspaceId}', {
        params: { path: { workspaceId: workspace.id } },
        body,
      })
      if (!data) throw toApiError(err, '워크스페이스 정보를 수정하지 못했습니다.')
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'workspaces'] })
      if (active.current) onClose()
    },
    onError: (err) => { if (active.current) setError(toApiError(err, '워크스페이스 정보를 수정하지 못했습니다.').message) },
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
        {!personal && (
          <FormField label="유형" required>
            <Select
              value={kind}
              onChange={(event) => setKind(event.target.value as CreatableWorkspaceKind)}
            >
              {kind === '' && <option value="">선택해 주세요</option>}
              {CREATABLE_WORKSPACE_KINDS.map((value) => (
                <option key={value} value={value}>
                  {WORKSPACE_KIND_LABELS[value]} ({WORKSPACE_KIND_HINTS[value]})
                </option>
              ))}
            </Select>
          </FormField>
        )}
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

export function OwnershipTransferModal({
  target,
  pending,
  onCancel,
  onConfirm,
  children,
}: {
  target: (Omit<WorkspaceMember, 'email'> & { email?: string | null }) | null
  pending: boolean
  onCancel: () => void
  onConfirm: (member: Omit<WorkspaceMember, 'email'> & { email?: string | null }) => void
  children?: ReactNode
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
            disabled={!target || confirmEmail !== (target.email ?? target.userId)}
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
          워크스페이스가 소유한 리소스를 조회·삭제하며 접근 권한을 관리할 수 있습니다. 기존
          소유자의 권한은 그대로 유지됩니다.
        </p>
        {children}
        <FormField
          label={target?.email ? '확인 이메일' : '대상 사용자 ID 확인'}
          required
          description={target?.email ? `계속하려면 새 소유자의 이메일(${target.email})을 입력해 주세요.` : `이메일을 제공할 수 없어 새 소유자의 사용자 ID(${target?.userId ?? ''})로 대상을 확인합니다.`}
        >
          <Input
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
            placeholder={target?.email ?? target?.userId ?? ''}
          />
        </FormField>
      </div>
    </Modal>
  )
}
