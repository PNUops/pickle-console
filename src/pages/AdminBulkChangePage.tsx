import { requestReaderKey } from '../api/request-review'
import { useActiveResult } from '../lib/use-active-result'
import { BulkChangePreviewTable, BulkChangeResultTable } from '../components/bulk/BulkChangeTables'
import { useAccessIncreaseReview } from '../lib/use-access-increase-review'
import type { AccessConfirmation } from '../api/resource-access'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router'
import { fetchAdminBulkOperation, fetchAdminBulkPreview, type AdminBulkOperation } from '../api/bulk-results'
import { BulkChangeReentry, RecentBulkChanges } from '../components/bulk/BulkChangeReentry'
import { BulkChangeReceipt } from '../components/bulk/BulkChangeReceipt'
import {
  applyAdminBulkChange,
  previewAdminBulkChange,
  type AdminBulkChangeApply,
  type AdminBulkChangeKind,
  type AdminBulkChangePreview,
  type AdminBulkChangeRequest,
  type AdminBulkChangeSpec,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import {
  AccessForm,
  DateForm,
  DeletionForm,
  DomainRenewalForm,
  LimitsForm,
  PeriodForm,
  PowerForm,
  StatusForm,
} from '../components/bulk/BulkChangeForms'
import type { BulkRouteState } from '../components/bulk/BulkSelection'
import { fieldLabels, routeServerErrors, slotsFor } from '../components/request-kind/wizard-steps'
import {
  Button,
  CardRadioGroup,
  ErrorSummary,
  FormField,
  Input,
  MessageBar,
  PageHeader,
  Stepper,
} from '../components/ui'
import {
  BULK_FIELDS,
  BULK_STEPS,
  BULK_STEP_TITLES,
  BULK_TARGET_TYPES,
  bulkKindsFor,
  buildChange,
  emptyDraft,
  formFieldErrors,
  kindTakesValues,
  type BulkDraft,
  type BulkFamily,
  type BulkStep,
} from '../lib/bulk-change'
import { BULK_SELECTION_CAP, clearStoredSelection, type BulkTarget } from '../lib/bulk-selection'
import { fieldErrorsOf } from '../lib/field-errors'
import { PAID_KEY_EXPIRY_NOTE, labelForBulkResult } from '../lib/labels'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'
import { formatDateTime } from '../lib/format'

const FAMILY_COPY: Record<BulkFamily, { title: string; back: string; pick: string }> = {
  'llm-keys': {
    title: 'LLM API 키 일괄 변경',
    back: 'LLM API 키',
    pick: '목록에서 바꿀 키를 선택해 주세요.',
  },
  vms: { title: 'VM 일괄 변경', back: 'VM 관리', pick: '목록에서 바꿀 VM을 선택해 주세요.' },
  domains: {
    title: '도메인 일괄 변경',
    back: '공개 서비스',
    pick: '목록에서 바꿀 도메인을 선택해 주세요.',
  },
}

function listPathOf(family: BulkFamily, orgId: string | undefined): string {
  switch (family) {
    case 'llm-keys':
      return adminPaths.llmKeys(orgId)
    case 'vms':
      return adminPaths.vms(orgId)
    case 'domains':
      return adminPaths.domains(orgId)
  }
}

/** Query keys a family's apply leaves stale. */
const FAMILY_QUERY_KEYS: Record<BulkFamily, string[][]> = {
  'llm-keys': [['admin', 'llm-keys']],
  vms: [['admin', 'vms']],
  // A release also takes the name's route down and revokes its certificates.
  domains: [
    ['admin', 'domains'],
    ['admin', 'routes'],
    ['admin', 'certificates'],
  ],
}

const RESULT_ORDER = ['APPLIED', 'UNCHANGED', 'SKIPPED', 'STALE'] as const

/** Router state from the list, or null when it is missing or malformed. */
function targetsOf(state: unknown): BulkTarget[] | null {
  const targets = (state as BulkRouteState | null)?.targets
  if (!Array.isArray(targets) || targets.length === 0 || targets.length > BULK_SELECTION_CAP) {
    return null
  }
  const valid = targets.every(
    (target) => typeof target?.id === 'string' && typeof target?.name === 'string',
  )
  return valid ? targets : null
}

export function AdminBulkChangePage({ family }: { family: BulkFamily }) {
  const location = useLocation()
  const { user } = useAuth()
  const scope = useAdminScope()
  return <AdminBulkPageContext key={`${family}:${scope.activeOrgId ?? 'all'}:${scope.activeOrgRole ?? 'none'}:${targetsOf(location.state)?.map((target) => target.id).join(',') ?? 'stored'}:${requestReaderKey(user)}`} family={family} />
}

type SavedIds = { previewId?: string; operationId?: string }

function AdminBulkPageContext({ family }: { family: BulkFamily }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const scope = useAdminScope()
  const role = scope.tier === 'org' ? scope.activeOrgRole : user?.role
  const copy = FAMILY_COPY[family]
  const listPath = listPathOf(family, scope.activeOrgId)
  const params = new URLSearchParams(location.search)
  const savedIds: SavedIds = { previewId: params.get('previewId')?.toLowerCase() ?? undefined, operationId: params.get('operationId')?.toLowerCase() ?? undefined }
  const [targets, setTargets] = useState(() => savedIds.previewId || savedIds.operationId ? null : targetsOf(location.state))
  const [remembered, setRemembered] = useState<SavedIds>({})
  const [transitioningFrom, setTransitioningFrom] = useState<SavedIds[]>([])
  const [initialPreview, setInitialPreview] = useState<AdminBulkChangePreview | undefined>()
  const matches = (ids: SavedIds) => ids.previewId === savedIds.previewId && ids.operationId === savedIds.operationId
  const owned = matches(remembered) || transitioningFrom.some(matches)
  const kinds = user ? bulkKindsFor(family, role ?? 'USER', user.role) : []
  const reader = requestReaderKey(user)
  const remember = (ids: SavedIds) => {
    setTransitioningFrom((previous) => [...previous, savedIds, remembered])
    setRemembered(ids)
    const path = ids.operationId
      ? adminPaths.bulkOperation(family, ids.operationId, scope.activeOrgId, ids.previewId)
      : adminPaths.bulkPreview(family, ids.previewId!, scope.activeOrgId)
    navigate(path, { replace: true, state: location.state })
  }
  useEffect(() => {
    if (transitioningFrom.length > 0 && remembered.previewId === savedIds.previewId && remembered.operationId === savedIds.operationId) setTransitioningFrom([])
  }, [transitioningFrom, remembered.previewId, remembered.operationId, savedIds.previewId, savedIds.operationId])

  const header = (
    <>
      <Link to={listPath} className="text-sm text-brand-foreground hover:underline">
        ← {copy.back}
      </Link>
      <PageHeader title={copy.title} />
    </>
  )

  if ((savedIds.previewId && !isUuid(savedIds.previewId)) || (savedIds.operationId && !isUuid(savedIds.operationId))) {
    return <div className="space-y-5">{header}<MessageBar variant="danger">{INVALID_ID_MESSAGE}</MessageBar></div>
  }
  if (!user || kinds.length === 0) {
    return <div className="space-y-5">{header}<MessageBar variant="danger">이 계정으로 할 수 있는 일괄 변경이 없습니다.</MessageBar></div>
  }
  if (!owned && (savedIds.previewId || savedIds.operationId)) {
    return <div className="space-y-5">{header}<BulkChangeReentry key={`${savedIds.previewId ?? ''}:${savedIds.operationId ?? ''}`} family={family} {...savedIds} reader={reader} orgId={scope.activeOrgId}
      canContinue={(preview) => !!preview.change && kinds.some((option) => option.kind === preview.change!.kind)}
      onContinue={(preview) => {
        setTargets(preview.items.map((item) => ({ id: item.targetId, name: item.name ?? item.targetId })))
        setInitialPreview(preview)
        setRemembered({ previewId: preview.previewId })
      }} /></div>
  }
  if (!targets) {
    return (
      <div className="space-y-5">
        {header}
        <MessageBar
          actions={
            <Link to={listPath} className="font-semibold underline underline-offset-2">
              {copy.back} 목록으로
            </Link>
          }
        >
          {copy.pick}
        </MessageBar>
        <RecentBulkChanges family={family} reader={reader} orgId={scope.activeOrgId} />
      </div>
    )
  }
  return (
    <div className="space-y-5">
      {header}
      <BulkChangeFlow
        key={`${family}:${scope.activeOrgId ?? 'all'}:${scope.activeOrgRole ?? 'none'}:${targets.map((target) => target.id).join(',')}:${requestReaderKey(user)}`}
        family={family}
        role={user.role}
        targets={targets}
        kinds={kinds}
        listPath={listPath}
        initialPreview={initialPreview}
        remember={remember}
        orgId={scope.activeOrgId}
      />
    </div>
  )
}

function BulkChangeFlow({
  family,
  role,
  targets,
  kinds,
  listPath,
  initialPreview,
  remember,
  orgId,
}: {
  family: BulkFamily
  role: NonNullable<ReturnType<typeof useAuth>['user']>['role']
  targets: BulkTarget[]
  kinds: ReturnType<typeof bulkKindsFor>
  listPath: string
  initialPreview?: AdminBulkChangePreview
  remember: (ids: SavedIds) => void
  orgId?: string
}) {
  const queryClient = useQueryClient()
  const active = useActiveResult()
  const accessReview = useAccessIncreaseReview()
  const [step, setStep] = useState<BulkStep>(initialPreview ? 'preview' : 'kind')
  const [kind, setKind] = useState<AdminBulkChangeKind | null>(
    initialPreview?.change?.kind ?? (kinds.length === 1 ? kinds[0].kind : null),
  )
  const [draft, setDraft] = useState<BulkDraft>(emptyDraft)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [kindError, setKindError] = useState<string | undefined>(undefined)
  const [sent, setSent] = useState<AdminBulkChangeSpec | null>(initialPreview?.change ?? null)
  const [preview, setPreview] = useState<AdminBulkChangePreview | null>(initialPreview ?? null)
  const [result, setResult] = useState<AdminBulkChangeApply | null>(null)
  const [operation, setOperation] = useState<AdminBulkOperation | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const attempted = useRef<AdminBulkChangeRequest | null>(null)
  /** The typed target count that unlocks an irreversible apply. */
  const [confirmation, setConfirmation] = useState('')
  const copy = FAMILY_COPY[family]
  const nameOf = (id: string, name?: string | null) => name ?? id

  const request = (change: AdminBulkChangeSpec): AdminBulkChangeRequest => ({
    targetType: BULK_TARGET_TYPES[family],
    targetIds: targets.map((target) => target.id),
    change,
  })

  /** A 422 naming a field goes back to its step; anything else stays where it happened. */
  const fail = (failure: unknown, fallback: string) => {
    const problem = toApiError(failure, fallback)
    const errors = formFieldErrors(fieldErrorsOf(problem.problem))
    setFieldErrors(errors)
    setError(problem.message)
    if (problem.problem?.status === 422) {
      const routed = routeServerErrors(errors, BULK_FIELDS, BULK_STEPS)
      if (routed && !initialPreview && !attempted.current) setStep(routed)
    }
  }

  const previewMutation = useMutation({
    mutationFn: (change: AdminBulkChangeSpec) => previewAdminBulkChange(request(change)),
    onSuccess: (data, change) => {
      if (!active.current) return
      setSent(change)
      setPreview(data)
      attempted.current = null
      setOperation(null)
      setUncertain(false)
      remember({ previewId: data.previewId })
      setConfirmation('')
      setError(null)
      setFieldErrors({})
      setStep('preview')
    },
    onError: (failure) => { if (active.current) fail(failure, '일괄 변경 미리보기를 불러오지 못했습니다.') },
  })

  const recoverMutation = useMutation({
    mutationFn: () => fetchAdminBulkOperation(attempted.current!.operationId!),
    onSuccess: (data) => {
      if (!active.current) return
      if (data.operationId !== attempted.current?.operationId || data.previewId !== attempted.current?.previewId || data.targetType !== BULK_TARGET_TYPES[family] || data.status !== 'COMMITTED') {
        setError('현재 적용 ID에 해당하는 커밋 결과를 확인하지 못했습니다.')
        return
      }
      setOperation(data)
      setResult(data.result)
      setUncertain(false)
      setError(null)
      setStep('result')
    },
    onError: () => { if (active.current) setError('같은 적용 ID의 저장 결과를 아직 확인하지 못했습니다. 잠시 후 다시 조회해 주세요.') },
  })

  const consumedMutation = useMutation({
    mutationFn: async () => {
      const expected = attempted.current
      if (!expected?.previewId) return null
      const saved = await fetchAdminBulkPreview(expected.previewId)
      if (!active.current || saved.previewId !== expected.previewId || saved.targetType !== expected.targetType || !saved.consumedOperationId) return null
      const receipt = await fetchAdminBulkOperation(saved.consumedOperationId)
      return { expected, saved, receipt }
    },
    onSuccess: (found) => {
      if (!active.current || !found || attempted.current !== found.expected) return
      const { saved, receipt } = found
      if (receipt.operationId !== saved.consumedOperationId || receipt.previewId !== saved.previewId || receipt.targetType !== saved.targetType || receipt.status !== 'COMMITTED') return
      setOperation(receipt)
      setResult(receipt.result)
      setUncertain(false)
      setError(null)
      setStep('result')
      remember({ previewId: saved.previewId, operationId: receipt.operationId })
    },
    onError: () => { if (active.current) setError('이 미리보기로 이미 저장된 결과를 아직 확인하지 못했습니다. 다시 조회해 주세요.') },
  })

  const applied = (data: AdminBulkChangeApply, change: AdminBulkChangeSpec) => {
    const invalidations = FAMILY_QUERY_KEYS[family].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['admin-bulk-operation', data.batchId] }))
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['admin-bulk-recent'] }))
    if (change.kind === 'LLM_KEY_LIMITS') invalidations.push(queryClient.invalidateQueries({ queryKey: ['admin', 'llm-accounts'] }))
    void Promise.all(invalidations)
    if (!active.current) return
    if (data.batchId !== attempted.current?.operationId) { setUncertain(true); setError('현재 적용 ID와 응답의 ID가 다릅니다. 저장된 결과를 다시 조회해 주세요.'); return }
    setResult(data)
    setUncertain(false)
    setError(null)
    setStep('result')
    recoverMutation.mutate()
    if (data.items.every((item) => item.result === 'APPLIED' || item.result === 'UNCHANGED')) clearStoredSelection(family)
  }

  const applicationFailed = (failure: unknown) => {
    if (!active.current) return
    const problem = toApiError(failure, '일괄 변경을 적용하지 못했습니다.')
    setUncertain(!!attempted.current)
    fail(failure, '일괄 변경을 적용하지 못했습니다.')
    if (attempted.current && problem.problem?.status === 409) consumedMutation.mutate()
  }

  const applyMutation = useMutation({
    mutationFn: async ({ change, judged }: { change: AdminBulkChangeSpec; judged: AdminBulkChangePreview }) => {
      if (attempted.current) throw new Error('기존 적용 ID의 결과를 먼저 조회하거나 같은 요청을 재확인해 주세요.')
      if (judged.consumedOperationId || !(Date.now() < Date.parse(judged.expiresAt))) throw new Error('이미 사용됐거나 새 적용 가능 시간이 지난 미리보기입니다. 다시 조회해 주세요.')
      const accessConfirmations: Record<string, AccessConfirmation> = {}
      for (const item of judged.items) {
        if (!active.current) return null
        if (!item.applicable || !item.actorAccessImpact) continue
        const accessConfirmation = await accessReview.confirm(item.actorAccessImpact, `${nameOf(item.targetId, item.name)} · ${item.targetId}`)
        if (accessConfirmation === null || !active.current) return null
        if (accessConfirmation) accessConfirmations[item.targetId] = accessConfirmation
      }
      if (!active.current) return null
      if (!(Date.now() < Date.parse(judged.expiresAt))) throw new Error('미리보기의 새 적용 가능 시간이 지났습니다. 새 미리보기를 만들어 주세요.')
      const body: AdminBulkChangeRequest = {
        ...request(change),
        previewId: judged.previewId,
        operationId: crypto.randomUUID(),
        fingerprints: Object.fromEntries(judged.items.map((item) => [item.targetId, item.fingerprint])),
        ...(Object.keys(accessConfirmations).length > 0 ? { accessConfirmations } : {}),
      }
      attempted.current = body
      remember({ previewId: body.previewId!, operationId: body.operationId! })
      return applyAdminBulkChange(body)
    },
    onSuccess: (data, { change }) => { if (data) applied(data, change) },
    onError: applicationFailed,
  })

  const repeatMutation = useMutation({
    mutationFn: () => active.current && attempted.current ? applyAdminBulkChange(attempted.current) : Promise.resolve(null),
    onSuccess: (data) => { if (data && attempted.current) applied(data, attempted.current.change) },
    onError: applicationFailed,
  })

  const runPreview = () => {
    if (attempted.current) { setError('기존 적용 ID의 결과를 먼저 확인해 주세요.'); return }
    if (!kind) return
    setError(null)
    const built = buildChange(kind, draft)
    if (built.errors) {
      setFieldErrors(built.errors)
      return
    }
    setFieldErrors({})
    previewMutation.mutate(built.change)
  }

  const valuesSlots = slotsFor('values', BULK_FIELDS)
  const changes = preview?.items.filter((item) => item.applicable && item.fields.length > 0) ?? []
  const notApplicable = preview?.items.filter((item) => !item.applicable).length ?? 0
  const targetType = BULK_TARGET_TYPES[family]
  const needsConfirmation = sent != null && requiresTypedCount(sent)
  const confirmed = !needsConfirmation || confirmation.trim() === String(changes.length)

  return (
    <>
      {accessReview.modal}
      {uncertain && attempted.current && <MessageBar variant="warning" title="적용 응답을 확인하지 못했습니다" actions={<>
        <Button variant="secondary" loading={recoverMutation.isPending} onClick={() => recoverMutation.mutate()}>같은 적용 결과 다시 조회</Button>
        <Button variant="secondary" loading={consumedMutation.isPending} onClick={() => consumedMutation.mutate()}>이 미리보기의 저장 결과 확인</Button>
        <Button variant="secondary" loading={repeatMutation.isPending} disabled={recoverMutation.isPending} onClick={() => repeatMutation.mutate()}>같은 ID로 동일 요청 재확인</Button>
      </>}>적용 ID: <code className="break-all">{attempted.current.operationId}</code>. 새 적용을 만들기 전에 기존 요청의 결과를 확인해 주세요.</MessageBar>}
      <Stepper steps={BULK_STEPS.map((id) => BULK_STEP_TITLES[id])} current={BULK_STEPS.indexOf(step)} />

      <details className="text-sm text-foreground-secondary">
        <summary className="cursor-pointer font-medium text-foreground-primary">
          대상 {targets.length}개
        </summary>
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          {(result ? result.items.map((item) => ({ id: item.targetId, name: item.name ?? item.targetId })) : preview ? preview.items.map((item) => ({ id: item.targetId, name: item.name ?? item.targetId })) : targets).map((target) => (
            <li key={target.id}>{target.name}</li>
          ))}
        </ul>
      </details>

      {step === 'kind' && (
        <section className="space-y-4">
          {error && <MessageBar variant="danger">{error}</MessageBar>}
          <CardRadioGroup
            legend="변경 항목"
            required
            value={kind}
            onChange={(next) => {
              setKind(next)
              setKindError(undefined)
            }}
            options={kinds.map((option) => ({ value: option.kind, title: option.title }))}
            columns={2}
            error={kindError}
          />
          <div className="flex justify-end">
            <Button
              loading={previewMutation.isPending}
              disabled={!!attempted.current}
              onClick={() => {
                if (!kind) {
                  setKindError('바꿀 항목을 골라 주세요.')
                  return
                }
                setFieldErrors({})
                setError(null)
                if (kindTakesValues(kind)) setStep('values')
                else runPreview()
              }}
            >
              {!kind || kindTakesValues(kind) ? '다음' : '미리보기'}
            </Button>
          </div>
        </section>
      )}

      {step === 'values' && kind && (
        <section className="space-y-4">
          <ErrorSummary
            error={error}
            fieldErrors={fieldErrors}
            slots={valuesSlots}
            fieldLabels={fieldLabels(BULK_FIELDS)}
          />
          {kind === 'LLM_KEY_LIMITS' && (
            <LimitsForm
              role={role}
              draft={draft.limits}
              onChange={(limits) => setDraft({ ...draft, limits })}
              errors={fieldErrors}
            />
          )}
          {kind === 'LLM_KEY_STATUS' && (
            <StatusForm
              role={role}
              draft={draft.status}
              onChange={(status) => setDraft({ ...draft, status })}
              errors={fieldErrors}
            />
          )}
          {kind === 'LLM_KEY_EXPIRY' && (
            <DateForm
              label="새 만료일"
              value={draft.expiry.endDate}
              onChange={(endDate) => setDraft({ ...draft, expiry: { endDate } })}
              error={fieldErrors['change.llmKeyExpiry.endDate']}
              description={PAID_KEY_EXPIRY_NOTE}
            />
          )}
          {kind === 'VM_PERIOD' && (
            <PeriodForm
              draft={draft.period}
              onChange={(period) => setDraft({ ...draft, period })}
              errors={fieldErrors}
            />
          )}
          {kind === 'VM_POWER' && (
            <PowerForm draft={draft.power} onChange={(power) => setDraft({ ...draft, power })} />
          )}
          {kind === 'VM_DELETION' && (
            <DeletionForm
              draft={draft.deletion}
              onChange={(deletion) => setDraft({ ...draft, deletion })}
              errors={fieldErrors}
            />
          )}
          {kind === 'DOMAIN_RENEWAL' && (
            <DomainRenewalForm
              draft={draft.domainRenewal}
              onChange={(domainRenewal) => setDraft({ ...draft, domainRenewal })}
              errors={fieldErrors}
            />
          )}
          {kind === 'ACCESS' && (
            <AccessForm
              family={family}
              targetIds={targets.map((target) => target.id)}
              draft={draft.access}
              onChange={(access) => setDraft({ ...draft, access })}
              errors={fieldErrors}
            />
          )}
          <div className="flex justify-between gap-2">
            <Button variant="secondary" onClick={() => setStep('kind')}>
              이전
            </Button>
            <Button loading={previewMutation.isPending} disabled={!!attempted.current} onClick={runPreview}>
              미리보기
            </Button>
          </div>
        </section>
      )}

      {step === 'preview' && preview && sent && (
        <section className="space-y-4">
          {error && <MessageBar variant="danger">{error}</MessageBar>}
          <p className="text-sm text-foreground-muted">저장: {formatDateTime(preview.createdAt)} · 새 적용 가능 기한: {formatDateTime(preview.expiresAt)}</p>
          <Link className="text-sm text-brand-foreground underline" to={adminPaths.bulkPreview(family, preview.previewId, orgId)}>저장된 미리보기 링크</Link>
          {notApplicable > 0 && (
            <p className="text-sm text-foreground-secondary">
              적용되지 않는 대상 {notApplicable}개
            </p>
          )}
          <BulkChangePreviewTable items={preview.items} targetType={targetType} label={nameOf} />
          <IrreversibleNotice change={sent} />
          {needsConfirmation && changes.length > 0 && (
            <FormField
              label={`적용 대상 수(${changes.length})를 입력해 주세요`}
              className="w-full sm:w-64"
            >
              <Input
                inputMode="numeric"
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </FormField>
          )}
          <div className="flex justify-between gap-2">
            {initialPreview ? <Link className="text-brand-foreground underline" to={listPath}>목록에서 새로 선택</Link> : <Button
              variant="secondary"
              disabled={applyMutation.isPending || uncertain || repeatMutation.isPending}
              onClick={() => setStep(kindTakesValues(sent.kind) ? 'values' : 'kind')}
            >
              이전
            </Button>}
            {changes.length > 0 ? (
              <Button
                variant={isDestructive(sent) ? 'danger' : 'primary'}
                disabled={!confirmed || !!attempted.current || uncertain || repeatMutation.isPending || !!preview.consumedOperationId || !(Date.now() < Date.parse(preview.expiresAt))}
                loading={applyMutation.isPending}
                onClick={() => {
                  setError(null)
                  applyMutation.mutate({ change: sent, judged: preview })
                }}
              >
                {changes.length}개에 적용
              </Button>
            ) : (
              <MessageBar>적용할 변경이 없습니다.</MessageBar>
            )}
          </div>
        </section>
      )}

      {step === 'result' && result && (
        <section className="space-y-4">
          {error && <MessageBar variant="danger">{error}</MessageBar>}
          <p className="text-sm text-foreground-secondary" aria-label="적용 결과 요약">
            {RESULT_ORDER.map((code) => ({
              code,
              count: result.items.filter((item) => item.result === code).length,
            }))
              .filter((entry) => entry.count > 0)
              .map((entry) => `${labelForBulkResult(entry.code)} ${entry.count}개`)
              .join(', ')}
          </p>
          {operation ? <BulkChangeReceipt operation={operation} /> : <BulkChangeResultTable items={result.items} targetType={targetType} />}
          {(operation?.operationId || attempted.current?.operationId) && <Link className="block break-all text-brand-foreground underline" to={adminPaths.bulkOperation(family, operation?.operationId ?? attempted.current!.operationId!, orgId, operation?.previewId ?? attempted.current?.previewId ?? undefined)}>저장된 적용 결과 링크</Link>}
          {attempted.current?.previewId && <Link className="block text-brand-foreground underline" to={adminPaths.bulkPreview(family, attempted.current.previewId, orgId)}>저장된 미리보기 링크</Link>}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {sent && result.items.some((item) => item.result === 'STALE') && (
              <Button
                variant="secondary"
                loading={previewMutation.isPending}
                disabled={!operation}
                onClick={() => {
                  if (!operation) return
                  setError(null)
                  previewMutation.mutate(sent)
                }}
              >
                다시 미리보기
              </Button>
            )}
            <Link to={listPath} className="text-sm font-semibold text-brand-foreground underline">
              {copy.back} 목록으로
            </Link>
          </div>
        </section>
      )}
    </>
  )
}

function isDestructive(change: AdminBulkChangeSpec): boolean {
  return (
    change.llmKeyStatus?.action === 'REVOKE' ||
    change.vmPower?.action === 'FORCE_STOP' ||
    change.vmDeletion?.action === 'SCHEDULE' ||
    change.kind === 'DOMAIN_FORCE_RELEASE'
  )
}

/** Changes whose apply waits for the administrator to type the target count. */
function requiresTypedCount(change: AdminBulkChangeSpec): boolean {
  return change.kind === 'DOMAIN_FORCE_RELEASE'
}

/** The warning for a change that cannot be taken back, at the button that makes it. */
function IrreversibleNotice({ change }: { change: AdminBulkChangeSpec }) {
  if (change.llmKeyStatus?.action === 'REVOKE') {
    return (
      <MessageBar variant="danger" title="되돌릴 수 없습니다">
        폐기한 키로 보낸 모든 요청이 거부되고, 다시 쓸 수 없습니다.
      </MessageBar>
    )
  }
  if (change.kind === 'DOMAIN_FORCE_RELEASE') {
    return (
      <MessageBar variant="danger" title="되돌릴 수 없습니다">
        이름이 즉시 회수되어 다른 사용자가 사용할 수 있게 됩니다.
      </MessageBar>
    )
  }
  if (change.vmPower?.action === 'FORCE_STOP') {
    return (
      <MessageBar variant="warning">
        전원을 강제로 차단합니다. 저장되지 않은 데이터는 유실될 수 있습니다.
      </MessageBar>
    )
  }
  if (change.vmDeletion?.action === 'SCHEDULE') {
    return (
      <MessageBar variant="warning">
        접수 즉시 각 VM의 사용자에게 사유가 담긴 통보 메일이 발송됩니다.
      </MessageBar>
    )
  }
  return null
}
