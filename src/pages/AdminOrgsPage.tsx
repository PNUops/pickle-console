import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toApiError } from '../api/problem'
import { createOrg, fetchAdminOrgs, updateOrg, type OrgDetail } from '../api/queries'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  FormField,
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
import { ORG_STATUS_LABELS } from '../lib/labels'
import { ORG_SLUG_RE } from '../lib/validation'

export function AdminOrgsPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<OrgDetail | null>(null)
  // 관리자 전용 목록 — 공개 /orgs와 달리 DISABLED·hidden 기관을 포함한다.
  const orgs = useQuery({ queryKey: ['admin', 'orgs'], queryFn: fetchAdminOrgs })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">기관 관리</h1>
          <p className="mt-1 text-sm text-neutral-500">
            리소스를 제공하는 기관을 관리하고 기관 관리자를 지정합니다.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>기관 만들기</Button>
      </div>

      {orgs.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="기관 목록 불러오는 중" />
        </div>
      )}
      {orgs.isError && <Alert variant="danger">{orgs.error.message}</Alert>}
      {orgs.isSuccess && orgs.data.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          등록된 기관이 없습니다. 기관을 만들어 리소스 제공을 시작하세요.
        </Card>
      )}
      {orgs.isSuccess && orgs.data.length > 0 && (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>이름</TH>
                <TH>slug</TH>
                <TH>상태</TH>
                <TH>설명</TH>
                <TH className="w-20" />
              </TR>
            </THead>
            <TBody>
              {orgs.data.map((org) => (
                <TR key={org.id}>
                  <TD className="font-medium text-neutral-900">{org.name}</TD>
                  <TD className="font-mono text-xs text-neutral-500">{org.slug}</TD>
                  <TD>
                    <Badge variant={org.status === 'ACTIVE' ? 'success' : 'danger'}>
                      {ORG_STATUS_LABELS[org.status]}
                    </Badge>
                    {org.hidden && (
                      <Badge variant="neutral" className="ml-1">
                        숨김
                      </Badge>
                    )}
                  </TD>
                  <TD className="max-w-sm truncate">{org.description ?? '—'}</TD>
                  <TD>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditTarget(org)}
                    >
                      수정
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <CreateOrgModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {editTarget && (
        <EditOrgModal org={editTarget} onClose={() => setEditTarget(null)} />
      )}
    </div>
  )
}

function CreateOrgModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => createOrg({ name, slug, description: description || null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'orgs'] })
      await queryClient.invalidateQueries({ queryKey: ['orgs'] })
      setName('')
      setSlug('')
      setDescription('')
      setFieldErrors({})
      setFormError(null)
      onClose()
    },
    onError: (error) => {
      const apiError = toApiError(error, '기관을 만들지 못했습니다.')
      if (apiError.code === 'ORG_SLUG_DUPLICATE') {
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
    if (!name.trim()) errors.name = '기관 이름을 입력해 주세요.'
    else if (name.length > 100) errors.name = '기관 이름은 100자 이하로 입력해 주세요.'
    if (!slug) errors.slug = 'slug를 입력해 주세요.'
    else if (!ORG_SLUG_RE.test(slug))
      errors.slug =
        'slug는 소문자·숫자·하이픈만 사용해 40자 이하로 입력해 주세요. (하이픈으로 시작·끝 불가)'
    if (description.length > 500) errors.description = '설명은 500자 이하로 입력해 주세요.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    create.mutate()
  }

  return (
    <Modal open={open} onClose={close} title="기관 만들기">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}
        <FormField label="기관 이름" required error={fieldErrors.name}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="정보컴퓨터공학부 실습지원센터"
            maxLength={100}
          />
        </FormField>
        <FormField
          label="slug"
          required
          error={fieldErrors.slug}
          description="시스템 전체에서 유일해야 하며, 만든 뒤에는 변경할 수 없습니다."
        >
          <Input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="cse-lab"
            maxLength={40}
          />
        </FormField>
        <FormField label="설명" error={fieldErrors.description}>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="학부 수업·캡스톤용 서버 리소스 제공"
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

function EditOrgModal({ org, onClose }: { org: OrgDetail; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(org.name)
  const [description, setDescription] = useState(org.description ?? '')
  const [disabled, setDisabled] = useState(org.status === 'DISABLED')
  const [hidden, setHidden] = useState(org.hidden)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const update = useMutation({
    mutationFn: () =>
      updateOrg(org.id, {
        name,
        description: description || null,
        status: disabled ? 'DISABLED' : 'ACTIVE',
        hidden,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'orgs'] })
      await queryClient.invalidateQueries({ queryKey: ['orgs'] })
      onClose()
    },
    onError: (error) => {
      const apiError = toApiError(error, '기관 정보를 수정하지 못했습니다.')
      const mapped = fieldErrorsOf(apiError.problem)
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped)
        return
      }
      setFormError(apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = '기관 이름을 입력해 주세요.'
    else if (name.length > 100) errors.name = '기관 이름은 100자 이하로 입력해 주세요.'
    if (description.length > 500) errors.description = '설명은 500자 이하로 입력해 주세요.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    update.mutate()
  }

  return (
    <Modal open onClose={onClose} title="기관 수정">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}
        <FormField label="기관 이름" required error={fieldErrors.name}>
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
        </FormField>
        <FormField label="slug" description="slug는 변경할 수 없습니다.">
          <Input value={org.slug} disabled />
        </FormField>
        <FormField label="설명" error={fieldErrors.description}>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
          />
        </FormField>
        <FormField
          label="상태"
          description="비활성화: 신규 VM 신청 대상에서만 제외됩니다 — 로그인·기존 VM·기관 관리자 계정은 영향받지 않습니다."
        >
          <Select
            aria-label="기관 상태"
            value={disabled ? 'DISABLED' : 'ACTIVE'}
            onChange={(event) => setDisabled(event.target.value === 'DISABLED')}
          >
            <option value="ACTIVE">{ORG_STATUS_LABELS.ACTIVE}</option>
            <option value="DISABLED">{ORG_STATUS_LABELS.DISABLED}</option>
          </Select>
        </FormField>
        <Checkbox
          label="일반 사용자에게 숨김"
          checked={hidden}
          onChange={(event) => setHidden(event.target.checked)}
        />
        <p className="text-sm text-neutral-500">
          숨김: 일반 사용자의 신청 폼 기관 목록에서만 빠집니다 — 관리자에게는 항상
          표시되며, 기능(신청 대상 지정·기관 관리자 로그인)은 그대로입니다.
        </p>
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

