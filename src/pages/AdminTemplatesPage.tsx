import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAdminVmFlavor,
  fetchAdminTemplates,
  fetchAdminVmFlavors,
  updateAdminTemplate,
  updateAdminVmFlavor,
  type AdminTemplate,
  type VmFlavor,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { isSysAdminOnly } from '../auth/permissions'
import {
  Alert,
  Badge,
  Button,
  Card,
  FormField,
  Input,
  Modal,
  PermissionNotice,
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
import { formatSpec } from '../lib/format'

/** 프리셋 이름 규칙 — 소문자·숫자·하이픈 (서버 검증과 동일). */
const FLAVOR_NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

/**
 * 템플릿·사양 관리 — OS 카탈로그(템플릿)와 사양 프리셋을 각각 나열하고
 * ACTIVE/DISABLED 를 토글한다. 프리셋은 등록·값 수정까지 지원한다.
 */
export function AdminTemplatesPage() {
  const { user } = useAuth()
  const isSysAdmin = !!user && isSysAdminOnly(user.role)
  const [message, setMessage] = useState<string | null>(null)
  const [toggleTarget, setToggleTarget] = useState<AdminTemplate | null>(null)
  const [flavorToggleTarget, setFlavorToggleTarget] = useState<VmFlavor | null>(null)
  const [flavorEditTarget, setFlavorEditTarget] = useState<VmFlavor | null>(null)
  const [flavorCreateOpen, setFlavorCreateOpen] = useState(false)

  const templates = useQuery({ queryKey: ['admin', 'templates'], queryFn: fetchAdminTemplates })
  const flavors = useQuery({ queryKey: ['admin', 'vm-flavors'], queryFn: fetchAdminVmFlavors })

  const activeCount = templates.data?.filter((t) => t.status === 'ACTIVE').length ?? 0
  const activeFlavorCount = flavors.data?.filter((f) => f.status === 'ACTIVE').length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">템플릿·사양 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          신청 위저드의 두 축입니다 — OS 템플릿과 사양 프리셋. 은퇴(비활성)해도 기존 VM은
          영향받지 않습니다.
        </p>
      </div>

      {!isSysAdmin && (
        <PermissionNotice>
          템플릿·사양 프리셋 변경은 시스템 관리자만 수행할 수 있습니다.
        </PermissionNotice>
      )}
      {message && <Alert variant="info">{message}</Alert>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-900">OS 템플릿</h2>

        {templates.isPending && (
          <div className="flex justify-center py-12">
            <Spinner label="템플릿 목록 불러오는 중" />
          </div>
        )}
        {templates.isError && <Alert variant="danger">{templates.error.message}</Alert>}
        {templates.isSuccess && templates.data.length === 0 && (
          <Card className="p-8 text-center text-sm text-neutral-500">
            등록된 템플릿이 없습니다.
          </Card>
        )}
        {templates.isSuccess && templates.data.length > 0 && (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>표시명</TH>
                  <TH>이름 / 버전</TH>
                  <TH>상태</TH>
                  <TH>노드 / VMID</TH>
                  <TH>최소 디스크</TH>
                  <TH>비고</TH>
                  <TH>
                    <span className="sr-only">작업</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {templates.data.map((template) => (
                  <TR key={template.id}>
                    <TD className="font-medium text-neutral-900">{template.displayName}</TD>
                    <TD className="font-mono text-xs text-neutral-500">
                      {template.name} · v{template.version}
                    </TD>
                    <TD>
                      <Badge variant={template.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {template.status === 'ACTIVE' ? '활성' : '은퇴'}
                      </Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-neutral-500">
                      {template.nodeId} / {template.proxmoxVmid}
                    </TD>
                    <TD className="whitespace-nowrap">{template.minDiskGb} GiB</TD>
                    <TD className="max-w-xs truncate text-xs text-neutral-500">
                      {template.notes ?? '—'}
                    </TD>
                    <TD className="text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!isSysAdmin}
                        onClick={() => setToggleTarget(template)}
                      >
                        {template.status === 'ACTIVE' ? '은퇴' : '되살리기'}
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">사양 프리셋</h2>
            <p className="mt-1 text-sm text-neutral-500">
              값을 고쳐도 이미 만들어진 VM과 접수된 신청은 그대로입니다 — 이후 신청의 기준선만
              바뀝니다.
            </p>
          </div>
          <Button size="sm" disabled={!isSysAdmin} onClick={() => setFlavorCreateOpen(true)}>
            프리셋 추가
          </Button>
        </div>

        {flavors.isPending && (
          <div className="flex justify-center py-12">
            <Spinner label="사양 프리셋 목록 불러오는 중" />
          </div>
        )}
        {flavors.isError && <Alert variant="danger">{flavors.error.message}</Alert>}
        {flavors.isSuccess && flavors.data.length === 0 && (
          <Card className="p-8 text-center text-sm text-neutral-500">
            등록된 사양 프리셋이 없습니다.
          </Card>
        )}
        {flavors.isSuccess && flavors.data.length > 0 && (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>표시명</TH>
                  <TH>이름</TH>
                  <TH>사양</TH>
                  <TH>상태</TH>
                  <TH>비고</TH>
                  <TH>
                    <span className="sr-only">작업</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {flavors.data.map((flavor) => (
                  <TR key={flavor.id}>
                    <TD className="font-medium text-neutral-900">{flavor.displayName}</TD>
                    <TD className="font-mono text-xs text-neutral-500">{flavor.name}</TD>
                    <TD className="whitespace-nowrap">
                      {formatSpec(flavor.vcpu, flavor.memoryMb, flavor.diskGb)}
                    </TD>
                    <TD>
                      <Badge variant={flavor.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {flavor.status === 'ACTIVE' ? '활성' : '은퇴'}
                      </Badge>
                    </TD>
                    <TD className="max-w-xs truncate text-xs text-neutral-500">
                      {flavor.notes ?? '—'}
                    </TD>
                    <TD className="space-x-2 text-right whitespace-nowrap">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!isSysAdmin}
                        onClick={() => setFlavorEditTarget(flavor)}
                      >
                        수정
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!isSysAdmin}
                        onClick={() => setFlavorToggleTarget(flavor)}
                      >
                        {flavor.status === 'ACTIVE' ? '은퇴' : '되살리기'}
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </section>

      {toggleTarget && (
        <ToggleTemplateModal
          template={toggleTarget}
          lastActive={toggleTarget.status === 'ACTIVE' && activeCount <= 1}
          onClose={() => setToggleTarget(null)}
          onDone={(text) => {
            setToggleTarget(null)
            setMessage(text)
          }}
        />
      )}

      {flavorToggleTarget && (
        <ToggleFlavorModal
          flavor={flavorToggleTarget}
          lastActive={flavorToggleTarget.status === 'ACTIVE' && activeFlavorCount <= 1}
          onClose={() => setFlavorToggleTarget(null)}
          onDone={(text) => {
            setFlavorToggleTarget(null)
            setMessage(text)
          }}
        />
      )}

      {flavorEditTarget && (
        <EditFlavorModal
          flavor={flavorEditTarget}
          onClose={() => setFlavorEditTarget(null)}
          onDone={(text) => {
            setFlavorEditTarget(null)
            setMessage(text)
          }}
        />
      )}

      {flavorCreateOpen && (
        <CreateFlavorModal
          onClose={() => setFlavorCreateOpen(false)}
          onDone={(text) => {
            setFlavorCreateOpen(false)
            setMessage(text)
          }}
        />
      )}
    </div>
  )
}

/** 프리셋 변경 후 관리자 목록과 신청 위저드 목록을 함께 되살린다. */
function useFlavorInvalidation() {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'vm-flavors'] })
    await queryClient.invalidateQueries({ queryKey: ['vm-flavors'] })
  }
}

function ToggleTemplateModal({
  template,
  lastActive,
  onClose,
  onDone,
}: {
  template: AdminTemplate
  lastActive: boolean
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const retiring = template.status === 'ACTIVE'

  const toggle = useMutation({
    mutationFn: () =>
      updateAdminTemplate(template.id, { status: retiring ? 'DISABLED' : 'ACTIVE' }),
    onSuccess: async () => {
      setError(null)
      onDone(retiring ? '템플릿을 은퇴시켰습니다.' : '템플릿을 다시 활성화했습니다.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'templates'] })
      await queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
    onError: (err) => setError(toApiError(err, '템플릿 상태를 변경하지 못했습니다.').message),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={retiring ? '템플릿 은퇴' : '템플릿 활성화'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            돌아가기
          </Button>
          <Button
            variant={retiring ? 'danger' : 'primary'}
            loading={toggle.isPending}
            onClick={() => toggle.mutate()}
          >
            {retiring ? '은퇴' : '활성화'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {retiring ? (
          <p className="text-sm text-neutral-600">
            <strong>{template.displayName}</strong> (v{template.version})을(를) 은퇴시키면
            신청 위저드에서 사라지고 새 신청 검증에서 거부됩니다. 기존 VM은 영향받지
            않으며, 언제든 다시 활성화할 수 있습니다.
          </p>
        ) : (
          <p className="text-sm text-neutral-600">
            <strong>{template.displayName}</strong> (v{template.version})을(를) 다시 신청
            위저드에 노출합니다.
          </p>
        )}
        {lastActive && (
          <Alert variant="warning">
            마지막 ACTIVE 템플릿입니다 — 은퇴시키면 신규 VM 신청이 불가능해집니다.
          </Alert>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
      </div>
    </Modal>
  )
}

function ToggleFlavorModal({
  flavor,
  lastActive,
  onClose,
  onDone,
}: {
  flavor: VmFlavor
  lastActive: boolean
  onClose: () => void
  onDone: (message: string) => void
}) {
  const invalidate = useFlavorInvalidation()
  const [error, setError] = useState<string | null>(null)
  const retiring = flavor.status === 'ACTIVE'

  const toggle = useMutation({
    mutationFn: () =>
      updateAdminVmFlavor(flavor.id, { status: retiring ? 'DISABLED' : 'ACTIVE' }),
    onSuccess: async () => {
      setError(null)
      onDone(retiring ? '사양 프리셋을 은퇴시켰습니다.' : '사양 프리셋을 다시 활성화했습니다.')
      await invalidate()
    },
    onError: (err) =>
      setError(toApiError(err, '사양 프리셋 상태를 변경하지 못했습니다.').message),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={retiring ? '사양 프리셋 은퇴' : '사양 프리셋 활성화'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            돌아가기
          </Button>
          <Button
            variant={retiring ? 'danger' : 'primary'}
            loading={toggle.isPending}
            onClick={() => toggle.mutate()}
          >
            {retiring ? '은퇴' : '활성화'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {retiring ? (
          <p className="text-sm text-neutral-600">
            <strong>{flavor.displayName}</strong>을(를) 은퇴시키면 신청 위저드에서 사라집니다.
            기존 VM·접수된 신청은 영향받지 않으며, 언제든 다시 활성화할 수 있습니다.
          </p>
        ) : (
          <p className="text-sm text-neutral-600">
            <strong>{flavor.displayName}</strong>을(를) 다시 신청 위저드에 노출합니다.
          </p>
        )}
        {lastActive && (
          <Alert variant="warning">
            마지막 ACTIVE 프리셋입니다 — 은퇴시키면 신규 VM 신청이 불가능해집니다.
          </Alert>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
      </div>
    </Modal>
  )
}

/** vCPU·메모리·디스크 공통 검증 (등록·수정 모달이 함께 쓴다). */
function validateSpecFields(input: {
  displayName: string
  vcpu: string
  memoryMb: string
  diskGb: string
}): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!input.displayName.trim()) errors.displayName = '표시명을 입력해 주세요.'
  if (!(Number(input.vcpu) >= 1)) errors.vcpu = 'vCPU는 1 이상이어야 합니다.'
  if (!(Number(input.memoryMb) >= 256)) errors.memoryMb = '메모리는 256 MiB 이상이어야 합니다.'
  if (!(Number(input.diskGb) >= 1)) errors.diskGb = '디스크는 1 GiB 이상이어야 합니다.'
  return errors
}

function SpecFields({
  displayName,
  setDisplayName,
  vcpu,
  setVcpu,
  memoryMb,
  setMemoryMb,
  diskGb,
  setDiskGb,
  notes,
  setNotes,
  fieldErrors,
}: {
  displayName: string
  setDisplayName: (value: string) => void
  vcpu: string
  setVcpu: (value: string) => void
  memoryMb: string
  setMemoryMb: (value: string) => void
  diskGb: string
  setDiskGb: (value: string) => void
  notes: string
  setNotes: (value: string) => void
  fieldErrors: Record<string, string>
}) {
  return (
    <>
      <FormField label="표시명" required error={fieldErrors.displayName}>
        <Input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="기본형"
          maxLength={100}
        />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField label="vCPU" required error={fieldErrors.vcpu}>
          <Input
            type="number"
            min={1}
            value={vcpu}
            onChange={(event) => setVcpu(event.target.value)}
          />
        </FormField>
        <FormField label="메모리 (MiB)" required error={fieldErrors.memoryMb}>
          <Input
            type="number"
            min={256}
            step={256}
            value={memoryMb}
            onChange={(event) => setMemoryMb(event.target.value)}
          />
        </FormField>
        <FormField label="디스크 (GiB)" required error={fieldErrors.diskGb}>
          <Input
            type="number"
            min={1}
            value={diskGb}
            onChange={(event) => setDiskGb(event.target.value)}
          />
        </FormField>
      </div>
      <FormField label="비고" error={fieldErrors.notes}>
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="대부분의 수업·캡스톤 프로젝트에 적합합니다."
          maxLength={500}
        />
      </FormField>
    </>
  )
}

function EditFlavorModal({
  flavor,
  onClose,
  onDone,
}: {
  flavor: VmFlavor
  onClose: () => void
  onDone: (message: string) => void
}) {
  const invalidate = useFlavorInvalidation()
  const [displayName, setDisplayName] = useState(flavor.displayName)
  const [vcpu, setVcpu] = useState(String(flavor.vcpu))
  const [memoryMb, setMemoryMb] = useState(String(flavor.memoryMb))
  const [diskGb, setDiskGb] = useState(String(flavor.diskGb))
  const [notes, setNotes] = useState(flavor.notes ?? '')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const update = useMutation({
    mutationFn: () =>
      updateAdminVmFlavor(flavor.id, {
        displayName: displayName.trim(),
        vcpu: Number(vcpu),
        memoryMb: Number(memoryMb),
        diskGb: Number(diskGb),
        notes: notes.trim() || null,
      }),
    onSuccess: async () => {
      onDone('사양 프리셋을 수정했습니다.')
      await invalidate()
    },
    onError: (error) => {
      const apiError = toApiError(error, '사양 프리셋을 수정하지 못했습니다.')
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
    const errors = validateSpecFields({ displayName, vcpu, memoryMb, diskGb })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    update.mutate()
  }

  return (
    <Modal open onClose={onClose} title="사양 프리셋 수정">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}
        <FormField label="이름" description="이름은 변경할 수 없습니다.">
          <Input value={flavor.name} disabled />
        </FormField>
        <SpecFields
          displayName={displayName}
          setDisplayName={setDisplayName}
          vcpu={vcpu}
          setVcpu={setVcpu}
          memoryMb={memoryMb}
          setMemoryMb={setMemoryMb}
          diskGb={diskGb}
          setDiskGb={setDiskGb}
          notes={notes}
          setNotes={setNotes}
          fieldErrors={fieldErrors}
        />
        <p className="text-sm text-neutral-500">
          값 변경은 이후 신청의 기준선에만 반영됩니다 — 기존 VM·접수된 신청은 그대로입니다.
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

function CreateFlavorModal({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: (message: string) => void
}) {
  const invalidate = useFlavorInvalidation()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [vcpu, setVcpu] = useState('2')
  const [memoryMb, setMemoryMb] = useState('2048')
  const [diskGb, setDiskGb] = useState('20')
  const [notes, setNotes] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      createAdminVmFlavor({
        name,
        displayName: displayName.trim(),
        vcpu: Number(vcpu),
        memoryMb: Number(memoryMb),
        diskGb: Number(diskGb),
        notes: notes.trim() || null,
      }),
    onSuccess: async () => {
      onDone('사양 프리셋을 추가했습니다.')
      await invalidate()
    },
    onError: (error) => {
      const apiError = toApiError(error, '사양 프리셋을 만들지 못했습니다.')
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
    const errors = validateSpecFields({ displayName, vcpu, memoryMb, diskGb })
    if (!name) errors.name = '프리셋 이름을 입력해 주세요.'
    else if (!FLAVOR_NAME_RE.test(name))
      errors.name =
        '프리셋 이름은 소문자·숫자·하이픈만 사용해 주세요. (하이픈으로 시작·끝 불가)'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    create.mutate()
  }

  return (
    <Modal open onClose={onClose} title="사양 프리셋 추가">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}
        <FormField
          label="이름"
          required
          error={fieldErrors.name}
          description="시스템 전체에서 유일해야 하며, 만든 뒤에는 변경할 수 없습니다."
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="xlarge"
            maxLength={40}
          />
        </FormField>
        <SpecFields
          displayName={displayName}
          setDisplayName={setDisplayName}
          vcpu={vcpu}
          setVcpu={setVcpu}
          memoryMb={memoryMb}
          setMemoryMb={setMemoryMb}
          diskGb={diskGb}
          setDiskGb={setDiskGb}
          notes={notes}
          setNotes={setNotes}
          fieldErrors={fieldErrors}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            취소
          </Button>
          <Button type="submit" loading={create.isPending}>
            추가
          </Button>
        </div>
      </form>
    </Modal>
  )
}
