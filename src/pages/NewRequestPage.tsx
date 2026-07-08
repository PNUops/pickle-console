import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { toApiError } from '../api/problem'
import {
  fetchGroups,
  fetchOrgs,
  fetchRequestOptions,
  fetchTemplates,
  type CreateVmRequest,
  type VmRequestDetail,
  type VmTemplate,
} from '../api/queries'
import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
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
import { fieldErrorsOf } from '../lib/field-errors'
import { formatMemory, formatSpec } from '../lib/format'
import { HOSTNAME_RE, SUBDOMAIN_RE } from '../lib/validation'

/** 커스텀 도메인 입력 정규화: 앞뒤 공백 제거 + 소문자화 (전송·검증 공통). */
function normalizeCustomDomain(value: string): string {
  return value.trim().toLowerCase()
}

const STEPS = ['그룹·기관', '템플릿·사양', '용도·기간', '네트워크·도메인', '확인·제출']

/** 422 errors[] 필드명 → 한국어 라벨 (요약 알림 표시용). */
const FIELD_LABELS: Record<string, string> = {
  groupId: '그룹',
  orgId: '기관',
  templateId: '템플릿',
  purpose: '용도',
  courseOrProject: '수업/프로젝트',
  specReason: '사양 사유',
  extraNote: '기타 참고',
  reqVcpu: 'vCPU',
  reqMemoryMb: '메모리',
  reqDiskGb: '디스크',
  reqStartDate: '시작일',
  reqEndDate: '종료일',
  needSsh: 'SSH',
  needHttp: 'HTTP',
  needPublic: '외부 공개',
  desiredSubdomain: '서브도메인',
  rootDomain: '루트 도메인',
  customDomain: '커스텀 도메인',
}

interface WizardState {
  groupId: number | null
  orgId: number | null
  templateId: number | null
  reqVcpu: number
  reqMemoryMb: number
  reqDiskGb: number
  specReason: string
  purpose: string
  courseOrProject: string
  extraNote: string
  reqStartDate: string
  reqEndDate: string
  needSsh: boolean
  needHttp: boolean
  needPublic: boolean
  desiredSubdomain: string
  rootDomain: string
  customDomain: string
}

const INITIAL_STATE: WizardState = {
  groupId: null,
  orgId: null,
  templateId: null,
  reqVcpu: 1,
  reqMemoryMb: 1024,
  reqDiskGb: 10,
  specReason: '',
  purpose: '',
  courseOrProject: '',
  extraNote: '',
  reqStartDate: '',
  reqEndDate: '',
  needSsh: true,
  needHttp: false,
  needPublic: false,
  desiredSubdomain: '',
  rootDomain: '',
  customDomain: '',
}

type FieldErrors = Partial<Record<string, string>>

/** 새로고침/뒤로가기에도 작성 중인 신청서를 유지하기 위한 세션 저장 키. */
const DRAFT_KEY = 'pickle.vm-request-draft'

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

/** 템플릿 기본값을 초과하는 사양인지 (초과 시 specReason 필수 — 서버와 동일 규칙). */
function exceedsTemplateDefaults(state: WizardState, template: VmTemplate | undefined): boolean {
  if (!template) return false
  return (
    state.reqVcpu > template.defaultVcpu ||
    state.reqMemoryMb > template.defaultMemoryMb ||
    state.reqDiskGb > template.defaultDiskGb
  )
}

export function NewRequestPage() {
  const groups = useQuery({ queryKey: ['groups'], queryFn: fetchGroups })
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs })
  const templates = useQuery({ queryKey: ['templates'], queryFn: fetchTemplates })
  const options = useQuery({ queryKey: ['request-options'], queryFn: fetchRequestOptions })

  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [state, setState] = useState<WizardState>(loadDraft)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState<VmRequestDetail | null>(null)

  const update = (patch: Partial<WizardState>) => setState((prev) => ({ ...prev, ...patch }))

  const isLoading =
    groups.isPending || orgs.isPending || templates.isPending || options.isPending
  const loadError = groups.error ?? orgs.error ?? templates.error ?? options.error
  const ready = !isLoading && !loadError

  const eligibleGroups = (groups.data ?? []).filter(
    (g) => g.myRole === 'OWNER' || g.myRole === 'MANAGER',
  )
  const selectedTemplate = templates.data?.find((t) => t.id === state.templateId)

  const validateStep = (index: number): FieldErrors => {
    const next: FieldErrors = {}
    if (index === 0) {
      if (state.groupId == null) next.groupId = '신청할 그룹을 선택해 주세요.'
      if (state.orgId == null) next.orgId = '자원을 제공할 기관을 선택해 주세요.'
    }
    if (index === 1) {
      if (state.templateId == null) {
        next.templateId = '템플릿을 선택해 주세요.'
      } else if (selectedTemplate) {
        if (state.reqVcpu < 1) next.reqVcpu = 'vCPU는 1 이상이어야 합니다.'
        if (state.reqMemoryMb < 256) next.reqMemoryMb = '메모리는 256 MiB 이상이어야 합니다.'
        if (state.reqDiskGb < selectedTemplate.minDiskGb)
          next.reqDiskGb = `디스크는 이 템플릿의 최소 크기(${selectedTemplate.minDiskGb} GiB) 이상이어야 합니다.`
        if (exceedsTemplateDefaults(state, selectedTemplate) && !state.specReason.trim())
          next.specReason = '기본 사양보다 높은 사양을 요청할 때는 사유를 입력해 주세요.'
      }
    }
    if (index === 2) {
      if (!state.purpose.trim()) next.purpose = '사용 목적을 입력해 주세요.'
      else if (state.purpose.length > 2000)
        next.purpose = '사용 목적은 2000자 이하로 입력해 주세요.'
      if (state.courseOrProject.length > 200)
        next.courseOrProject = '수업/프로젝트명은 200자 이하로 입력해 주세요.'
      if (state.reqStartDate && state.reqEndDate && state.reqEndDate < state.reqStartDate)
        next.reqEndDate = '종료일은 시작일 이후여야 합니다.'
    }
    if (index === 3 && state.needHttp) {
      if (!state.desiredSubdomain) {
        next.desiredSubdomain = 'HTTP 서비스를 게시하려면 서브도메인을 입력해 주세요.'
      } else if (!SUBDOMAIN_RE.test(state.desiredSubdomain)) {
        next.desiredSubdomain =
          '서브도메인은 소문자·숫자·하이픈만 사용해 3~40자로 입력해 주세요. (하이픈으로 시작·끝 불가)'
      } else if (options.data?.reservedSubdomains.includes(state.desiredSubdomain)) {
        next.desiredSubdomain = `'${state.desiredSubdomain}'은(는) 예약된 서브도메인이라 사용할 수 없습니다.`
      }
      if (!state.rootDomain) next.rootDomain = '루트 도메인을 선택해 주세요.'
      const customDomain = normalizeCustomDomain(state.customDomain)
      if (customDomain && !HOSTNAME_RE.test(customDomain))
        next.customDomain = '커스텀 도메인 형식이 올바르지 않습니다. (예: myapp.example.com)'
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

  const goToStep = (index: number, options?: { replace?: boolean }) => {
    setSearchParams({ step: String(index + 1) }, options)
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
    mutationFn: async (body: CreateVmRequest) => {
      const { data, error } = await api.POST('/vm-requests', { body })
      if (!data) throw toApiError(error, '신청을 제출하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return data
    },
    onSuccess: (data) => {
      sessionStorage.removeItem(DRAFT_KEY)
      void queryClient.invalidateQueries({ queryKey: ['vm-requests'] })
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

  const buildPayload = (): CreateVmRequest => ({
    groupId: state.groupId!,
    orgId: state.orgId!,
    templateId: state.templateId!,
    purpose: state.purpose.trim(),
    courseOrProject: state.courseOrProject.trim() || null,
    specReason: state.specReason.trim() || null,
    extraNote: state.extraNote.trim() || null,
    reqVcpu: state.reqVcpu,
    reqMemoryMb: state.reqMemoryMb,
    reqDiskGb: state.reqDiskGb,
    reqStartDate: state.reqStartDate || null,
    reqEndDate: state.reqEndDate || null,
    needSsh: state.needSsh,
    needHttp: state.needHttp,
    needPublic: state.needPublic,
    desiredSubdomain: state.needHttp ? state.desiredSubdomain : null,
    rootDomain: state.needHttp ? state.rootDomain : null,
    customDomain:
      state.needHttp && normalizeCustomDomain(state.customDomain)
        ? normalizeCustomDomain(state.customDomain)
        : null,
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
        <h1 className="text-2xl font-bold text-neutral-900">VM 신청</h1>
        <p className="mt-1 text-sm text-neutral-500">
          다섯 단계로 VM 사용 신청서를 작성합니다. 제출하면 관리자가 검토합니다.
        </p>
      </div>

      <Stepper steps={STEPS} current={step} />

      <Card>
        <CardContent className="space-y-5 py-6">
          {step === 0 && (
            <>
              {eligibleGroups.length === 0 && (
                <Alert variant="warning">
                  VM을 신청할 수 있는 그룹이 없습니다. 그룹의 소유자 또는 관리자만 신청할 수
                  있습니다.{' '}
                  <Link to="/console/groups" className="font-medium underline">
                    내 그룹에서 그룹을 만들어 주세요.
                  </Link>
                </Alert>
              )}
              <FormField
                label="신청 그룹"
                required
                error={errors.groupId}
                description="VM은 그룹 명의로 만들어집니다. 소유자·관리자인 그룹만 선택할 수 있습니다."
              >
                <Select
                  value={state.groupId ?? ''}
                  onChange={(event) =>
                    update({ groupId: event.target.value ? Number(event.target.value) : null })
                  }
                >
                  <option value="">그룹 선택</option>
                  {eligibleGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} ({group.slug})
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
            </>
          )}

          {step === 1 && (
            <>
              <fieldset>
                <legend className="text-sm font-medium text-neutral-700">
                  템플릿 <span aria-hidden="true" className="text-danger-600">*</span>
                </legend>
                {errors.templateId && (
                  <p role="alert" className="mt-1 text-sm text-danger-600">
                    {errors.templateId}
                  </p>
                )}
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {templates.data?.map((template) => {
                    const selected = template.id === state.templateId
                    return (
                      <button
                        key={template.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          update({
                            templateId: template.id,
                            reqVcpu: template.defaultVcpu,
                            reqMemoryMb: template.defaultMemoryMb,
                            reqDiskGb: template.defaultDiskGb,
                          })
                        }
                        className={cn(
                          'cursor-pointer rounded-card border p-4 text-left focus-visible:outline-2 focus-visible:outline-primary-600',
                          selected
                            ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                            : 'border-neutral-200 bg-white hover:border-neutral-300',
                        )}
                      >
                        <p className="font-medium text-neutral-900">{template.displayName}</p>
                        <p className="mt-1 text-sm text-neutral-500">
                          기본{' '}
                          {formatSpec(
                            template.defaultVcpu,
                            template.defaultMemoryMb,
                            template.defaultDiskGb,
                          )}
                        </p>
                        {template.notes && (
                          <p className="mt-1 text-xs text-neutral-500">{template.notes}</p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {selectedTemplate && (
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
                        min={selectedTemplate.minDiskGb}
                        value={state.reqDiskGb}
                        onChange={(event) => update({ reqDiskGb: Number(event.target.value) })}
                      />
                    </FormField>
                  </div>
                  {exceedsTemplateDefaults(state, selectedTemplate) && (
                    <FormField
                      label="사양 사유"
                      required
                      error={errors.specReason}
                      description="기본 사양보다 높은 사양을 요청하는 이유를 적어 주세요. 관리자 검토에 사용됩니다."
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

          {step === 2 && (
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

          {step === 3 && (
            <>
              <div className="space-y-3">
                <Checkbox
                  label="SSH 접속"
                  description="터미널로 VM에 접속합니다."
                  checked={state.needSsh}
                  onChange={(event) => update({ needSsh: event.target.checked })}
                />
                <Checkbox
                  label="HTTP 서비스 게시"
                  description="웹 서비스를 도메인으로 공개합니다."
                  checked={state.needHttp}
                  onChange={(event) => update({ needHttp: event.target.checked })}
                />
                <Checkbox
                  label="외부(캠퍼스 밖) 공개"
                  description="학교 밖에서도 접속할 수 있게 합니다."
                  checked={state.needPublic}
                  onChange={(event) => update({ needPublic: event.target.checked })}
                />
              </div>
              {state.needHttp && (
                <div className="space-y-4 rounded-lg bg-neutral-50 p-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      label="희망 서브도메인"
                      required
                      error={errors.desiredSubdomain}
                      description="소문자·숫자·하이픈, 3~40자"
                    >
                      <Input
                        value={state.desiredSubdomain}
                        onChange={(event) => update({ desiredSubdomain: event.target.value })}
                        placeholder="capstone-team3"
                        maxLength={40}
                      />
                    </FormField>
                    <FormField label="루트 도메인" required error={errors.rootDomain}>
                      <Select
                        value={state.rootDomain}
                        onChange={(event) => update({ rootDomain: event.target.value })}
                      >
                        <option value="">루트 도메인 선택</option>
                        {options.data?.allowedRootDomains.map((domain) => (
                          <option key={domain} value={domain}>
                            {domain}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </div>
                  <FormField
                    label="커스텀 도메인"
                    error={errors.customDomain}
                    description="직접 소유한 도메인이 있으면 적어 주세요. 연결은 이후 단계(M4)에서 지원되며 지금은 기록만 됩니다."
                  >
                    <Input
                      value={state.customDomain}
                      onChange={(event) => update({ customDomain: event.target.value })}
                      placeholder="myapp.example.com"
                    />
                  </FormField>
                </div>
              )}
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
                groupName={
                  eligibleGroups.find((g) => g.id === state.groupId)?.name ?? String(state.groupId)
                }
                orgName={orgs.data?.find((o) => o.id === state.orgId)?.name ?? String(state.orgId)}
                templateName={selectedTemplate?.displayName ?? String(state.templateId)}
              />
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
  groupName,
  orgName,
  templateName,
}: {
  state: WizardState
  groupName: string
  orgName: string
  templateName: string
}) {
  const rows: [string, string][] = [
    ['그룹', groupName],
    ['기관', orgName],
    ['템플릿', templateName],
    ['요청 사양', `${state.reqVcpu} vCPU · ${formatMemory(state.reqMemoryMb)} · ${state.reqDiskGb} GiB`],
    ['사양 사유', state.specReason.trim() || '—'],
    ['사용 목적', state.purpose.trim()],
    ['수업/프로젝트명', state.courseOrProject.trim() || '—'],
    ['기타 참고', state.extraNote.trim() || '—'],
    [
      '사용 기간',
      state.reqStartDate || state.reqEndDate
        ? `${state.reqStartDate || '미지정'} ~ ${state.reqEndDate || '미지정'}`
        : '미지정',
    ],
    [
      '네트워크',
      [state.needSsh && 'SSH', state.needHttp && 'HTTP', state.needPublic && '외부 공개']
        .filter(Boolean)
        .join(' · ') || '없음',
    ],
    [
      '도메인',
      state.needHttp && state.desiredSubdomain && state.rootDomain
        ? `${state.desiredSubdomain}.${state.rootDomain}`
        : '—',
    ],
    ['커스텀 도메인', (state.needHttp && state.customDomain.trim().toLowerCase()) || '—'],
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

function SubmitSuccess({ request }: { request: VmRequestDetail }) {
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
