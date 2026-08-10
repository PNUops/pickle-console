import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { toApiError } from '../api/problem'
import { fetchWorkspaces } from '../api/queries'
import {
  Alert,
  Button,
  Card,
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
} from '../components/ui'
import { fieldErrorsOf } from '../lib/field-errors'

export function WorkspacesPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: fetchWorkspaces })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">내 워크스페이스</h1>
          <p className="mt-1 text-sm text-neutral-500">
            내가 속한 워크스페이스 목록입니다. VM은 워크스페이스 명의로 신청합니다.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>새 워크스페이스 만들기</Button>
      </div>

      {workspaces.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="워크스페이스 목록 불러오는 중" />
        </div>
      )}
      {workspaces.isError && <Alert variant="danger">{workspaces.error.message}</Alert>}
      {workspaces.isSuccess && workspaces.data.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          속한 워크스페이스가 없습니다. 새 워크스페이스를 만들어 시작해 보세요.
        </Card>
      )}
      {workspaces.isSuccess && workspaces.data.length > 0 && (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>이름</TH>
                <TH>종류</TH>
                <TH>내 역할</TH>
                <TH>구성원</TH>
                <TH>설명</TH>
              </TR>
            </THead>
            <TBody>
              {workspaces.data.map((workspace) => (
                <TR key={workspace.id}>
                  <TD>
                    <Link
                      to={`/console/workspaces/${workspace.id}`}
                      className="font-medium text-primary-700 hover:underline"
                    >
                      {workspace.name}
                    </Link>
                  </TD>
                  <TD>
                    <WorkspaceKindBadge kind={workspace.kind} />
                  </TD>
                  <TD>
                    <WorkspaceRoleBadge role={workspace.myRole} />
                  </TD>
                  <TD>{workspace.memberCount}명</TD>
                  <TD className="max-w-xs truncate">{workspace.description ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <CreateWorkspaceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

function CreateWorkspaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<'TEAM' | 'PROJECT'>('TEAM')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/workspaces', {
        body: { kind, name, description: description || null },
      })
      if (!data) throw toApiError(error, '워크스페이스를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return data
    },
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      navigate(`/console/workspaces/${workspace.id}`)
    },
    onError: (error) => {
      const apiError = toApiError(error, '워크스페이스를 만들지 못했습니다.')
      const mapped = fieldErrorsOf(apiError.problem)
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped)
        return
      }
      setFormError(apiError.message)
    },
  })

  const close = () => {
    if (create.isPending) return
    setFieldErrors({})
    setFormError(null)
    onClose()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = '워크스페이스 이름을 입력해 주세요.'
    else if (name.length > 100) errors.name = '워크스페이스 이름은 100자 이하로 입력해 주세요.'
    if (description.length > 500) errors.description = '설명은 500자 이하로 입력해 주세요.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    create.mutate()
  }

  return (
    <Modal open={open} onClose={close} title="새 워크스페이스 만들기">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}
        <FormField label="종류" required>
          <Select
            value={kind}
            onChange={(event) => setKind(event.target.value as 'TEAM' | 'PROJECT')}
          >
            <option value="TEAM">팀 (동아리·스터디 등)</option>
            <option value="PROJECT">프로젝트 (수업·캡스톤 등)</option>
          </Select>
        </FormField>
        <FormField label="워크스페이스 이름" required error={fieldErrors.name}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="캡스톤 3조"
            maxLength={100}
          />
        </FormField>
        <FormField label="설명" error={fieldErrors.description}>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="2026-1 캡스톤디자인 3조"
            maxLength={500}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={create.isPending}>
            취소
          </Button>
          <Button type="submit" loading={create.isPending}>
            만들기
          </Button>
        </div>
      </form>
    </Modal>
  )
}
