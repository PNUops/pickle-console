import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { toApiError } from '../../api/problem'
import { Alert, Button, FormField, Input, Modal, Select, Textarea } from '../ui'
import { fieldErrorsOf } from '../../lib/field-errors'
import {
  CREATABLE_WORKSPACE_KINDS,
  WORKSPACE_KIND_HINTS,
  WORKSPACE_KIND_LABELS,
  type CreatableWorkspaceKind,
} from '../../lib/labels'

/**
 * 새 워크스페이스 만들기 — 목록 화면과 사이드바 선택기가 함께 쓴다.
 * 만들고 나면 그 워크스페이스 상세로 데려간다(구성원을 부르는 곳이 거기다).
 */
export function CreateWorkspaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // No default. Now that the kind means something, whichever value sits first
  // is the one everything becomes.
  const [kind, setKind] = useState<CreatableWorkspaceKind | ''>('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/workspaces', {
        body: { kind: kind as CreatableWorkspaceKind, name, description: description || null },
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
    if (!kind) errors.kind = '워크스페이스 유형을 선택해 주세요.'
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
        <FormField label="유형" required error={fieldErrors.kind}>
          <Select
            value={kind}
            onChange={(event) => setKind(event.target.value as CreatableWorkspaceKind | '')}
          >
            <option value="">선택해 주세요</option>
            {CREATABLE_WORKSPACE_KINDS.map((value) => (
              <option key={value} value={value}>
                {WORKSPACE_KIND_LABELS[value]} ({WORKSPACE_KIND_HINTS[value]})
              </option>
            ))}
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
