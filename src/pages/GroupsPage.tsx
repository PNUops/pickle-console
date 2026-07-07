import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { toApiError } from '../api/problem'
import { fetchGroups } from '../api/queries'
import {
  Alert,
  Button,
  Card,
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
} from '../components/ui'
import { fieldErrorsOf } from '../lib/field-errors'
import { GROUP_SLUG_RE } from '../lib/validation'

export function GroupsPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const groups = useQuery({ queryKey: ['groups'], queryFn: fetchGroups })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">내 그룹</h1>
          <p className="mt-1 text-sm text-neutral-500">
            내가 속한 그룹 목록입니다. VM은 그룹 명의로 신청합니다.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>새 그룹 만들기</Button>
      </div>

      {groups.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="그룹 목록 불러오는 중" />
        </div>
      )}
      {groups.isError && <Alert variant="danger">{groups.error.message}</Alert>}
      {groups.isSuccess && (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>이름</TH>
                <TH>종류</TH>
                <TH>내 역할</TH>
                <TH>멤버</TH>
                <TH>설명</TH>
              </TR>
            </THead>
            <TBody>
              {groups.data.map((group) => (
                <TR key={group.id}>
                  <TD>
                    <Link
                      to={`/console/groups/${group.id}`}
                      className="font-medium text-primary-700 hover:underline"
                    >
                      {group.name}
                    </Link>
                    <span className="ml-2 text-xs text-neutral-400">{group.slug}</span>
                  </TD>
                  <TD>
                    <GroupKindBadge kind={group.kind} />
                  </TD>
                  <TD>
                    <GroupRoleBadge role={group.myRole} />
                  </TD>
                  <TD>{group.memberCount}명</TD>
                  <TD className="max-w-xs truncate">{group.description ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <CreateGroupModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

function CreateGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<'TEAM' | 'PROJECT'>('TEAM')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/groups', {
        body: { kind, name, slug, description: description || null },
      })
      if (!data) throw toApiError(error, '그룹을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return data
    },
    onSuccess: async (group) => {
      await queryClient.invalidateQueries({ queryKey: ['groups'] })
      navigate(`/console/groups/${group.id}`)
    },
    onError: (error) => {
      const apiError = toApiError(error, '그룹을 만들지 못했습니다.')
      if (apiError.code === 'GROUP_SLUG_DUPLICATE') {
        setFieldErrors({ slug: apiError.message })
        return
      }
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
    if (!name.trim()) errors.name = '그룹 이름을 입력해 주세요.'
    else if (name.length > 100) errors.name = '그룹 이름은 100자 이하로 입력해 주세요.'
    if (!slug) errors.slug = 'slug를 입력해 주세요.'
    else if (!GROUP_SLUG_RE.test(slug))
      errors.slug = 'slug는 소문자·숫자·하이픈만 사용해 2~40자로 입력해 주세요. (하이픈으로 시작·끝 불가)'
    if (description.length > 500) errors.description = '설명은 500자 이하로 입력해 주세요.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    create.mutate()
  }

  return (
    <Modal open={open} onClose={close} title="새 그룹 만들기">
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
        <FormField label="그룹 이름" required error={fieldErrors.name}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="캡스톤 3조"
            maxLength={100}
          />
        </FormField>
        <FormField
          label="slug"
          required
          error={fieldErrors.slug}
          description="기본 서브도메인에 사용됩니다. 소문자·숫자·하이픈만 가능하며 전체 시스템에서 유일해야 합니다."
        >
          <Input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="capstone-team3"
            maxLength={40}
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
