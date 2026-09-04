import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { toApiError } from '../../api/problem'
import {
  fetchOrgs,
  fetchRequestPeriods,
  fetchWorkspaces,
  type CreateRequest,
  type RequestDetail,
} from '../../api/queries'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardRadioGroup,
  Checkbox,
  ErrorSummary,
  FormField,
  Input,
  MessageBar,
  PageHeader,
  Spinner,
  Stepper,
  Textarea,
} from '../ui'
import { fieldErrorsOf } from '../../lib/field-errors'
import { kstDateString, todayKstDate } from '../../lib/format'
import { clearDraft, loadDraft, saveDraft } from '../../lib/request-draft'
import { consolePaths } from '../../lib/paths'
import { useScope } from '../../lib/use-scope'
import { ReviewStep, type ReviewSection } from './ReviewStep'
import {
  COMMON_FIELDS,
  fieldLabels,
  parseStepId,
  routeServerErrors,
  slotsFor,
  STEP_TITLES,
  ALL_STEPS,
  type FieldSlot,
  type WizardStepId,
} from './wizard-steps'
import type { CommonWizardState, FieldErrors, RequestKindModule } from './types'

const INITIAL_COMMON: CommonWizardState = {
  workspaceId: null,
  orgId: null,
  purpose: '',
  extraNote: '',
  periodMode: 'preset',
  periodPresetId: null,
  indefinite: false,
  reqEndDate: '',
  displayName: '',
}

/** 직접 적는 종료일의 상한. 서버와 같은 값이다. */
const MAX_CUSTOM_PERIOD_YEARS = 2

export function RequestWizard({
  kind,
}: {
  kind: RequestKindModule
}) {
  const scope = useScope()
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: fetchWorkspaces })
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs })
  const periods = useQuery({ queryKey: ['request-periods'], queryFn: fetchRequestPeriods })

  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [draft] = useState(loadDraft)
  const [state, setState] = useState<CommonWizardState>(() => ({
    ...INITIAL_COMMON,
    ...draft.common,
    // 스코프에서 들어왔다면 그 워크스페이스를 채운다. 초안이 이미 답한 경우에는
    // 덮지 않는다. 스코프는 지금 무엇을 보고 있었는지일 뿐이고 초안은 사용자가
    // 실제로 고른 것이다.
    workspaceId: draft.common.workspaceId ?? scope,
  }))
  const kindApi = kind.useWizard(draft.kindType === kind.type ? draft.spec : null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({})
  const [returnedFrom, setReturnedFrom] = useState<WizardStepId | null>(null)
  const [submitted, setSubmitted] = useState<RequestDetail | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const steps = ALL_STEPS
  const fields: Record<string, FieldSlot> = { ...COMMON_FIELDS, ...kind.fields }
  const update = (patch: Partial<CommonWizardState>) =>
    setState((prev) => ({ ...prev, ...patch }))

  const isLoading =
    workspaces.isPending || orgs.isPending || periods.isPending || kindApi.isPending
  const loadError = workspaces.error ?? orgs.error ?? periods.error ?? kindApi.error
  const ready = !isLoading && !loadError

  const eligibleWorkspaces = workspaces.data ?? []
  const selectedWorkspace = eligibleWorkspaces.find((w) => w.id === state.workspaceId)
  const selectedOrg = orgs.data?.find((o) => o.id === state.orgId)
  const offeredPeriods = periods.data ?? []
  const selectedPeriod = offeredPeriods.find((p) => p.id === state.periodPresetId)

  const validateStep = (stepId: WizardStepId): FieldErrors => {
    const next: FieldErrors = {}
    if (stepId === 'resource') {
      if (!state.displayName.trim()) next.displayName = '이름을 입력해 주세요.'
      else if (state.displayName.length > 100)
        next.displayName = '이름은 100자 이하로 입력해 주세요.'
    }
    if (stepId === 'request') {
      // 목록에 없는 id(초안에 남은, 그새 없어진 행)는 고르지 않은 것으로 본다.
      if (state.workspaceId == null || !selectedWorkspace)
        next.workspaceId = '신청할 워크스페이스를 선택해 주세요.'
      if (state.orgId == null || !selectedOrg) next.orgId = '기관을 선택해 주세요.'
      if (!state.purpose.trim()) next.purpose = '사용 목적을 입력해 주세요.'
      else if (state.purpose.length > 2000)
        next.purpose = '사용 목적은 2000자 이하로 입력해 주세요.'
      if (state.periodMode === 'preset') {
        if (!selectedPeriod) next.periodPresetId = '사용 기간을 선택해 주세요.'
      } else if (state.indefinite) {
        // 무기한은 값이 없는 상태가 아니라 고른 값이다. 검사할 날짜가 없다.
      } else if (!state.reqEndDate) {
        next.reqEndDate = '사용 종료일을 정해 주세요.'
      } else {
        // 서버가 KST 달력 날짜로 판정한다. UTC로 재면 자정 근처에서 하루가 어긋난다.
        const today = todayKstDate()
        const limit = new Date()
        limit.setFullYear(limit.getFullYear() + MAX_CUSTOM_PERIOD_YEARS)
        if (state.reqEndDate < today) next.reqEndDate = '종료일은 오늘 이후여야 합니다.'
        else if (state.reqEndDate > kstDateString(limit))
          next.reqEndDate = `직접 적는 종료일은 ${MAX_CUSTOM_PERIOD_YEARS}년 이내여야 합니다.`
      }
    }
    return { ...next, ...kindApi.validateStep(stepId) }
  }

  /** 현재 입력으로 도달할 수 있는 마지막 단계. */
  const firstBlockedStep = (): WizardStepId => {
    for (const step of steps.slice(0, -1)) {
      if (Object.keys(validateStep(step)).length > 0) return step
    }
    return steps[steps.length - 1]
  }

  const requestedStep = parseStepId(searchParams.get('step'), steps)
  const blocked = ready ? firstBlockedStep() : requestedStep
  const step = ready && steps.indexOf(requestedStep) > steps.indexOf(blocked) ? blocked : requestedStep

  /** `?kind=`처럼 이미 실린 검색값을 지우지 않는다. */
  const goToStep = useCallback(
    (next: WizardStepId, opts?: { replace?: boolean }) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          params.set('step', next)
          return params
        },
        opts,
      )
    },
    [setSearchParams],
  )

  useEffect(() => {
    if (!ready || submitted) return
    if (requestedStep !== step) goToStep(step, { replace: true })
  }, [ready, submitted, requestedStep, step, goToStep])

  // 단계가 바뀌면 맨 위로 올리고 제목에 포커스를 준다. App의 ScrollToTop은 pathname만
  // 보므로 검색값만 바뀌는 이 이동에는 반응하지 않는다.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    window.scrollTo?.({ top: 0 })
    headingRef.current?.focus()
  }, [step])

  // 되돌려받은 오류는 첫 잘못된 칸으로 포커스를 옮긴다.
  useEffect(() => {
    if (Object.keys(serverFieldErrors).length === 0) return
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [serverFieldErrors, step])

  useEffect(() => {
    if (submitted) return
    saveDraft(kind.type, state, kindApi.spec)
  }, [kind.type, kindApi.spec, state, submitted])

  // 입력이 바뀌면 서버 오류를 지운다. 호스트 이름을 다시 치는 순간 문구가 사라진다.
  useEffect(() => {
    setServerFieldErrors((prev) => (Object.keys(prev).length === 0 ? prev : {}))
    setSubmitError(null)
    setReturnedFrom(null)
  }, [state, kindApi.spec])

  const submit = useMutation({
    mutationFn: async (body: CreateRequest) => {
      const { data, error } = await api.POST('/requests', { body })
      if (!data) throw toApiError(error, '신청을 제출하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return data
    },
    onSuccess: (data) => {
      clearDraft()
      void queryClient.invalidateQueries({ queryKey: ['requests'] })
      // `step`만 뺀다. 통째로 비우면 `kind`가 함께 날아가고, 종류를 잃은 주소는
      // 위저드가 아니라 종류 고르기 화면이라 성공 화면이 마운트되지도 못한다.
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('step')
          return next
        },
        { replace: true },
      )
      setSubmitted(data)
    },
    onError: (err) => {
      const apiError = toApiError(err, '신청을 제출하지 못했습니다.')
      const mapped = fieldErrorsOf(apiError.problem)
      setServerFieldErrors(mapped)
      setSubmitError(apiError.message)
      const owner = routeServerErrors(mapped, fields, steps)
      if (owner && owner !== 'review') {
        setReturnedFrom(owner)
        goToStep(owner)
      }
    },
  })

  if (submitted) return <SubmitSuccess request={submitted} />

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="신청 정보 불러오는 중" />
      </div>
    )
  }
  if (loadError) return <Alert variant="danger">{loadError.message}</Alert>

  const goNext = () => {
    const stepErrors = validateStep(step)
    setErrors(stepErrors)
    if (Object.keys(stepErrors).length > 0) return
    goToStep(steps[Math.min(steps.indexOf(step) + 1, steps.length - 1)])
  }

  const goPrev = () => {
    setErrors({})
    goToStep(steps[Math.max(steps.indexOf(step) - 1, 0)])
  }

  const buildPayload = (): CreateRequest => ({
    workspaceId: state.workspaceId!,
    orgId: state.orgId!,
    purpose: state.purpose.trim(),
    extraNote: state.extraNote.trim() || null,
    periodPresetId: state.periodMode === 'preset' ? state.periodPresetId : null,
    reqEndDate:
      state.periodMode === 'custom' && !state.indefinite ? state.reqEndDate : null,
    reqIndefinite: state.periodMode === 'custom' && state.indefinite ? true : null,
    displayName: state.displayName.trim(),
    ...kindApi.payload(),
  })

  const onSubmit = () => {
    for (const candidate of steps.slice(0, -1)) {
      const stepErrors = validateStep(candidate)
      if (Object.keys(stepErrors).length > 0) {
        goToStep(candidate)
        setErrors(stepErrors)
        return
      }
    }
    setSubmitError(null)
    setServerFieldErrors({})
    submit.mutate(buildPayload())
  }

  const shown: FieldErrors = { ...errors, ...serverFieldErrors }
  const periodLabel = state.periodMode === 'preset'
    ? selectedPeriod
      ? `${selectedPeriod.displayName} (${selectedPeriod.endDate}까지)`
      : '미선택'
    : state.indefinite
      ? '무기한'
      : state.reqEndDate || '미지정'

  const reviewRows = kindApi.reviewRows()
  const commonRows: Partial<Record<WizardStepId, [string, string][]>> = {
    resource: [['이름', state.displayName.trim()]],
    request: [
      ['기관', selectedOrg?.name ?? '—'],
      ['워크스페이스', selectedWorkspace?.name ?? '—'],
      ['사용 목적', state.purpose.trim()],
      ['사용 기간', periodLabel],
      ['참고 사항', state.extraNote.trim() || '—'],
    ],
  }
  const sections: ReviewSection[] = steps
    .filter((candidate) => candidate !== 'review')
    .map((candidate) => ({
      step: candidate,
      rows: [...(commonRows[candidate] ?? []), ...(reviewRows[candidate] ?? [])],
    }))
    .filter((section) => section.rows.length > 0)

  const isLast = step === steps[steps.length - 1]

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="리소스 신청"
        description="필요한 것을 고르고 왜 언제까지 쓸지 적으면 관리자가 검토합니다."
      />

      <Stepper steps={steps.map((id) => STEP_TITLES[id])} current={steps.indexOf(step)} />

      <div className="flex items-center gap-3 text-sm text-foreground-secondary">
        <span className="text-foreground-muted">종류</span>
        <span className="font-medium text-foreground-primary">{kind.picker.title}</span>
        <Link to={consolePaths.newRequest(scope)} className="font-medium text-primary-700 underline">
          변경
        </Link>
      </div>

      <Card>
        <CardContent className="py-6">
          <form
            ref={formRef}
            noValidate
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault()
              if (isLast) onSubmit()
              else goNext()
            }}
          >
            <h2 ref={headingRef} tabIndex={-1} className="sr-only">
              {STEP_TITLES[step]}
            </h2>

            {returnedFrom && (
              <MessageBar variant="warning">
                제출한 내용에 문제가 있어 되돌아왔습니다. 아래 항목을 고친 뒤 다시 제출해 주세요.
              </MessageBar>
            )}
            <ErrorSummary
              error={submitError}
              fieldErrors={serverFieldErrors}
              slots={slotsFor(step, fields)}
              fieldLabels={fieldLabels(fields)}
            />

            {step === 'resource' && (
              <>
                <FormField
                  label="이름"
                  required
                  error={shown.displayName}
                  description="나중에 바꿀 수 있습니다."
                >
                  <Input
                    value={state.displayName}
                    onChange={(event) => update({ displayName: event.target.value })}
                    maxLength={100}
                    placeholder="예: 캡스톤 백엔드 서버"
                  />
                </FormField>
                {kindApi.resourceFields(shown)}
              </>
            )}

            {step === 'request' && (
              <>
                {orgs.data?.length === 0 ? (
                  <Alert variant="warning">
                    신청할 수 있는 기관이 없습니다. 관리자에게 문의해 주세요.
                  </Alert>
                ) : (
                  <CardRadioGroup
                    legend="기관"
                    required
                    error={shown.orgId}
                    description="이 기관이 자원을 제공하고 신청을 검토합니다."
                    value={state.orgId}
                    onChange={(value) => update({ orgId: value })}
                    options={(orgs.data ?? []).map((org) => ({
                      value: org.id,
                      title: org.name,
                    }))}
                  />
                )}
                {eligibleWorkspaces.length === 0 && (
                  <Alert variant="warning">
                    {kind.copy.noWorkspaceNotice}{' '}
                    <Link to="/console/workspaces" className="font-medium underline">
                      내 워크스페이스에서 만들어 주세요.
                    </Link>
                  </Alert>
                )}
                <CardRadioGroup
                  legend="워크스페이스"
                  required
                  error={shown.workspaceId}
                  value={state.workspaceId}
                  onChange={(value) => update({ workspaceId: value })}
                  options={eligibleWorkspaces.map((workspace) => ({
                    value: workspace.id,
                    title: workspace.name,
                  }))}
                />

                <FormField label="사용 목적" required error={shown.purpose}>
                  <Textarea
                    value={state.purpose}
                    onChange={(event) => update({ purpose: event.target.value })}
                    maxLength={2000}
                    placeholder="예: 캡스톤 프로젝트 백엔드 서버 운영"
                  />
                </FormField>

                <CardRadioGroup
                  legend="사용 기간"
                  required
                  error={shown.periodPresetId}
                  value={state.periodMode === 'custom' ? 'custom' : state.periodPresetId}
                  onChange={(value) =>
                    value === 'custom'
                      ? update({ periodMode: 'custom', periodPresetId: null })
                      : update({
                          periodMode: 'preset',
                          periodPresetId: value,
                          reqEndDate: '',
                          indefinite: false,
                        })
                  }
                  columns={3}
                  options={[
                    ...offeredPeriods.map((period) => ({
                      value: period.id,
                      title: period.displayName,
                      meta: `${period.endDate}까지`,
                    })),
                    { value: 'custom', title: '직접 입력', description: '날짜를 정해 적거나 무기한을 고릅니다.' },
                  ]}
                />
                {state.periodMode === 'custom' && (
                  <div className="space-y-3">
                    <FormField
                      label="사용 종료일"
                      required={!state.indefinite}
                      error={shown.reqEndDate}
                    >
                      <Input
                        type="date"
                        min={todayKstDate()}
                        value={state.reqEndDate}
                        disabled={state.indefinite}
                        onChange={(event) => update({ reqEndDate: event.target.value })}
                      />
                    </FormField>
                    <Checkbox
                      label="무기한 (사전 승인 필요)"
                      description="끝나지 않아야 하는 서비스만 해당합니다. 관리자와 먼저 이야기한 뒤 신청해 주세요."
                      checked={state.indefinite}
                      onChange={(event) =>
                        // 종료일을 남겨 두면 화면에 없는 날짜가 함께 제출된다.
                        update({ indefinite: event.target.checked, reqEndDate: '' })
                      }
                    />
                  </div>
                )}

                <FormField label="참고 사항" error={shown.extraNote}>
                  <Textarea
                    value={state.extraNote}
                    onChange={(event) => update({ extraNote: event.target.value })}
                    maxLength={2000}
                    placeholder="관리자에게 전달할 내용이 있으면 적어 주세요."
                  />
                </FormField>
              </>
            )}

            {step === 'review' && (
              <ReviewStep sections={sections} onEdit={goToStep} notice={kindApi.notice} />
            )}

            <div className="flex items-center justify-between border-t border-stroke-subtle pt-4">
              {/* 첫 단계에는 돌아갈 앞이 없다. 종류를 바꾸는 길은 위의 「변경」이다. */}
              {steps.indexOf(step) > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={goPrev}
                  disabled={submit.isPending}
                >
                  이전
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" loading={submit.isPending}>
                {isLast ? '신청 제출' : '다음'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
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
      <h1 className="mt-4 text-2xl font-bold text-foreground-primary">신청이 접수되었습니다</h1>
      <p className="mt-2 text-sm text-foreground-secondary">
        <span className="font-medium text-foreground-primary">{request.displayName}</span> 신청을
        관리자가 검토한 뒤 결과를 확인할 수 있습니다.
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
