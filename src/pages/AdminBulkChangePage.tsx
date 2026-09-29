import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'
import {
  applyAdminBulkChange,
  previewAdminBulkChange,
  type AdminBulkChangeApply,
  type AdminBulkChangeFieldDiff,
  type AdminBulkChangeKind,
  type AdminBulkChangePreview,
  type AdminBulkChangeRequest,
  type AdminBulkChangeSpec,
  type AdminBulkChangeTargetType,
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
  DataTable,
  ErrorSummary,
  FormField,
  Input,
  MessageBar,
  PageHeader,
  Stepper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import {
  BULK_FIELDS,
  BULK_STEPS,
  BULK_STEP_TITLES,
  BULK_TARGET_TYPES,
  bulkKindsFor,
  buildChange,
  diffFieldLabel,
  emptyDraft,
  formFieldErrors,
  formatDiffValue,
  kindTakesValues,
  type BulkDraft,
  type BulkFamily,
  type BulkStep,
} from '../lib/bulk-change'
import { BULK_SELECTION_CAP, clearStoredSelection, type BulkTarget } from '../lib/bulk-selection'
import { fieldErrorsOf } from '../lib/field-errors'
import { PAID_KEY_EXPIRY_NOTE, labelForBulkReason, labelForBulkResult } from '../lib/labels'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'

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
  // A release also takes the name's route down.
  domains: [
    ['admin', 'domains'],
    ['admin', 'routes'],
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
  const role = scope.tier === 'org' ? scope.activeOrgRole : user?.role
  const copy = FAMILY_COPY[family]
  const listPath = listPathOf(family, scope.activeOrgId)
  const targets = targetsOf(location.state)
  const kinds = role ? bulkKindsFor(family, role) : []

  const header = (
    <>
      <Link to={listPath} className="text-sm text-brand-foreground hover:underline">
        ← {copy.back}
      </Link>
      <PageHeader title={copy.title} />
    </>
  )

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
      </div>
    )
  }
  if (!role || kinds.length === 0) {
    return (
      <div className="space-y-5">
        {header}
        <MessageBar variant="danger">이 계정으로 할 수 있는 일괄 변경이 없습니다.</MessageBar>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {header}
      <BulkChangeFlow
        family={family}
        role={role}
        targets={targets}
        kinds={kinds}
        listPath={listPath}
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
  orgId,
}: {
  family: BulkFamily
  role: NonNullable<ReturnType<typeof useAuth>['user']>['role']
  targets: BulkTarget[]
  kinds: ReturnType<typeof bulkKindsFor>
  listPath: string
  orgId: string | undefined
}) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<BulkStep>('kind')
  const [kind, setKind] = useState<AdminBulkChangeKind | null>(
    kinds.length === 1 ? kinds[0].kind : null,
  )
  const [draft, setDraft] = useState<BulkDraft>(emptyDraft)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [kindError, setKindError] = useState<string | undefined>(undefined)
  const [sent, setSent] = useState<AdminBulkChangeSpec | null>(null)
  const [preview, setPreview] = useState<AdminBulkChangePreview | null>(null)
  const [result, setResult] = useState<AdminBulkChangeApply | null>(null)
  /** The typed target count that unlocks an irreversible apply. */
  const [confirmation, setConfirmation] = useState('')
  const copy = FAMILY_COPY[family]
  const names = new Map(targets.map((target) => [target.id, target.name]))
  const nameOf = (id: string, name?: string | null) => name ?? names.get(id) ?? id

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
      if (routed) setStep(routed)
    }
  }

  const previewMutation = useMutation({
    mutationFn: (change: AdminBulkChangeSpec) => previewAdminBulkChange(request(change)),
    onSuccess: (data, change) => {
      setSent(change)
      setPreview(data)
      setConfirmation('')
      setError(null)
      setFieldErrors({})
      setStep('preview')
    },
    onError: (failure) => fail(failure, '일괄 변경 미리보기를 불러오지 못했습니다.'),
  })

  const applyMutation = useMutation({
    mutationFn: ({ change, judged }: { change: AdminBulkChangeSpec; judged: AdminBulkChangePreview }) =>
      applyAdminBulkChange({
        ...request(change),
        fingerprints: Object.fromEntries(
          judged.items.map((item) => [item.targetId, item.fingerprint]),
        ),
      }),
    onSuccess: async (data, { change }) => {
      setResult(data)
      setError(null)
      setStep('result')
      // The selection is spent only when every target ended where it was
      // asked to; anything skipped or stale may still need the same list.
      if (data.items.every((item) => item.result === 'APPLIED' || item.result === 'UNCHANGED')) {
        clearStoredSelection(family)
      }
      const invalidations = FAMILY_QUERY_KEYS[family].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      )
      // Limits move what a paid-model account has allocated.
      if (change.kind === 'LLM_KEY_LIMITS') {
        invalidations.push(queryClient.invalidateQueries({ queryKey: ['admin', 'llm-accounts'] }))
      }
      await Promise.all(invalidations)
    },
    onError: (failure) => fail(failure, '일괄 변경을 적용하지 못했습니다.'),
  })

  const runPreview = () => {
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
      <Stepper steps={BULK_STEPS.map((id) => BULK_STEP_TITLES[id])} current={BULK_STEPS.indexOf(step)} />

      <details className="text-sm text-foreground-secondary">
        <summary className="cursor-pointer font-medium text-foreground-primary">
          대상 {targets.length}개
        </summary>
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          {targets.map((target) => (
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
              orgId={orgId}
              draft={draft.access}
              onChange={(access) => setDraft({ ...draft, access })}
              errors={fieldErrors}
            />
          )}
          <div className="flex justify-between gap-2">
            <Button variant="secondary" onClick={() => setStep('kind')}>
              이전
            </Button>
            <Button loading={previewMutation.isPending} onClick={runPreview}>
              미리보기
            </Button>
          </div>
        </section>
      )}

      {step === 'preview' && preview && sent && (
        <section className="space-y-4">
          {error && <MessageBar variant="danger">{error}</MessageBar>}
          {notApplicable > 0 && (
            <p className="text-sm text-foreground-secondary">
              적용되지 않는 대상 {notApplicable}개
            </p>
          )}
          <DataTable caption="일괄 변경 미리보기">
            <THead>
              <TR>
                <TH>대상</TH>
                <TH>적용 여부</TH>
                <TH>변경 내용</TH>
                <TH>사유</TH>
              </TR>
            </THead>
            <TBody>
              {preview.items.map((item) => (
                <TR key={item.targetId}>
                  <TD className="font-medium text-foreground-primary">
                    {nameOf(item.targetId, item.name)}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {!item.applicable ? '적용 안 됨' : item.fields.length === 0 ? '변경 없음' : '적용'}
                  </TD>
                  <TD>
                    <DiffList fields={item.fields} targetType={targetType} />
                  </TD>
                  <TD>{item.reason ? labelForBulkReason(item.reason) : '—'}</TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
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
            <Button
              variant="secondary"
              disabled={applyMutation.isPending}
              onClick={() => setStep(kindTakesValues(sent.kind) ? 'values' : 'kind')}
            >
              이전
            </Button>
            {changes.length > 0 ? (
              <Button
                variant={isDestructive(sent) ? 'danger' : 'primary'}
                disabled={!confirmed}
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
          <DataTable caption="일괄 변경 결과">
            <THead>
              <TR>
                <TH>대상</TH>
                <TH>결과</TH>
                <TH>변경 내용</TH>
                <TH>사유</TH>
              </TR>
            </THead>
            <TBody>
              {result.items.map((item) => (
                <TR key={item.targetId}>
                  <TD className="font-medium text-foreground-primary">
                    {nameOf(item.targetId, item.name)}
                  </TD>
                  <TD className="whitespace-nowrap">{labelForBulkResult(item.result)}</TD>
                  <TD>
                    <DiffList fields={item.fields} targetType={targetType} />
                  </TD>
                  <TD>{item.reason ? labelForBulkReason(item.reason) : '—'}</TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {sent && result.items.some((item) => item.result === 'STALE') && (
              <Button
                variant="secondary"
                loading={previewMutation.isPending}
                onClick={() => {
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

function DiffList({
  fields,
  targetType,
}: {
  fields: AdminBulkChangeFieldDiff[]
  targetType: AdminBulkChangeTargetType
}) {
  if (fields.length === 0) return <span className="text-foreground-muted">—</span>
  return (
    <ul className="space-y-0.5">
      {fields.map((diff) => (
        <li key={diff.field}>
          <span className="text-foreground-muted">{diffFieldLabel(diff.field)}</span>{' '}
          {formatDiffValue(diff.field, diff.oldValue, targetType)} →{' '}
          {formatDiffValue(diff.field, diff.newValue, targetType)}
        </li>
      ))}
    </ul>
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
        도메인이 삭제되고 DNS 존에서 레코드가 지워집니다. 이름은 즉시 회수됩니다.
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
