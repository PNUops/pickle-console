import type {
  AdminBulkAccessAction,
  AdminBulkChangeKind,
  AdminBulkChangeSpec,
  AdminBulkChangeTargetType,
  AdminBulkListOp,
  AdminBulkLlmKeyStatusAction,
  VmPowerAction,
} from '../api/queries'
import type { UserRole } from '../auth/auth-context'
import {
  canAdminManageAccess,
  canAdminRevokeLlmKey,
  canInterveneDomain,
  canManageLlmCredit,
  canManageVmDeletion,
  canOperateLlmKey,
  canOperateVm,
} from '../auth/permissions'
import type { FieldSlot } from '../components/request-kind/wizard-steps'
import { creditModelRulesError, parseCreditModelRules } from './credit-model-allowlist'
import { formatDateTime } from './format'
import {
  CREDIT_LIMIT_RESET_LABELS,
  RESOURCE_ROLE_LABELS,
  type ResourceRole,
} from './labels'
import { passthroughText, type PassthroughEndpoint } from './passthrough-endpoints'
import {
  DOMAIN_STATUS_LABELS,
  LLM_KEY_STATUS_LABELS,
  ROUTE_STATUS_LABELS,
  VM_EVENT_LABELS,
  VM_STATUS_LABELS,
} from './status'

/**
 * The bulk change screen's pure half: which kinds a role is offered, how the
 * form's drafts become the one request body, and how the server's diffs read.
 */

export type BulkStep = 'kind' | 'values' | 'preview' | 'result'

export const BULK_STEPS: BulkStep[] = ['kind', 'values', 'preview', 'result']

export const BULK_STEP_TITLES: Record<BulkStep, string> = {
  kind: '변경 항목',
  values: '값 입력',
  preview: '미리보기',
  result: '결과',
}

/** The lists that lead into the bulk screen. */
export type BulkFamily = 'llm-keys' | 'vms' | 'domains'

export const BULK_TARGET_TYPES = {
  'llm-keys': 'LLM_KEY',
  vms: 'VM',
  domains: 'DOMAIN',
} as const satisfies Record<BulkFamily, AdminBulkChangeTargetType>

export interface BulkKindOption {
  kind: AdminBulkChangeKind
  title: string
}

const KIND_TITLES: Record<AdminBulkChangeKind, string> = {
  LLM_KEY_LIMITS: '한도·모델·기능 권한',
  LLM_KEY_STATUS: '상태',
  LLM_KEY_EXPIRY: '만료일',
  VM_PERIOD: '기간',
  VM_POWER: '전원',
  VM_DELETION: '삭제 예약·취소',
  DOMAIN_RENEWAL: '사용 기한',
  DOMAIN_VERIFY: '재검증',
  DOMAIN_FORCE_RELEASE: '강제 해제',
  ACCESS: '접근 권한',
}

/** The kinds this role may run on a family, in the order they are offered. */
export function bulkKindsFor(family: BulkFamily, role: UserRole): BulkKindOption[] {
  const access = canAdminManageAccess(role) ? (['ACCESS'] as const) : []
  let offered: AdminBulkChangeKind[]
  switch (family) {
    case 'llm-keys':
      offered = [
        ...(canOperateLlmKey(role)
          ? (['LLM_KEY_LIMITS', 'LLM_KEY_STATUS', 'LLM_KEY_EXPIRY'] as const)
          : []),
        ...access,
      ]
      break
    case 'vms':
      offered = [
        ...(canOperateVm(role) ? (['VM_PERIOD', 'VM_POWER'] as const) : []),
        ...(canManageVmDeletion(role) ? (['VM_DELETION'] as const) : []),
        ...access,
      ]
      break
    case 'domains':
      // The same gate as the domain drawer's intervention section.
      offered = [
        ...(canInterveneDomain(role)
          ? (['DOMAIN_RENEWAL', 'DOMAIN_VERIFY', 'DOMAIN_FORCE_RELEASE'] as const)
          : []),
        ...access,
      ]
      break
  }
  return offered.map((kind) => ({ kind, title: KIND_TITLES[kind] }))
}

/** Kinds whose body is empty go from the kind step straight to the preview. */
export function kindTakesValues(kind: AdminBulkChangeKind): boolean {
  return kind !== 'DOMAIN_FORCE_RELEASE' && kind !== 'DOMAIN_VERIFY'
}

// ── limits ─────────────────────────────────────────────────────────────────

export const LIMIT_FIELDS = [
  'rpm',
  'tpm',
  'dailyTokens',
  'concurrency',
  'creditLimit',
  'creditLimitReset',
  'creditModels',
  'passthroughEndpoints',
] as const

export type LimitFieldKey = (typeof LIMIT_FIELDS)[number]

/** Fields only a role that manages money may change (SYS_MANAGER may not). */
const MONEY_LIMIT_FIELDS: ReadonlySet<LimitFieldKey> = new Set([
  'creditLimit',
  'creditLimitReset',
  'creditModels',
  'passthroughEndpoints',
])

export const LIMIT_FIELD_LABELS: Record<LimitFieldKey, string> = {
  rpm: 'RPM',
  tpm: 'TPM',
  dailyTokens: '일일 토큰',
  concurrency: '동시 요청',
  creditLimit: '금액 한도 (USD)',
  creditLimitReset: '금액 리셋 창',
  creditModels: '유료 모델 허용·차단',
  passthroughEndpoints: '기능 권한',
}

/** The limit fields this role is offered. */
export function limitFieldsFor(role: UserRole): LimitFieldKey[] {
  return LIMIT_FIELDS.filter((field) => !MONEY_LIMIT_FIELDS.has(field) || canManageLlmCredit(role))
}

/** Status actions this role is offered. Revoking is the administrator tier's. */
export function statusActionsFor(role: UserRole): AdminBulkLlmKeyStatusAction[] {
  return canAdminRevokeLlmKey(role) ? ['SUSPEND', 'RESUME', 'REVOKE'] : ['SUSPEND', 'RESUME']
}

export const LIST_OP_LABELS: Record<AdminBulkListOp, string> = {
  REPLACE: '바꾸기',
  ADD: '추가',
  REMOVE: '빼기',
}

export const STATUS_ACTION_LABELS: Record<AdminBulkLlmKeyStatusAction, string> = {
  SUSPEND: '정지',
  RESUME: '재개',
  REVOKE: '폐기',
}

export const POWER_ACTIONS: VmPowerAction[] = ['START', 'SHUTDOWN', 'REBOOT', 'FORCE_STOP']

export const POWER_ACTION_LABELS: Record<VmPowerAction, string> = {
  START: '시작',
  SHUTDOWN: '종료',
  REBOOT: '재부팅',
  FORCE_STOP: '강제 종료',
}

export const ACCESS_ACTION_LABELS: Record<AdminBulkAccessAction, string> = {
  GRANT: '부여',
  CHANGE: '변경',
  REVOKE: '회수',
}

export const ACCESS_ROLES: ResourceRole[] = ['OWNER', 'EDITOR', 'MEMBER', 'VIEWER']

// ── drafts ─────────────────────────────────────────────────────────────────

export interface BulkDraft {
  limits: {
    chosen: LimitFieldKey[]
    rpm: string
    tpm: string
    dailyTokens: string
    concurrency: string
    creditLimit: string
    creditLimitReset: string
    modelsOp: AdminBulkListOp
    modelRules: string
    passthroughOp: AdminBulkListOp
    passthrough: PassthroughEndpoint[]
  }
  status: { action: AdminBulkLlmKeyStatusAction; reason: string }
  expiry: { endDate: string }
  period: { mode: 'date' | 'clear'; endDate: string }
  power: { action: VmPowerAction }
  /** `scheduledFor` is a `datetime-local` value read as KST. */
  deletion: { action: 'SCHEDULE' | 'CANCEL'; scheduledFor: string; reason: string }
  access: { userId: string; userLabel: string; action: AdminBulkAccessAction; role: ResourceRole }
  /** `date` is a KST date; the deadline is the end of that day, as the single form sends. */
  domainRenewal: { date: string; reason: string }
}

export function emptyDraft(): BulkDraft {
  return {
    limits: {
      chosen: [],
      rpm: '',
      tpm: '',
      dailyTokens: '',
      concurrency: '',
      creditLimit: '',
      creditLimitReset: '',
      modelsOp: 'ADD',
      modelRules: '',
      passthroughOp: 'ADD',
      passthrough: [],
    },
    status: { action: 'SUSPEND', reason: '' },
    expiry: { endDate: '' },
    period: { mode: 'date', endDate: '' },
    power: { action: 'START' },
    deletion: { action: 'SCHEDULE', scheduledFor: '', reason: '' },
    access: { userId: '', userLabel: '', action: 'GRANT', role: 'MEMBER' },
    domainRenewal: { date: '', reason: '' },
  }
}

const LIMITS = 'change.llmKeyLimits'

type LimitsBody = NonNullable<AdminBulkChangeSpec['llmKeyLimits']>

function integerOrDefault(raw: string, min: 0 | 1): number | null {
  if (raw.trim() === '') return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min) return Number.NaN
  return value
}

/**
 * A `datetime-local` value (`YYYY-MM-DDTHH:mm`, seconds optional) read as KST.
 * Seconds are added only when the value has none.
 */
export function kstLocalToIso(local: string): string {
  const withSeconds = /T\d{2}:\d{2}$/.test(local) ? `${local}:00` : local
  return new Date(`${withSeconds}+09:00`).toISOString()
}

export type BuildResult =
  | { change: AdminBulkChangeSpec; errors: null }
  | { change: null; errors: Record<string, string> }

function built(change: AdminBulkChangeSpec): BuildResult {
  return { change, errors: null }
}

function failed(errors: Record<string, string>): BuildResult {
  return { change: null, errors }
}

/** The request's `change` for a kind, or the field errors that stop it. */
export function buildChange(kind: AdminBulkChangeKind, draft: BulkDraft): BuildResult {
  switch (kind) {
    case 'LLM_KEY_LIMITS':
      return buildLimits(draft.limits)
    case 'LLM_KEY_STATUS': {
      const { action, reason } = draft.status
      if (action === 'SUSPEND' && !reason.trim()) {
        return failed({ 'change.llmKeyStatus.reason': '정지 사유를 입력해 주세요.' })
      }
      return built({
        kind,
        llmKeyStatus: { action, reason: action === 'SUSPEND' ? reason.trim() : null },
      })
    }
    case 'LLM_KEY_EXPIRY':
      if (!draft.expiry.endDate) {
        return failed({ 'change.llmKeyExpiry.endDate': '새 만료일을 선택해 주세요.' })
      }
      return built({ kind, llmKeyExpiry: { endDate: draft.expiry.endDate } })
    case 'VM_PERIOD':
      if (draft.period.mode === 'clear') {
        return built({ kind, vmPeriod: { clearEndDate: true } })
      }
      if (!draft.period.endDate) {
        return failed({ 'change.vmPeriod.endDate': '새 종료일을 선택해 주세요.' })
      }
      return built({ kind, vmPeriod: { endDate: draft.period.endDate } })
    case 'VM_POWER':
      return built({ kind, vmPower: { action: draft.power.action } })
    case 'VM_DELETION': {
      const { action, scheduledFor, reason } = draft.deletion
      if (action === 'CANCEL') return built({ kind, vmDeletion: { action } })
      const errors: Record<string, string> = {}
      if (!scheduledFor) errors['change.vmDeletion.scheduledFor'] = '삭제 예정 시각을 선택해 주세요.'
      if (!reason.trim()) errors['change.vmDeletion.reason'] = '삭제 사유를 입력해 주세요.'
      if (Object.keys(errors).length > 0) return failed(errors)
      return built({
        kind,
        vmDeletion: {
          action,
          scheduledFor: kstLocalToIso(scheduledFor),
          reason: reason.trim(),
        },
      })
    }
    case 'DOMAIN_RENEWAL': {
      const { date, reason } = draft.domainRenewal
      if (!date) {
        return failed({ 'change.domainRenewal.renewDueAt': '새 사용 기한을 선택해 주세요.' })
      }
      return built({
        kind,
        domainRenewal: {
          renewDueAt: new Date(`${date}T23:59:59+09:00`).toISOString(),
          reason: reason.trim() || null,
        },
      })
    }
    case 'DOMAIN_FORCE_RELEASE':
      return built({ kind, domainForceRelease: {} })
    case 'DOMAIN_VERIFY':
      return built({ kind, domainVerify: {} })
    case 'ACCESS': {
      const { userId, action, role } = draft.access
      if (!userId) return failed({ 'change.access.userId': '대상 사용자를 골라 주세요.' })
      return built({
        kind,
        access: { userId, action, role: action === 'REVOKE' ? null : role },
      })
    }
  }
}

function buildLimits(limits: BulkDraft['limits']): BuildResult {
  const chosen = new Set(limits.chosen)
  if (chosen.size === 0) return failed({ [LIMITS]: '바꿀 항목을 하나 이상 골라 주세요.' })
  const errors: Record<string, string> = {}
  const body: LimitsBody = {}
  for (const field of ['rpm', 'tpm', 'dailyTokens', 'concurrency'] as const) {
    if (!chosen.has(field)) continue
    const min = field === 'dailyTokens' ? 0 : 1
    const value = integerOrDefault(limits[field], min)
    if (Number.isNaN(value)) {
      errors[`${LIMITS}.${field}`] = `${min} 이상의 올바른 정수를 입력하거나 비워 주세요.`
    } else {
      body[field] = value
    }
  }
  if (body.rpm != null && body.tpm != null && body.tpm < body.rpm) {
    errors[`${LIMITS}.tpm`] = 'TPM은 RPM보다 작을 수 없습니다.'
  }
  if (chosen.has('creditLimit')) {
    const credit = Number(limits.creditLimit)
    if (limits.creditLimit.trim() === '' || !Number.isFinite(credit) || credit < 0) {
      errors[`${LIMITS}.creditLimit`] = '금액 한도는 0 이상의 숫자여야 합니다.'
    } else {
      body.creditLimit = credit
    }
  }
  if (chosen.has('creditLimitReset')) {
    body.creditLimitReset = (limits.creditLimitReset || null) as LimitsBody['creditLimitReset']
  }
  if (chosen.has('creditModels')) {
    const rules = parseCreditModelRules(limits.modelRules)
    const ruleError = creditModelRulesError(rules)
    const op = limits.modelsOp
    if (ruleError) {
      errors[`${LIMITS}.creditModels`] = ruleError
    } else if (op === 'REPLACE') {
      // Replacing is the single key's whole-list edit: both lists become
      // exactly what the lines say, including empty.
      body.creditAllowedModels = { op, values: rules.allowed }
      body.creditDeniedModels = { op, values: rules.denied }
    } else if (rules.allowed.length === 0 && rules.denied.length === 0) {
      errors[`${LIMITS}.creditModels`] = `${LIST_OP_LABELS[op]}할 모델을 한 줄 이상 적어 주세요.`
    } else {
      // Adding or removing touches only the lists the lines name.
      if (rules.allowed.length > 0) body.creditAllowedModels = { op, values: rules.allowed }
      if (rules.denied.length > 0) body.creditDeniedModels = { op, values: rules.denied }
    }
  }
  if (chosen.has('passthroughEndpoints')) {
    const op = limits.passthroughOp
    if (op !== 'REPLACE' && limits.passthrough.length === 0) {
      errors[`${LIMITS}.passthroughEndpoints`] = `${LIST_OP_LABELS[op]}할 기능을 하나 이상 골라 주세요.`
    } else {
      body.passthroughEndpoints = { op, values: [...limits.passthrough] }
    }
  }
  if (Object.keys(errors).length > 0) return failed(errors)
  return built({
    kind: 'LLM_KEY_LIMITS',
    llmKeyLimits: body as NonNullable<AdminBulkChangeSpec['llmKeyLimits']>,
  })
}

/** Does the draft replace a list with nothing — the edit that clears every key? */
export function clearingLists(draft: BulkDraft['limits']): {
  allowed: boolean
  denied: boolean
  passthrough: boolean
} {
  const chosen = new Set(draft.chosen)
  // Replacing sends both model lists, so each side the lines leave empty is
  // emptied on every key, not only when the whole text is blank.
  const replacingModels = chosen.has('creditModels') && draft.modelsOp === 'REPLACE'
  const rules = parseCreditModelRules(draft.modelRules)
  return {
    allowed: replacingModels && rules.allowed.length === 0,
    denied: replacingModels && rules.denied.length === 0,
    passthrough:
      chosen.has('passthroughEndpoints') &&
      draft.passthroughOp === 'REPLACE' &&
      draft.passthrough.length === 0,
  }
}

// ── server errors ──────────────────────────────────────────────────────────

/**
 * A server field path as the form knows it. A list's error names its
 * `values`, and the two model lists share one input here.
 */
export function formFieldOf(field: string): string {
  const path = field.replace(/\.values(\[\d+\])?$/, '')
  if (path === `${LIMITS}.creditAllowedModels` || path === `${LIMITS}.creditDeniedModels`) {
    return `${LIMITS}.creditModels`
  }
  return path
}

export function formFieldErrors(fieldErrors: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {}
  for (const [field, message] of Object.entries(fieldErrors)) {
    mapped[formFieldOf(field)] ??= message
  }
  return mapped
}

const valuesSlot = (label: string): FieldSlot<BulkStep> => ({ label, step: 'values' })

/** Every field the values step has a place for. */
export const BULK_FIELDS: Record<string, FieldSlot<BulkStep>> = {
  [LIMITS]: valuesSlot('바꿀 항목'),
  ...Object.fromEntries(
    LIMIT_FIELDS.map((field) => [`${LIMITS}.${field}`, valuesSlot(LIMIT_FIELD_LABELS[field])]),
  ),
  'change.llmKeyStatus.reason': valuesSlot('정지 사유'),
  'change.llmKeyExpiry.endDate': valuesSlot('만료일'),
  'change.vmPeriod.endDate': valuesSlot('종료일'),
  'change.vmDeletion.scheduledFor': valuesSlot('삭제 예정 시각'),
  'change.vmDeletion.reason': valuesSlot('삭제 사유'),
  'change.domainRenewal.renewDueAt': valuesSlot('새 사용 기한'),
  'change.domainRenewal.reason': valuesSlot('사유'),
  'change.access.userId': valuesSlot('대상 사용자'),
  'change.access.role': valuesSlot('등급'),
}

// ── diffs ──────────────────────────────────────────────────────────────────

const DIFF_FIELD_LABELS: Record<string, string> = {
  rpm: 'RPM',
  tpm: 'TPM',
  concurrency: '동시 요청',
  dailyTokens: '일일 토큰',
  creditLimit: '금액 한도',
  creditLimitReset: '금액 리셋',
  creditAllowedModels: '허용 유료 모델',
  creditDeniedModels: '차단 유료 모델',
  passthroughEndpoints: '기능 권한',
  status: '상태',
  expiresAt: '만료',
  endDate: '종료일',
  pendingPowerAction: '전원 동작',
  deleteKind: '삭제 종류',
  deleteScheduledFor: '삭제 예정',
  role: '접근 권한',
  renewDueAt: '사용 기한',
  releasedAt: '해제 시각',
  routeStatus: '라우트',
  verification: '소유권 검증',
  records: 'DNS 레코드',
  activeCertificates: '유효한 인증서',
}

/** Diff fields that are counts of things rather than values. */
const COUNT_FIELDS: ReadonlySet<string> = new Set(['records', 'activeCertificates'])

export function diffFieldLabel(field: string): string {
  return DIFF_FIELD_LABELS[field] ?? field
}

const VERIFICATION_LABELS: Record<string, string> = {
  REQUESTED: '재검증 접수',
}

const DELETE_KIND_LABELS: Record<string, string> = {
  SELF: '본인 삭제',
  ADMIN: '관리자 삭제',
  FORCE: '강제 삭제',
}

function lookup(table: Record<string, string>, value: string): string {
  return table[value] ?? value
}

/**
 * One side of a diff as a reader sees it. Unknown shapes fall back to their
 * text. The target type settles words two types share (a domain's ACTIVE is
 * not a key's).
 */
export function formatDiffValue(
  field: string,
  value: unknown,
  targetType?: AdminBulkChangeTargetType,
): string {
  if (value == null) {
    switch (field) {
      case 'rpm':
      case 'tpm':
      case 'concurrency':
        return '서비스 기본값'
      case 'dailyTokens':
        return '무제한'
      case 'creditLimitReset':
        return '리셋 없음'
      case 'expiresAt':
        return '만료 없음'
      case 'endDate':
        return '종료일 없음'
      case 'role':
      case 'releasedAt':
        return '없음'
      case 'renewDueAt':
        return '기한 없음'
      default:
        return '—'
    }
  }
  if (Array.isArray(value)) {
    if (field === 'passthroughEndpoints') return passthroughText(value.map(String))
    return value.length === 0 ? '없음' : value.map(String).join(', ')
  }
  if (typeof value === 'number') {
    if (COUNT_FIELDS.has(field)) return `${value.toLocaleString('ko-KR')}개`
    return field === 'creditLimit' ? `$${value.toLocaleString('ko-KR')}` : value.toLocaleString('ko-KR')
  }
  if (typeof value === 'string') {
    switch (field) {
      case 'creditLimit':
        return `$${value}`
      case 'creditLimitReset':
        return lookup(CREDIT_LIMIT_RESET_LABELS, value)
      case 'status':
        if (targetType === 'DOMAIN') return lookup(DOMAIN_STATUS_LABELS, value)
        return lookup({ ...LLM_KEY_STATUS_LABELS, ...VM_STATUS_LABELS }, value)
      case 'routeStatus':
        return lookup(ROUTE_STATUS_LABELS, value)
      case 'verification':
        return lookup(VERIFICATION_LABELS, value)
      case 'pendingPowerAction':
        return lookup({ ...VM_EVENT_LABELS, ...POWER_ACTION_LABELS }, value)
      case 'deleteKind':
        return lookup(DELETE_KIND_LABELS, value)
      case 'role':
        return lookup(RESOURCE_ROLE_LABELS, value)
      case 'expiresAt':
      case 'deleteScheduledFor':
      case 'renewDueAt':
      case 'releasedAt':
        return Number.isNaN(Date.parse(value)) ? value : formatDateTime(value)
      default:
        return value
    }
  }
  return JSON.stringify(value)
}
