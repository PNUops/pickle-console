import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { toApiError } from '../api/problem'
import {
  fetchWorkspaces,
  fetchOrgs,
  type CreateRequest,
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
import {
  KIND_PICKER_FOOTNOTE,
  REQUEST_KINDS,
  requestKind,
} from '../components/request-kind'
import type {
  CommonWizardState,
  FieldErrors,
  RequestKindModule,
  WizardStepId,
} from '../components/request-kind/types'
import { cn } from '../lib/cn'
import { fieldErrorsOf } from '../lib/field-errors'
import { VM_REQUEST_DRAFT_KEY } from '../lib/storage-keys'
import { isUuid } from '../lib/validation'

/**
 * 단계의 정체 — 검증·렌더링은 위치(index)가 아니라 이 id로 갈린다.
 * 종류마다 다른 것은 'spec' 단계의 내용(과 제목)뿐이고, 단계 수는 같다.
 */
const STEP_IDS: WizardStepId[] = ['kind', 'target', 'spec', 'purpose', 'confirm']

/**
 * 422 errors[] 필드명 → 한국어 라벨 (요약 알림 표시용) — 종류 필드는 모듈이 보탠다.
 * 여기 있는 것은 신청 본문 최상위 필드뿐이다: 종류별 스펙은 본문의 하위 객체라
 * 서버가 'vm.imageId'처럼 중첩 경로로 보내고, 그 라벨은 종류 모듈이 든다.
 */
const COMMON_FIELD_LABELS: Record<string, string> = {
  type: '리소스 종류',
  workspaceId: '워크스페이스',
  orgId: '기관',
  purpose: '용도',
  courseOrProject: '수업/프로젝트',
  extraNote: '기타 참고',
  reqStartDate: '시작일',
  reqEndDate: '종료일',
  displayName: '표시명',
}

const INITIAL_COMMON: CommonWizardState = {
  workspaceId: null,
  orgId: null,
  purpose: '',
  courseOrProject: '',
  extraNote: '',
  reqStartDate: '',
  reqEndDate: '',
  displayName: '',
}

/** 새로고침/뒤로가기에도 작성 중인 신청서를 유지하기 위한 세션 저장 키. */
const DRAFT_KEY = VM_REQUEST_DRAFT_KEY

/** 초안 공통부에서 식별자를 담는 필드 — 값이 있다면 UUID 문자열이어야 한다. */
const DRAFT_ID_FIELDS = ['workspaceId', 'orgId'] as const

/**
 * 저장된 초안의 공통부가 지금의 CommonWizardState와 같은 모양인지.
 *
 * 식별자가 숫자에서 UUID로 바뀌었으므로, 그 전에 저장된 초안은 신청 본문에
 * 숫자 id를 실어 보낸다 — 타입은 통과하고 서버에서야 틀어지는 종류의 값이다.
 * 필드 하나라도 모양이 다르면 초안 전체를 버린다: 일부만 살리면 사용자가
 * 고르지 않은 값이 남아 더 헷갈린다. 종류별 스펙부의 판정은 그 종류 모듈이 한다.
 */
function isCompatibleCommonDraft(value: unknown): value is Partial<CommonWizardState> {
  if (typeof value !== 'object' || value == null) return false
  const draft = value as Record<string, unknown>
  for (const field of DRAFT_ID_FIELDS) {
    const id = draft[field]
    if (id === undefined || id === null) continue
    if (!isUuid(typeof id === 'string' ? id : null)) return false
  }
  return true
}

interface LoadedDraft {
  kindType: string
  common: CommonWizardState
  spec: unknown
}

function freshDraft(): LoadedDraft {
  return { kindType: REQUEST_KINDS[0].type, common: INITIAL_COMMON, spec: null }
}

function discardDraft(): LoadedDraft {
  // 남겨 두면 매 진입마다 같은 판정을 반복한다.
  sessionStorage.removeItem(DRAFT_KEY)
  return freshDraft()
}

function loadDraft(): LoadedDraft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return freshDraft()
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed == null) return discardDraft()
    const draft = parsed as { kind?: unknown; common?: unknown; spec?: unknown }
    // 모르는 종류(스펙부가 종류별 하위 객체로 갈라지기 전의 평평한 초안 포함)는 버린다.
    const kind = typeof draft.kind === 'string' ? requestKind(draft.kind) : undefined
    if (!kind) return discardDraft()
    if (!isCompatibleCommonDraft(draft.common)) return discardDraft()
    if (!kind.isCompatibleSpecDraft(draft.spec)) return discardDraft()
    return {
      kindType: kind.type,
      common: { ...INITIAL_COMMON, ...draft.common },
      spec: draft.spec ?? null,
    }
  } catch {
    return freshDraft()
  }
}

/** `?step=n`(1부터) → 내부 단계 인덱스(0부터). 잘못된 값은 첫 단계로. */
function parseStepParam(value: string | null): number {
  const n = Number(value ?? '1')
  return Number.isInteger(n) && n >= 1 && n <= STEP_IDS.length ? n - 1 : 0
}

export function NewRequestPage() {
  // 초안이 정하는 초기 종류 — 이후 선택은 사용자 몫이다. 단 `?kind=`로 들어왔다면
  // 방금 그 종류의 목록에서 신청을 누른 것이므로 남은 초안보다 그 뜻이 앞선다.
  const [searchParams] = useSearchParams()
  const [initialDraft] = useState(loadDraft)
  const [kindType, setKindType] = useState(
    () => requestKind(searchParams.get('kind') ?? '')?.type ?? initialDraft.kindType,
  )
  const kind = requestKind(kindType) ?? REQUEST_KINDS[0]

  // 종류가 바뀌면 위저드를 통째로 다시 마운트한다 — 스펙 상태·카탈로그 훅이
  // 종류의 것이라, key 리마운트가 훅 순서와 상태 초기화를 함께 보장한다.
  return <KindWizard key={kind.type} kind={kind} onSelectKind={setKindType} />
}

function KindWizard({
  kind,
  onSelectKind,
}: {
  kind: RequestKindModule
  onSelectKind: (type: string) => void
}) {
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: fetchWorkspaces })
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs })

  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  // 마운트 시점의 초안 — 종류를 전환해도 공통 입력은 이어받고, 스펙은 같은 종류일 때만.
  const [draft] = useState(loadDraft)
  const [state, setState] = useState<CommonWizardState>(draft.common)
  const kindApi = kind.useWizard(draft.kindType === kind.type ? draft.spec : null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState<RequestDetail | null>(null)

  const update = (patch: Partial<CommonWizardState>) =>
    setState((prev) => ({ ...prev, ...patch }))

  const steps = ['종류', '워크스페이스·기관·이름', kind.specStepTitle, '용도·기간', '확인·제출']
  const fieldLabels = { ...COMMON_FIELD_LABELS, ...kind.fieldLabels }

  const isLoading = workspaces.isPending || orgs.isPending || kindApi.isPending
  const loadError = workspaces.error ?? orgs.error ?? kindApi.error
  const ready = !isLoading && !loadError

  // 신청은 구성원이면 누구나 할 수 있다 — 문턱은 승인이 잡는다.
  const eligibleWorkspaces = workspaces.data ?? []
  const selectedWorkspace = eligibleWorkspaces.find((g) => g.id === state.workspaceId)
  const selectedOrg = orgs.data?.find((o) => o.id === state.orgId)

  const validateStep = (stepId: WizardStepId): FieldErrors => {
    const next: FieldErrors = {}
    if (stepId === 'target') {
      // 목록에 없는 id(초안에 남은, 그새 나온 워크스페이스나 없어진 기관)는 선택되지
      // 않은 것으로 본다 — Select는 이미 비어 보이는데 상태에는 남아 있어, 그대로
      // 두면 요약이 원시 id를 보여주고 제출이 403·422로 튕긴다.
      if (state.workspaceId == null || !selectedWorkspace)
        next.workspaceId = '신청할 워크스페이스를 선택해 주세요.'
      if (state.orgId == null || !selectedOrg)
        next.orgId = '리소스를 제공할 기관을 선택해 주세요.'
      if (!state.displayName.trim()) next.displayName = '리소스 이름을 입력해 주세요.'
      else if (state.displayName.length > 100)
        next.displayName = '리소스 이름은 100자 이하로 입력해 주세요.'
    }
    if (stepId === 'purpose') {
      if (!state.purpose.trim()) next.purpose = '사용 목적을 입력해 주세요.'
      else if (state.purpose.length > 2000)
        next.purpose = '사용 목적은 2000자 이하로 입력해 주세요.'
      if (state.courseOrProject.length > 200)
        next.courseOrProject = '수업/프로젝트명은 200자 이하로 입력해 주세요.'
      if (state.reqStartDate && state.reqEndDate && state.reqEndDate < state.reqStartDate)
        next.reqEndDate = '종료일은 시작일 이후여야 합니다.'
    }
    // 종류가 그 단계에 얹은 자기 필드의 검증 (예: VM의 슬러그·OS·사양).
    return { ...next, ...kindApi.validateStep(stepId) }
  }

  /** 현재 입력값으로 도달할 수 있는 최대 단계 (자기 검증이 실패하는 첫 단계). */
  const firstBlockedStep = (): number => {
    for (let i = 0; i < STEP_IDS.length - 1; i++) {
      if (Object.keys(validateStep(STEP_IDS[i])).length > 0) return i
    }
    return STEP_IDS.length - 1
  }

  const requestedStep = parseStepParam(searchParams.get('step'))
  const step = ready ? Math.min(requestedStep, firstBlockedStep()) : requestedStep
  const stepId = STEP_IDS[step]

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
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ kind: kind.type, common: state, spec: kindApi.spec }),
    )
  }, [kind.type, kindApi.spec, state, submitted])

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
    const stepErrors = validateStep(stepId)
    setErrors(stepErrors)
    if (Object.keys(stepErrors).length > 0) return
    goToStep(Math.min(step + 1, STEP_IDS.length - 1))
  }

  const goPrev = () => {
    setErrors({})
    goToStep(Math.max(step - 1, 0))
  }

  const buildPayload = (): CreateRequest => ({
    workspaceId: state.workspaceId!,
    orgId: state.orgId!,
    purpose: state.purpose.trim(),
    courseOrProject: state.courseOrProject.trim() || null,
    extraNote: state.extraNote.trim() || null,
    reqStartDate: state.reqStartDate || null,
    reqEndDate: state.reqEndDate || null,
    displayName: state.displayName.trim(),
    // 종류 판별자(type)와 종류별 스펙 멤버는 종류 모듈이 채운다.
    ...kindApi.payload(),
  })

  const onSubmit = () => {
    // 제출 전 전체 단계를 다시 검증한다 (뒤로 갔다가 값을 바꾼 경우 대비).
    for (let i = 0; i < STEP_IDS.length - 1; i++) {
      const stepErrors = validateStep(STEP_IDS[i])
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

      <Stepper steps={steps} current={step} />

      <Card>
        <CardContent className="space-y-5 py-6">
          {stepId === 'kind' && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600">무엇을 신청할지 고르세요.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {REQUEST_KINDS.map((entry) => {
                  const selected = entry.type === kind.type
                  return (
                    <button
                      key={entry.type}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSelectKind(entry.type)}
                      className={cn(
                        'cursor-pointer rounded-xl border-2 p-4 text-left',
                        selected
                          ? 'border-primary-500 bg-primary-50/40'
                          : 'border-neutral-200 bg-white hover:border-neutral-300',
                      )}
                    >
                      <span className="block font-medium text-neutral-900">
                        {entry.picker.title}
                      </span>
                      <span className="mt-1 block text-sm text-neutral-500">
                        {entry.picker.description}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-neutral-400">{KIND_PICKER_FOOTNOTE}</p>
            </div>
          )}

          {stepId === 'target' && (
            <>
              {eligibleWorkspaces.length === 0 && (
                <Alert variant="warning">
                  {kind.copy.noWorkspaceNotice}{' '}
                  <Link to="/console/workspaces" className="font-medium underline">
                    내 워크스페이스에서 워크스페이스를 만들어 주세요.
                  </Link>
                </Alert>
              )}
              <FormField
                label="신청 워크스페이스"
                required
                error={errors.workspaceId}
                description={kind.copy.workspaceDescription}
              >
                <Select
                  value={state.workspaceId ?? ''}
                  onChange={(event) =>
                    update({ workspaceId: event.target.value || null })
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
                    update({ orgId: event.target.value || null })
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
                <h2 className="text-sm font-semibold text-neutral-800">리소스 이름</h2>
                <FormField
                  label="표시명"
                  required
                  error={errors.displayName}
                  description="신청 목록과 콘솔 목록에서 이 리소스를 가리키는 이름입니다. 만들어진 뒤에도 설정에서 바꿀 수 있습니다."
                >
                  <Input
                    value={state.displayName}
                    onChange={(event) => update({ displayName: event.target.value })}
                    maxLength={100}
                    placeholder="예: 캡스톤 백엔드 서버"
                  />
                </FormField>
                {kindApi.targetFields?.(errors)}
              </div>
            </>
          )}

          {stepId === 'spec' && kindApi.specStep(errors)}

          {stepId === 'purpose' && (
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

          {stepId === 'confirm' && (
            <>
              {submitError && (
                <Alert variant="danger" title={submitError}>
                  {Object.keys(serverFieldErrors).length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-4">
                      {Object.entries(serverFieldErrors).map(([field, message]) => (
                        <li key={field}>
                          {fieldLabels[field] ?? field}: {message}
                        </li>
                      ))}
                    </ul>
                  )}
                </Alert>
              )}
              {/* 고른 항목이 목록에서 사라진 드문 경우 이름 자리는 '—'로 둔다 —
                  식별자를 그대로 보여 봐야 UUID라 알려주는 것이 없다. */}
              <SummaryTable
                rows={kindApi.summaryRows(state, {
                  workspaceName: selectedWorkspace?.name ?? '—',
                  orgName: selectedOrg?.name ?? '—',
                })}
              />
              {kindApi.confirmNotice}
            </>
          )}

          <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
            <Button variant="secondary" onClick={goPrev} disabled={step === 0 || submit.isPending}>
              이전
            </Button>
            {step < STEP_IDS.length - 1 ? (
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

function SummaryTable({ rows }: { rows: [string, string][] }) {
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
      {/* 신청을 가리키는 것은 이름이다 — 식별자는 UUID라 읽는 사람에게 알려주는 것이 없다. */}
      <p className="mt-2 text-sm text-neutral-600">
        <span className="font-medium text-neutral-900">{request.displayName}</span> — 관리자
        검토 후 결과를 확인할 수 있습니다.
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
