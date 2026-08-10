import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { toApiError } from '../api/problem'
import {
  fetchWorkspaces,
  fetchOrgs,
  fetchRequestOptions,
  fetchOsImages,
  fetchVmFlavors,
  type CreateRequest,
  type VmFlavor,
  type RequestDetail,
} from '../api/queries'
import {
  Alert,
  Button,
  Card,
  CardContent,
  FormField,
  Input,
  Select,
  Spinner,
  Stepper,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
} from '../components/ui'
import { cn } from '../lib/cn'
import { SSH_GATEWAY_HOST } from '../lib/hosts'
import { fieldErrorsOf } from '../lib/field-errors'
import { formatMemory, formatSpec } from '../lib/format'
import { VM_REQUEST_DRAFT_KEY } from '../lib/storage-keys'
import { SUBDOMAIN_RE } from '../lib/validation'

const STEPS = ['종류', '워크스페이스·기관·이름', 'OS·사양', '용도·기간', '확인·제출']

/** 422 errors[] 필드명 → 한국어 라벨 (요약 알림 표시용). */
const FIELD_LABELS: Record<string, string> = {
  workspaceId: '워크스페이스',
  orgId: '기관',
  imageId: 'OS',
  flavorId: '사양 프리셋',
  purpose: '용도',
  courseOrProject: '수업/프로젝트',
  specReason: '사양 사유',
  extraNote: '기타 참고',
  reqVcpu: 'vCPU',
  reqMemoryMb: '메모리',
  reqDiskGb: '디스크',
  reqStartDate: '시작일',
  reqEndDate: '종료일',
  displayName: '표시명',
  desiredSlug: '호스트명(슬러그)',
}

interface WizardState {
  workspaceId: number | null
  orgId: number | null
  imageId: number | null
  flavorId: number | null
  reqVcpu: number
  reqMemoryMb: number
  reqDiskGb: number
  specReason: string
  purpose: string
  courseOrProject: string
  extraNote: string
  reqStartDate: string
  reqEndDate: string
  displayName: string
  desiredSlug: string
}

const INITIAL_STATE: WizardState = {
  workspaceId: null,
  orgId: null,
  imageId: null,
  flavorId: null,
  reqVcpu: 1,
  reqMemoryMb: 1024,
  reqDiskGb: 10,
  specReason: '',
  purpose: '',
  courseOrProject: '',
  extraNote: '',
  reqStartDate: '',
  reqEndDate: '',
  displayName: '',
  desiredSlug: '',
}

type FieldErrors = Partial<Record<string, string>>

/** 새로고침/뒤로가기에도 작성 중인 신청서를 유지하기 위한 세션 저장 키. */
const DRAFT_KEY = VM_REQUEST_DRAFT_KEY

function loadDraft(): WizardState {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return INITIAL_STATE
    return { ...INITIAL_STATE, ...(JSON.parse(raw) as Partial<WizardState>) }
  } catch {
    return INITIAL_STATE
  }
}

/** `?step=n`(1부터) → 내부 단계 인덱스(0부터). 잘못된 값은 첫 단계로. */
function parseStepParam(value: string | null): number {
  const n = Number(value ?? '1')
  return Number.isInteger(n) && n >= 1 && n <= STEPS.length ? n - 1 : 0
}

/** 선택한 사양 프리셋을 초과하는 요청인지 (초과 시 specReason 필수 — 서버와 동일 규칙). */
function exceedsFlavor(state: WizardState, flavor: VmFlavor | undefined): boolean {
  if (!flavor) return false
  return (
    state.reqVcpu > flavor.vcpu ||
    state.reqMemoryMb > flavor.memoryMb ||
    state.reqDiskGb > flavor.diskGb
  )
}

export function NewRequestPage() {
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: fetchWorkspaces })
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs })
  const osImages = useQuery({ queryKey: ['os-images'], queryFn: fetchOsImages })
  const flavors = useQuery({ queryKey: ['vm-flavors'], queryFn: fetchVmFlavors })
  const options = useQuery({ queryKey: ['request-options'], queryFn: fetchRequestOptions })

  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [state, setState] = useState<WizardState>(loadDraft)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState<RequestDetail | null>(null)

  const update = (patch: Partial<WizardState>) => setState((prev) => ({ ...prev, ...patch }))

  const isLoading =
    workspaces.isPending ||
    orgs.isPending ||
    osImages.isPending ||
    flavors.isPending ||
    options.isPending
  const loadError =
    workspaces.error ?? orgs.error ?? osImages.error ?? flavors.error ?? options.error
  const ready = !isLoading && !loadError

  // 신청은 구성원이면 누구나 할 수 있다 — 문턱은 승인이 잡는다.
  const eligibleWorkspaces = workspaces.data ?? []
  const selectedWorkspace = eligibleWorkspaces.find((g) => g.id === state.workspaceId)
  const selectedOrg = orgs.data?.find((o) => o.id === state.orgId)
  const selectedImage = osImages.data?.find((t) => t.id === state.imageId)
  const selectedFlavor = flavors.data?.find((f) => f.id === state.flavorId)

  const validateStep = (index: number): FieldErrors => {
    const next: FieldErrors = {}
    if (index === 1) {
      // 목록에 없는 id(초안에 남은, 그새 나온 워크스페이스나 없어진 기관)는 선택되지
      // 않은 것으로 본다 — Select는 이미 비어 보이는데 상태에는 남아 있어, 그대로
      // 두면 요약이 원시 id를 보여주고 제출이 403·422로 튕긴다.
      if (state.workspaceId == null || !selectedWorkspace)
        next.workspaceId = '신청할 워크스페이스를 선택해 주세요.'
      if (state.orgId == null || !selectedOrg)
        next.orgId = '리소스를 제공할 기관을 선택해 주세요.'
      if (state.displayName.length > 100)
        next.displayName = '표시명은 100자 이하로 입력해 주세요.'
      if (state.desiredSlug) {
        if (!SUBDOMAIN_RE.test(state.desiredSlug)) {
          next.desiredSlug =
            '호스트명(슬러그)은 소문자·숫자·하이픈만 사용해 3~40자로 입력해 주세요. (하이픈으로 시작·끝 불가)'
        } else if (options.data?.reservedSubdomains.includes(state.desiredSlug)) {
          next.desiredSlug = `'${state.desiredSlug}'은(는) 예약된 이름이라 사용할 수 없습니다.`
        }
      }
    }
    if (index === 2) {
      // 목록에 없는 id(초안에 남은 은퇴 OS·프리셋, 직접 넣은 값)는 선택되지 않은
      // 것으로 본다 — 그대로 두면 요약이 원시 id를 보여주고 제출이 422로 튕긴다.
      if (state.imageId == null || !selectedImage) next.imageId = 'OS를 선택해 주세요.'
      if (state.flavorId == null || !selectedFlavor)
        next.flavorId = '사양 프리셋을 선택해 주세요.'
      if (selectedImage && selectedFlavor) {
        if (state.reqVcpu < 1) next.reqVcpu = 'vCPU는 1 이상이어야 합니다.'
        if (state.reqMemoryMb < 256) next.reqMemoryMb = '메모리는 256 MiB 이상이어야 합니다.'
        if (state.reqDiskGb < selectedImage.minDiskGb)
          next.reqDiskGb = `디스크는 이 OS의 최소 크기(${selectedImage.minDiskGb} GiB) 이상이어야 합니다.`
        if (exceedsFlavor(state, selectedFlavor) && !state.specReason.trim())
          next.specReason = '선택한 사양 프리셋보다 높은 사양을 요청할 때는 사유를 입력해 주세요.'
      }
    }
    if (index === 3) {
      if (!state.purpose.trim()) next.purpose = '사용 목적을 입력해 주세요.'
      else if (state.purpose.length > 2000)
        next.purpose = '사용 목적은 2000자 이하로 입력해 주세요.'
      if (state.courseOrProject.length > 200)
        next.courseOrProject = '수업/프로젝트명은 200자 이하로 입력해 주세요.'
      if (state.reqStartDate && state.reqEndDate && state.reqEndDate < state.reqStartDate)
        next.reqEndDate = '종료일은 시작일 이후여야 합니다.'
    }
    return next
  }

  /** 현재 입력값으로 도달할 수 있는 최대 단계 (자기 검증이 실패하는 첫 단계). */
  const firstBlockedStep = (): number => {
    for (let i = 0; i < STEPS.length - 1; i++) {
      if (Object.keys(validateStep(i)).length > 0) return i
    }
    return STEPS.length - 1
  }

  const requestedStep = parseStepParam(searchParams.get('step'))
  const step = ready ? Math.min(requestedStep, firstBlockedStep()) : requestedStep

  const goToStep = (index: number, opts?: { replace?: boolean }) => {
    setSearchParams({ step: String(index + 1) }, opts)
  }

  // 직접 진입/뒤로가기로 아직 완료되지 않은 단계에 들어오면 첫 미완료 단계로 되돌린다.
  useEffect(() => {
    if (!ready || submitted) return
    if (requestedStep !== step) goToStep(step, { replace: true })
  })

  // 작성 중인 신청서를 세션에 보관해 새로고침/뒤로가기에도 입력을 유지한다.
  useEffect(() => {
    if (submitted) return
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state))
  }, [state, submitted])

  const submit = useMutation({
    mutationFn: async (body: CreateRequest) => {
      const { data, error } = await api.POST('/requests', { body })
      if (!data) throw toApiError(error, '신청을 제출하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return data
    },
    onSuccess: (data) => {
      sessionStorage.removeItem(DRAFT_KEY)
      void queryClient.invalidateQueries({ queryKey: ['requests'] })
      setSubmitted(data)
    },
    onError: (err) => {
      const apiError = toApiError(err, '신청을 제출하지 못했습니다.')
      setServerFieldErrors(fieldErrorsOf(apiError.problem))
      setSubmitError(apiError.message)
    },
  })

  if (submitted) {
    return <SubmitSuccess request={submitted} />
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="신청 정보 불러오는 중" />
      </div>
    )
  }
  if (loadError) {
    return <Alert variant="danger">{loadError.message}</Alert>
  }

  const goNext = () => {
    const stepErrors = validateStep(step)
    setErrors(stepErrors)
    if (Object.keys(stepErrors).length > 0) return
    goToStep(Math.min(step + 1, STEPS.length - 1))
  }

  const goPrev = () => {
    setErrors({})
    goToStep(Math.max(step - 1, 0))
  }

  const buildPayload = (): CreateRequest => ({
    type: 'VM',
    workspaceId: state.workspaceId!,
    orgId: state.orgId!,
    purpose: state.purpose.trim(),
    courseOrProject: state.courseOrProject.trim() || null,
    extraNote: state.extraNote.trim() || null,
    reqStartDate: state.reqStartDate || null,
    reqEndDate: state.reqEndDate || null,
    displayName: state.displayName.trim() || null,
    vm: {
      imageId: state.imageId!,
      flavorId: state.flavorId!,
      reqVcpu: state.reqVcpu,
      reqMemoryMb: state.reqMemoryMb,
      reqDiskGb: state.reqDiskGb,
      specReason: state.specReason.trim() || null,
      desiredSlug: state.desiredSlug || null,
    },
  })

  const onSubmit = () => {
    // 제출 전 전체 단계를 다시 검증한다 (뒤로 갔다가 값을 바꾼 경우 대비).
    for (let i = 0; i < STEPS.length - 1; i++) {
      const stepErrors = validateStep(i)
      if (Object.keys(stepErrors).length > 0) {
        goToStep(i)
        setErrors(stepErrors)
        return
      }
    }
    setSubmitError(null)
    setServerFieldErrors({})
    submit.mutate(buildPayload())
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">리소스 신청</h1>
        <p className="mt-1 text-sm text-neutral-500">
          다섯 단계로 신청서를 작성합니다. 제출하면 관리자가 검토합니다.
        </p>
      </div>

      <Stepper steps={STEPS} current={step} />

      <Card>
        <CardContent className="space-y-5 py-6">
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600">무엇을 신청할지 고르세요.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed="true"
                  className="cursor-pointer rounded-xl border-2 border-primary-500 bg-primary-50/40 p-4 text-left"
                >
                  <span className="block font-medium text-neutral-900">가상 머신 (VM)</span>
                  <span className="mt-1 block text-sm text-neutral-500">
                    SSH로 접속해 쓰는 리눅스 서버입니다.
                  </span>
                </button>
              </div>
              <p className="text-xs text-neutral-400">
                컨테이너와 LLM API 키는 준비 중입니다.
              </p>
            </div>
          )}

          {step === 1 && (
            <>
              {eligibleWorkspaces.length === 0 && (
                <Alert variant="warning">
                  VM을 신청할 수 있는 워크스페이스가 없습니다. 워크스페이스에 속해 있어야 신청할 수
                  있습니다.{' '}
                  <Link to="/console/workspaces" className="font-medium underline">
                    내 워크스페이스에서 워크스페이스를 만들어 주세요.
                  </Link>
                </Alert>
              )}
              <FormField
                label="신청 워크스페이스"
                required
                error={errors.workspaceId}
                description="VM은 워크스페이스 명의로 만들어집니다. 만들어진 VM은 신청한 사람만 접근할 수 있고, 접근 권한은 생성 후 VM 상세에서 부여합니다."
              >
                <Select
                  value={state.workspaceId ?? ''}
                  onChange={(event) =>
                    update({ workspaceId: event.target.value ? Number(event.target.value) : null })
                  }
                >
                  <option value="">워크스페이스 선택</option>
                  {eligibleWorkspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="기관" required error={errors.orgId}>
                <Select
                  value={state.orgId ?? ''}
                  onChange={(event) =>
                    update({ orgId: event.target.value ? Number(event.target.value) : null })
                  }
                >
                  <option value="">기관 선택</option>
                  {orgs.data?.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </Select>
              </FormField>

              <div className="space-y-4 border-t border-neutral-100 pt-4">
                <h2 className="text-sm font-semibold text-neutral-800">VM 이름</h2>
                <FormField
                  label="표시명"
                  error={errors.displayName}
                  description="콘솔 목록에 보이는 이름입니다. 비워 두면 호스트명이 그대로 쓰이며, VM 설정에서 언제든 바꿀 수 있습니다."
                >
                  <Input
                    value={state.displayName}
                    onChange={(event) => update({ displayName: event.target.value })}
                    maxLength={100}
                    placeholder="예: 캡스톤 백엔드 서버"
                  />
                </FormField>
                <FormField
                  label="희망 호스트명(슬러그)"
                  error={errors.desiredSlug}
                  description={`SSH 접속명으로 쓰입니다 — ssh ${state.desiredSlug || '<슬러그>'}@${
                    options.data?.sshHost ?? SSH_GATEWAY_HOST
                  } · 미입력 시 자동 생성됩니다.`}
                >
                  <Input
                    value={state.desiredSlug}
                    onChange={(event) => update({ desiredSlug: event.target.value })}
                    placeholder="미입력 시 자동 생성"
                    maxLength={40}
                  />
                </FormField>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <fieldset>
                <legend className="text-sm font-medium text-neutral-700">
                  OS 선택 <span aria-hidden="true" className="text-danger-600">*</span>
                </legend>
                {errors.imageId && (
                  <p role="alert" className="mt-1 text-sm text-danger-600">
                    {errors.imageId}
                  </p>
                )}
                {osImages.data?.length === 0 && (
                  <Alert variant="warning" className="mt-2">
                    신청할 수 있는 OS가 아직 없습니다. 관리자가 OS를 등록하면 신청할 수
                    있습니다.
                  </Alert>
                )}
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {osImages.data?.map((image) => {
                    const selected = image.id === state.imageId
                    return (
                      <button
                        key={image.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          update({
                            imageId: image.id,
                            // 이미 고른 사양(또는 직접 입력값)이 이 OS의 최소 디스크보다
                            // 작으면 끌어올린다 — 사양을 먼저 골랐거나 OS를 바꾼 경우.
                            reqDiskGb: Math.max(state.reqDiskGb, image.minDiskGb),
                          })
                        }
                        className={cn(
                          'cursor-pointer rounded-card border p-4 text-left focus-visible:outline-2 focus-visible:outline-primary-600',
                          selected
                            ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                            : 'border-neutral-200 bg-white hover:border-neutral-300',
                        )}
                      >
                        <p className="font-medium text-neutral-900">
                          {image.displayName} <span className="text-neutral-400">v{image.version}</span>
                        </p>
                        <p className="mt-1 text-sm text-neutral-500">
                          최소 디스크 {image.minDiskGb} GiB
                        </p>
                        {image.notes && (
                          <p className="mt-1 text-xs text-neutral-500">{image.notes}</p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <fieldset className="border-t border-neutral-100 pt-4">
                <legend className="text-sm font-medium text-neutral-700">
                  사양 선택 <span aria-hidden="true" className="text-danger-600">*</span>
                </legend>
                {errors.flavorId && (
                  <p role="alert" className="mt-1 text-sm text-danger-600">
                    {errors.flavorId}
                  </p>
                )}
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {flavors.data?.map((flavor) => {
                    const selected = flavor.id === state.flavorId
                    return (
                      <button
                        key={flavor.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          update({
                            flavorId: flavor.id,
                            reqVcpu: flavor.vcpu,
                            reqMemoryMb: flavor.memoryMb,
                            // 선택한 OS의 최소 디스크가 더 크면 그 값으로 올려 채운다 —
                            // 프리셋 값 그대로 넣으면 곧바로 검증에 걸린다.
                            reqDiskGb: Math.max(flavor.diskGb, selectedImage?.minDiskGb ?? 0),
                          })
                        }
                        className={cn(
                          'cursor-pointer rounded-card border p-4 text-left focus-visible:outline-2 focus-visible:outline-primary-600',
                          selected
                            ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                            : 'border-neutral-200 bg-white hover:border-neutral-300',
                        )}
                      >
                        <p className="font-medium text-neutral-900">{flavor.displayName}</p>
                        <p className="mt-1 text-sm text-neutral-500">
                          {formatSpec(flavor.vcpu, flavor.memoryMb, flavor.diskGb)}
                        </p>
                        {flavor.notes && (
                          <p className="mt-1 text-xs text-neutral-500">{flavor.notes}</p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {selectedImage && selectedFlavor && (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <FormField label="vCPU" required error={errors.reqVcpu}>
                      <Input
                        type="number"
                        min={1}
                        value={state.reqVcpu}
                        onChange={(event) => update({ reqVcpu: Number(event.target.value) })}
                      />
                    </FormField>
                    <FormField label="메모리 (MiB)" required error={errors.reqMemoryMb}>
                      <Input
                        type="number"
                        min={256}
                        step={256}
                        value={state.reqMemoryMb}
                        onChange={(event) => update({ reqMemoryMb: Number(event.target.value) })}
                      />
                    </FormField>
                    <FormField label="디스크 (GiB)" required error={errors.reqDiskGb}>
                      <Input
                        type="number"
                        min={selectedImage.minDiskGb}
                        value={state.reqDiskGb}
                        onChange={(event) => update({ reqDiskGb: Number(event.target.value) })}
                      />
                    </FormField>
                  </div>
                  {exceedsFlavor(state, selectedFlavor) && (
                    <FormField
                      label="사양 사유"
                      required
                      error={errors.specReason}
                      description={`선택한 프리셋(${selectedFlavor.displayName})보다 높은 사양을 요청하는 이유를 적어 주세요. 관리자 검토에 사용됩니다.`}
                    >
                      <Textarea
                        value={state.specReason}
                        onChange={(event) => update({ specReason: event.target.value })}
                        maxLength={2000}
                        placeholder="예: Spring Boot + PostgreSQL 동시 구동을 위해 메모리 4GiB 필요"
                      />
                    </FormField>
                  )}
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <FormField label="사용 목적" required error={errors.purpose}>
                <Textarea
                  value={state.purpose}
                  onChange={(event) => update({ purpose: event.target.value })}
                  maxLength={2000}
                  placeholder="예: 캡스톤 프로젝트 백엔드 서버 운영"
                />
              </FormField>
              <FormField label="수업/프로젝트명" error={errors.courseOrProject}>
                <Input
                  value={state.courseOrProject}
                  onChange={(event) => update({ courseOrProject: event.target.value })}
                  maxLength={200}
                  placeholder="예: 2026-1 캡스톤디자인 3조"
                />
              </FormField>
              <FormField label="기타 참고 사항" error={errors.extraNote}>
                <Textarea
                  value={state.extraNote}
                  onChange={(event) => update({ extraNote: event.target.value })}
                  maxLength={2000}
                  placeholder="관리자에게 전달할 내용이 있으면 적어 주세요."
                />
              </FormField>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="희망 시작일" error={errors.reqStartDate}>
                  <Input
                    type="date"
                    value={state.reqStartDate}
                    onChange={(event) => update({ reqStartDate: event.target.value })}
                  />
                </FormField>
                <FormField label="희망 종료일" error={errors.reqEndDate}>
                  <Input
                    type="date"
                    value={state.reqEndDate}
                    onChange={(event) => update({ reqEndDate: event.target.value })}
                  />
                </FormField>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              {submitError && (
                <Alert variant="danger" title={submitError}>
                  {Object.keys(serverFieldErrors).length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-4">
                      {Object.entries(serverFieldErrors).map(([field, message]) => (
                        <li key={field}>
                          {FIELD_LABELS[field] ?? field}: {message}
                        </li>
                      ))}
                    </ul>
                  )}
                </Alert>
              )}
              <SummaryTable
                state={state}
                workspaceName={selectedWorkspace?.name ?? String(state.workspaceId)}
                orgName={selectedOrg?.name ?? String(state.orgId)}
                imageName={selectedImage?.displayName ?? String(state.imageId)}
                flavorName={selectedFlavor?.displayName ?? String(state.flavorId)}
              />
              <Alert variant="warning" title="백업 책임 안내">
                플랫폼은 VM 데이터를 백업하지 않습니다. 데이터 보호와 백업은 사용자
                책임이며, 삭제된 VM의 데이터는 복구할 수 없습니다.
              </Alert>
            </>
          )}

          <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
            <Button variant="secondary" onClick={goPrev} disabled={step === 0 || submit.isPending}>
              이전
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={goNext}>다음</Button>
            ) : (
              <Button onClick={onSubmit} loading={submit.isPending}>
                신청 제출
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryTable({
  state,
  workspaceName,
  orgName,
  imageName,
  flavorName,
}: {
  state: WizardState
  workspaceName: string
  orgName: string
  imageName: string
  flavorName: string
}) {
  const rows: [string, string][] = [
    ['워크스페이스', workspaceName],
    ['기관', orgName],
    ['OS', imageName],
    ['사양 프리셋', flavorName],
    ['요청 사양', `${state.reqVcpu} vCPU · ${formatMemory(state.reqMemoryMb)} · ${state.reqDiskGb} GiB`],
    ['사양 사유', state.specReason.trim() || '—'],
    ['사용 목적', state.purpose.trim()],
    ['수업/프로젝트명', state.courseOrProject.trim() || '—'],
    ['기타 참고', state.extraNote.trim() || '—'],
    ['표시명', state.displayName.trim() || '호스트명 사용'],
    ['호스트명(SSH 접속명)', state.desiredSlug || '자동 생성'],
    [
      '사용 기간',
      state.reqStartDate || state.reqEndDate
        ? `${state.reqStartDate || '미지정'} ~ ${state.reqEndDate || '미지정'}`
        : '미지정',
    ],
  ]

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-neutral-800">신청 내용 확인</h2>
      <Table>
        <THead>
          <TR>
            <TH className="w-40">항목</TH>
            <TH>내용</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map(([label, value]) => (
            <TR key={label}>
              <TD className="font-medium whitespace-nowrap text-neutral-500">{label}</TD>
              <TD>{value}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  )
}

function SubmitSuccess({ request }: { request: RequestDetail }) {
  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <div
        aria-hidden="true"
        className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-100 text-success-700"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-8">
          <path
            fillRule="evenodd"
            d="M20.03 6.72a.75.75 0 0 1 0 1.06l-9.5 9.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.97 3.97 8.97-8.97a.75.75 0 0 1 1.06 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <h1 className="mt-4 text-2xl font-bold text-neutral-900">신청이 접수되었습니다</h1>
      <p className="mt-2 text-sm text-neutral-600">
        신청 번호 #{request.id} — 관리자 검토 후 결과를 확인할 수 있습니다.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link to={`/console/requests/${request.id}`}>
          <Button variant="secondary">신청 상세 보기</Button>
        </Link>
        <Link to="/console/requests">
          <Button>내 신청으로 이동</Button>
        </Link>
      </div>
    </div>
  )
}
