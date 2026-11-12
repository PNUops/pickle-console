import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAdminVmFlavor,
  fetchAdminNodes,
  fetchAdminOsImages,
  fetchAdminVmFlavors,
  fetchOsImages,
  updateAdminOsImage,
  updateAdminVmFlavor,
  type AdminOsImage,
  type VmFlavor,
  type OsImage,
  type NodeSummary,
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
  Spinner,
  Select,
  Tabs,
  TabPanel,
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
import { AdminRequestPeriods } from '../components/request-period/AdminRequestPeriods'
import { useListUrl } from '../lib/use-list-url'
import { CATALOGUE_TABS, catalogueState, filterCatalogue, logicalChoice, orderedFlavors, retirementImpact, type CatalogueStatus } from '../lib/admin-catalogue'

/** 사양 이름 규칙 — 소문자·숫자·하이픈 (서버 검증과 동일). */
const FLAVOR_NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

/**
 * OS 이미지·사양 관리 — OS 카탈로그와 사양을 각각 나열하고
 * ACTIVE/DISABLED 를 토글한다. 사양은 등록·값 수정까지 지원한다.
 */
export function AdminOsImagesPage() {
  const { user } = useAuth()
  const isSysAdmin = !!user && isSysAdminOnly(user.role)
  const [message, setMessage] = useState<string | null>(null)
  const [toggleTarget, setToggleTarget] = useState<AdminOsImage | null>(null)
  const [flavorToggleTarget, setFlavorToggleTarget] = useState<VmFlavor | null>(null)
  const [flavorEditTarget, setFlavorEditTarget] = useState<VmFlavor | null>(null)
  const [flavorCreateOpen, setFlavorCreateOpen] = useState(false)
  const [params, change] = useListUrl()
  const state = catalogueState(params)

  const osImages = useQuery({ queryKey: ['admin', 'os-images'], queryFn: fetchAdminOsImages })
  const flavors = useQuery({ queryKey: ['admin', 'vm-flavors'], queryFn: fetchAdminVmFlavors })
  // 이미지가 올라가 있는 노드는 id가 아니라 이름으로 읽는다 — 노드 id는 UUID다.
  const nodes = useQuery({ queryKey: ['admin', 'nodes'], queryFn: fetchAdminNodes })
  const logicalImages = useQuery({ queryKey: ['os-images'], queryFn: fetchOsImages })
  const nodeName = (nodeId: string) => nodes.data?.find((n) => n.id === nodeId)?.name ?? '—'

  const activeFlavorCount = flavors.data?.filter((f) => f.status === 'ACTIVE').length ?? 0
  const imageRows = filterCatalogue(osImages.data ?? [], state.q, state.status)
  const flavorRows = filterCatalogue(orderedFlavors(flavors.data ?? []), state.q, state.status)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">신청 카탈로그</h1>
        <p className="mt-1 text-sm text-neutral-500">
          신청 화면에 제공하는 OS 이미지와 사양, 사용 기간을 확인해요.
        </p>
      </div>

      {message && <Alert variant="info">{message}</Alert>}

      <Tabs tabs={CATALOGUE_TABS} value={state.tab} onChange={(tab) => change({ tab, q: undefined, status: undefined })} aria-label="신청 카탈로그 종류" />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="카탈로그 검색"><Input value={state.q} onChange={(event) => change({ q: event.target.value || undefined })} placeholder="표시명 또는 이름" /></FormField>
        <FormField label="상태 필터"><Select value={state.status} onChange={(event) => change({ status: event.target.value === 'ALL' ? undefined : event.target.value })}>
          <option value="ALL">모든 상태</option><option value="ACTIVE">활성</option><option value="DISABLED">은퇴</option>
        </Select></FormField>
      </div>

      <TabPanel id="images" active={state.tab === 'images'}>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-900">OS 이미지</h2>
        {logicalImages.isError && <Alert variant="warning">신청 가능한 이미지 목록을 확인하지 못했어요. 개별 행의 상태만으로는 선택 가능 여부를 판단할 수 없어요.</Alert>}

        {osImages.isPending && (
          <div className="flex justify-center py-12">
            <Spinner label="OS 이미지 목록 불러오는 중" />
          </div>
        )}
        {osImages.isError && <Alert variant="danger">{osImages.error.message}</Alert>}
        {osImages.isSuccess && imageRows.length === 0 && (
          <Card className="p-8 text-center text-sm text-neutral-500">
            {osImages.data.length === 0 ? '등록된 OS 이미지가 없어요.' : '검색 조건에 맞는 OS 이미지가 없어요.'}
          </Card>
        )}
        {osImages.isSuccess && imageRows.length > 0 && (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>표시명</TH>
                  <TH>이름 / 버전</TH>
                  <TH>상태</TH>
                  <TH>신청 가능 여부</TH>
                  <TH>노드 / VMID</TH>
                  <TH>최소 디스크</TH>
                  <TH>비고</TH>
                  {isSysAdmin && (
                    <TH>
                      <span className="sr-only">작업</span>
                    </TH>
                  )}
                </TR>
              </THead>
              <TBody>
                {imageRows.map((image) => (
                  <TR key={image.id}>
                    <TD className="font-medium text-neutral-900">{image.displayName}</TD>
                    <TD className="font-mono text-xs text-neutral-500">
                      {image.name} · v{image.version}
                    </TD>
                    <TD>
                      <Badge variant={image.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {image.status === 'ACTIVE' ? '활성' : '은퇴'}
                      </Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-sm">{logicalImages.isSuccess ? (logicalChoice(image, logicalImages.data) ? '선택 가능' : '선택 불가') : '확인 중'}</TD>
                    <TD className="whitespace-nowrap text-xs text-neutral-500">
                      {nodeName(image.nodeId)} / {image.proxmoxVmid}
                    </TD>
                    <TD className="whitespace-nowrap">{image.minDiskGb} GiB</TD>
                    <TD className="max-w-xs truncate text-xs text-neutral-500">
                      {image.notes ?? '—'}
                    </TD>
                    {isSysAdmin && (
                      <TD className="text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setToggleTarget(image)}
                        >
                          {image.status === 'ACTIVE' ? '은퇴' : '되살리기'}
                        </Button>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </section>
      </TabPanel>

      <TabPanel id="flavors" active={state.tab === 'flavors'}>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">사양</h2>
          </div>
          {isSysAdmin && (
            <Button size="sm" onClick={() => setFlavorCreateOpen(true)}>
              사양 추가
            </Button>
          )}
        </div>
        <p className="text-sm text-neutral-600">표시 순서가 작을수록 신청 화면 앞에 나와요. 은퇴와 수치 변경은 이후 신청의 선택 기준에 적용해요. 이미 요청하거나 부여한 사양 수치는 유지돼요.</p>

        {flavors.isPending && (
          <div className="flex justify-center py-12">
            <Spinner label="사양 목록 불러오는 중" />
          </div>
        )}
        {flavors.isError && <Alert variant="danger">{flavors.error.message}</Alert>}
        {flavors.isSuccess && flavorRows.length === 0 && (
          <Card className="p-8 text-center text-sm text-neutral-500">
            {flavors.data.length === 0 ? '등록된 사양이 없어요.' : '검색 조건에 맞는 사양이 없어요.'}
          </Card>
        )}
        {flavors.isSuccess && flavorRows.length > 0 && (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>표시명</TH>
                  <TH>이름</TH>
                  <TH>사양</TH>
                  <TH>상태</TH>
                  <TH>표시 순서</TH>
                  <TH>비고</TH>
                  {isSysAdmin && (
                    <TH>
                      <span className="sr-only">작업</span>
                    </TH>
                  )}
                </TR>
              </THead>
              <TBody>
                {flavorRows.map((flavor) => (
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
                    <TD>{flavor.displayOrder}</TD>
                    <TD className="max-w-xs truncate text-xs text-neutral-500">
                      {flavor.notes ?? '—'}
                    </TD>
                    {isSysAdmin && (
                      <TD className="space-x-2 text-right whitespace-nowrap">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setFlavorEditTarget(flavor)}
                        >
                          수정
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setFlavorToggleTarget(flavor)}
                        >
                          {flavor.status === 'ACTIVE' ? '은퇴' : '되살리기'}
                        </Button>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </section>
      </TabPanel>

      {isSysAdmin && toggleTarget && (
        <ToggleOsImageModal
          image={toggleTarget}
          inventory={osImages.data ?? []}
          logicalImages={logicalImages.data}
          nodes={nodes.data}
          onClose={() => setToggleTarget(null)}
          onDone={(text) => {
            setToggleTarget(null)
            setMessage(text)
          }}
        />
      )}

      <TabPanel id="periods" active={state.tab === 'periods'}><AdminRequestPeriods isSysAdmin={isSysAdmin} q={state.q} status={state.status as CatalogueStatus} /></TabPanel>

      {isSysAdmin && flavorToggleTarget && (
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

      {isSysAdmin && flavorEditTarget && (
        <EditFlavorModal
          flavor={flavorEditTarget}
          onClose={() => setFlavorEditTarget(null)}
          onDone={(text) => {
            setFlavorEditTarget(null)
            setMessage(text)
          }}
        />
      )}

      {isSysAdmin && flavorCreateOpen && (
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

/** 사양 변경 후 관리자 목록과 신청 위저드 목록을 함께 되살린다. */
function useFlavorInvalidation() {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'vm-flavors'] })
    await queryClient.invalidateQueries({ queryKey: ['vm-flavors'] })
  }
}

function ToggleOsImageModal({
  image,
  inventory,
  logicalImages,
  nodes,
  onClose,
  onDone,
}: {
  image: AdminOsImage
  inventory: AdminOsImage[]
  logicalImages: OsImage[] | undefined
  nodes: NodeSummary[] | undefined
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const retiring = image.status === 'ACTIVE'
  const impact = logicalImages && nodes ? retirementImpact(image, inventory, logicalImages, nodes) : null

  const toggle = useMutation({
    mutationFn: () =>
      updateAdminOsImage(image.id, { status: retiring ? 'DISABLED' : 'ACTIVE' }),
    onSuccess: async () => {
      setError(null)
      onDone(retiring ? '이 노드의 OS 이미지를 은퇴시켰어요.' : '이 노드의 OS 이미지를 활성화했어요.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'os-images'] })
      await queryClient.invalidateQueries({ queryKey: ['os-images'] })
    },
    onError: (err) => setError(toApiError(err, 'OS 이미지 상태 변경 결과를 확인하지 못했어요.').message),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={retiring ? 'OS 이미지 은퇴' : 'OS 이미지 활성화'}
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
            <strong>{image.displayName}</strong> (v{image.version}): 이 노드의 이미지를 사용 중지해요. 기존 VM은 유지돼요.
          </p>
        ) : (
          <p className="text-sm text-neutral-600">
            <strong>{image.displayName}</strong> (v{image.version}): 이 노드의 이미지를 활성화해요.
          </p>
        )}
        {retiring && !impact && <Alert variant="warning">신청 목록에 미치는 영향을 현재 확인하지 못했어요. 저장 후 실제 신청 목록을 다시 확인해 주세요.</Alert>}
        {retiring && impact?.removesChoice === false && <Alert variant="info">신청 가능한 이미지는 유지돼요.</Alert>}
        {retiring && impact?.removesLastChoice && (
          <Alert variant="warning">
            마지막으로 선택 가능한 이미지예요. 사용 중지하면 신청 가능한 이미지가 없어져요.
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
      onDone(retiring ? '사양을 은퇴시켰어요.' : '사양을 활성화했어요.')
      await invalidate()
    },
    onError: (err) =>
      setError(toApiError(err, '사양 상태 변경 결과를 확인하지 못했어요.').message),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={retiring ? '사양 은퇴' : '사양 활성화'}
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
            <strong>{flavor.displayName}</strong> 사양을 은퇴시키면 이후 신청의 프리셋 목록에서 숨겨요. 기존 VM과 접수된 신청의 사양 수치는 유지돼요. 다시 활성화할 수도 있어요.
          </p>
        ) : (
          <p className="text-sm text-neutral-600">
            <strong>{flavor.displayName}</strong> 사양을 이후 신청의 프리셋 목록에 다시 표시해요.
          </p>
        )}
        {lastActive && (
          <Alert variant="warning">
            마지막 활성 사양 프리셋이에요. 은퇴하면 프리셋 선택지가 없어져요. 사양을 직접 입력하는 경로는 유지돼요.
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
  if (!(Number(input.vcpu) >= 1)) errors.vcpu = 'vCPU는 1 이상으로 입력해 주세요.'
  if (!(Number(input.memoryMb) >= 256)) errors.memoryMb = '메모리는 256 MiB 이상으로 입력해 주세요.'
  if (!(Number(input.diskGb) >= 1)) errors.diskGb = '디스크는 1 GiB 이상으로 입력해 주세요.'
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
  displayOrder,
  setDisplayOrder,
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
  displayOrder: string
  setDisplayOrder: (value: string) => void
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
          placeholder="수업과 캡스톤 프로젝트용"
          maxLength={500}
        />
      </FormField>
      <FormField label="표시 순서" error={fieldErrors.displayOrder} description="작을수록 신청 화면 앞에 나와요.">
        <Input type="number" step={1} value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} />
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
  const [displayOrder, setDisplayOrder] = useState(String(flavor.displayOrder))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const update = useMutation({
    mutationFn: () =>
      updateAdminVmFlavor(flavor.id, {
        displayName: displayName.trim(),
        vcpu: Number(vcpu),
        memoryMb: Number(memoryMb),
        diskGb: Number(diskGb),
        // 부분 수정에서 null은 "변경 없음"이다 — 비고를 지우려면 빈 문자열을
        // 보내야 서버가 null로 저장한다.
        notes: notes.trim(),
        displayOrder: Number(displayOrder),
      }),
    onSuccess: async () => {
      onDone('사양을 수정했어요.')
      await invalidate()
    },
    onError: (error) => {
      const apiError = toApiError(error, '사양 수정 결과를 확인하지 못했어요.')
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
    if (!Number.isInteger(Number(displayOrder))) errors.displayOrder = '표시 순서는 정수로 입력해 주세요.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    update.mutate()
  }

  return (
    <Modal open onClose={onClose} title="사양 수정">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}
        <FormField label="이름" description="이름은 바꿀 수 없어요.">
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
          displayOrder={displayOrder}
          setDisplayOrder={setDisplayOrder}
        />
        <p className="text-sm text-neutral-500">
          사양 수치 변경은 이후 신청에 적용하고 기존 VM과 접수된 신청의 수치는 유지해요. 기존 신청의 프리셋 이름은 현재 표시명으로 조회돼요.
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
  const [displayOrder, setDisplayOrder] = useState('0')
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
        displayOrder: Number(displayOrder),
      }),
    onSuccess: async () => {
      onDone('사양을 추가했어요.')
      await invalidate()
    },
    onError: (error) => {
      const apiError = toApiError(error, '사양 추가 결과를 확인하지 못했어요.')
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
    if (!Number.isInteger(Number(displayOrder))) errors.displayOrder = '표시 순서는 정수로 입력해 주세요.'
    if (!name) errors.name = '사양 이름을 입력해 주세요.'
    else if (!FLAVOR_NAME_RE.test(name))
      errors.name =
        '사양 이름은 소문자와 숫자, 하이픈만 사용해 주세요. 하이픈으로 시작하거나 끝날 수 없어요.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    create.mutate()
  }

  return (
    <Modal open onClose={onClose} title="사양 추가">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}
        <FormField
          label="이름"
          required
          error={fieldErrors.name}
          description="시스템 전체에서 고유한 이름이어야 해요. 만든 뒤에는 바꿀 수 없어요."
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
          displayOrder={displayOrder}
          setDisplayOrder={setDisplayOrder}
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
