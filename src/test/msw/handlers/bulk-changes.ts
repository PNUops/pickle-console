import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { kstDateString } from '../../../lib/format'
import { problemResponse } from './auth'
import { activeAdminRole, adminActor, adminLlmKeyStore } from './llm-keys'
import {
  findAdminDomain,
  releaseAdminDomain,
  releaseFingerprintParts,
  releaseTeardownCounts,
  setExternalRenewal,
} from './publishing'
import { adminUserStore } from './users'
import { vmStore } from './vms'
import { workspaceMembersOf } from './workspaces'

type Schemas = components['schemas']
type Request_ = Schemas['AdminBulkChangeRequest']
type Reason = Schemas['AdminBulkChangeReason']
type Diff = Schemas['AdminBulkChangeFieldDiff']
type Profile = Schemas['UserProfileResponse']
type AdminKey = (typeof adminLlmKeyStore)[number]
type Vm = (typeof vmStore)[number]
type Domain = Schemas['AdminDomainView']
type Target = AdminKey | Vm | Domain

/** Every body the two endpoints received, in order. Tests read these. */
export let bulkPreviewBodies: Request_[] = []
export let bulkApplyBodies: Request_[] = []
export let expiryBodies: { keyId: string; endDate: string }[] = []

/** Access grants the mock holds, keyed `${targetId}:${userId}`. */
let grants: Record<string, Schemas['ResourceRole']> = {}

export function resetBulkChangeFixtures() {
  bulkPreviewBodies = []
  bulkApplyBodies = []
  expiryBodies = []
  grants = {}
}

const OPERATE = ['ORG_MANAGER', 'ORG_ADMIN', 'SYS_MANAGER', 'SYS_ADMIN']

const validation = (instance: string, errors: { field: string; message: string }[]) =>
  problemResponse({
    type: 'about:blank',
    title: '입력값이 올바르지 않습니다',
    status: 422,
    detail: errors[0].message,
    instance,
    code: 'VALIDATION_FAILED',
    errors,
  })

/** The endpoint's class gate: only the four write roles may call it. */
const forbidden = (instance: string) =>
  problemResponse({
    type: 'about:blank',
    title: '접근 권한이 없습니다',
    status: 403,
    detail: '이 작업을 수행할 권한이 없습니다.',
    instance,
    code: 'ACCESS_DENIED',
  })

interface Judgement {
  reason: Reason | null
  fields: Diff[]
  write?: () => void
}

const refused = (reason: Reason): Judgement => ({ reason, fields: [] })
const diff = (field: string, oldValue: unknown, newValue: unknown): Diff => ({
  field,
  oldValue,
  newValue,
})

function applyList(
  current: readonly string[],
  change: Schemas['AdminBulkListChange'] | undefined,
): string[] {
  if (!change) return [...current]
  if (change.op === 'REPLACE') return [...change.values]
  if (change.op === 'ADD') return [...current, ...change.values.filter((v) => !current.includes(v))]
  return current.filter((value) => !change.values.includes(value))
}

function sameList(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function reachKey(profile: Profile, key: AdminKey, change: Schemas['AdminBulkChangeSpec']): Reason | null {
  const role = activeAdminRole(profile, key.orgId)
  if (change.kind === 'ACCESS') {
    if (!role) return 'NOT_FOUND'
    return role === 'SYS_ADMIN' || role === 'ORG_ADMIN' ? null : 'FORBIDDEN'
  }
  if (!role || !OPERATE.includes(role)) return 'NOT_FOUND'
  if (change.kind === 'LLM_KEY_STATUS' && change.llmKeyStatus?.action === 'REVOKE') {
    return role === 'SYS_ADMIN' || role === 'ORG_ADMIN' ? null : 'FORBIDDEN'
  }
  return null
}

function reachVm(profile: Profile, vm: Vm, change: Schemas['AdminBulkChangeSpec']): Reason | null {
  const role = activeAdminRole(profile, vm.orgId)
  if (!role) return 'NOT_FOUND'
  if (change.kind === 'ACCESS' || change.kind === 'VM_DELETION') {
    return role === 'SYS_ADMIN' || role === 'ORG_ADMIN' ? null : 'FORBIDDEN'
  }
  return OPERATE.includes(role) ? null : 'NOT_FOUND'
}

/**
 * The domain paths' reach: the system tier everywhere, the organisation tier on
 * the names of an institution it operates, anything else not found. Access
 * keeps its own rule, the administrator tier's.
 */
function reachDomain(profile: Profile, domain: Domain, change: Schemas['AdminBulkChangeSpec']): Reason | null {
  const role = activeAdminRole(profile, domain.orgId)
  if (change.kind === 'ACCESS') {
    if (!role) return 'NOT_FOUND'
    return role === 'SYS_ADMIN' || role === 'ORG_ADMIN' ? null : 'FORBIDDEN'
  }
  return role && OPERATE.includes(role) ? null : 'NOT_FOUND'
}

function judgeAccess(
  targetId: string,
  workspaceId: string | null | undefined,
  change: Schemas['AdminBulkAccessChange'],
): Judgement {
  const user = adminUserStore.find((row) => row.id === change.userId && row.status === 'ACTIVE')
  if (!user) return refused('INELIGIBLE')
  if (!workspaceMembersOf(workspaceId).some((member) => member.userId === change.userId)) {
    return refused('NOT_MEMBER')
  }
  const key = `${targetId}:${change.userId}`
  const current = grants[key] ?? null
  const next = change.role ?? null
  const write = () => {
    if (change.action === 'REVOKE') delete grants[key]
    else grants[key] = next!
  }
  if (change.action === 'GRANT') {
    if (current) return current === next ? { reason: null, fields: [] } : refused('ALREADY_GRANTED')
    return { reason: null, fields: [diff('role', null, next)], write }
  }
  if (!current) return refused('NO_GRANT')
  if (change.action === 'CHANGE' && current === next) return { reason: null, fields: [] }
  return { reason: null, fields: [diff('role', current, change.action === 'REVOKE' ? null : next)], write }
}

function judgeKey(profile: Profile, key: AdminKey, change: Schemas['AdminBulkChangeSpec']): Judgement {
  const status = key.status
  switch (change.kind) {
    case 'LLM_KEY_LIMITS': {
      if (!['PENDING', 'ACTIVE', 'SUSPENDED'].includes(status)) return refused('INVALID_STATE')
      const limits = change.llmKeyLimits!
      const next = {
        rpm: 'rpm' in limits ? (limits.rpm ?? null) : key.rpm,
        tpm: 'tpm' in limits ? (limits.tpm ?? null) : key.tpm,
        concurrency: 'concurrency' in limits ? (limits.concurrency ?? null) : key.concurrency,
        dailyTokens: 'dailyTokens' in limits ? (limits.dailyTokens ?? null) : key.dailyTokens,
        creditLimit: limits.creditLimit ?? key.creditLimit,
        creditLimitReset:
          'creditLimitReset' in limits ? (limits.creditLimitReset ?? null) : key.creditLimitReset,
        creditAllowedModels: applyList(key.creditAllowedModels, limits.creditAllowedModels),
        creditDeniedModels: applyList(key.creditDeniedModels, limits.creditDeniedModels),
        passthroughEndpoints: applyList(key.passthroughEndpoints, limits.passthroughEndpoints),
      }
      const fields: Diff[] = []
      for (const field of Object.keys(next) as (keyof typeof next)[]) {
        const before = key[field]
        const after = next[field]
        const same = Array.isArray(before)
          ? sameList(before, after as string[])
          : before === after
        if (!same) fields.push(diff(field, before, after))
      }
      const money = fields.some((entry) =>
        ['creditLimit', 'creditLimitReset', 'creditAllowedModels', 'creditDeniedModels', 'passthroughEndpoints'].includes(entry.field),
      )
      if (money && activeAdminRole(profile, key.orgId) === 'SYS_MANAGER') return refused('FORBIDDEN')
      return {
        reason: null,
        fields,
        write: () => Object.assign(key, next),
      }
    }
    case 'LLM_KEY_STATUS': {
      const action = change.llmKeyStatus!.action
      const target = action === 'SUSPEND' ? 'SUSPENDED' : action === 'RESUME' ? 'ACTIVE' : 'REVOKED'
      if (status === target) return { reason: null, fields: [] }
      const allowed =
        action === 'SUSPEND' ? status === 'ACTIVE' : action === 'RESUME' ? status === 'SUSPENDED' : true
      if (!allowed) return refused('INVALID_STATE')
      return {
        reason: null,
        fields: [diff('status', status, target)],
        write: () => {
          key.status = target
        },
      }
    }
    case 'LLM_KEY_EXPIRY': {
      if (status === 'REVOKED') return refused('INVALID_STATE')
      const expiresAt = nextDayKst(change.llmKeyExpiry!.endDate)
      if (extendsPaidKey(key, expiresAt)) return refused('INELIGIBLE')
      if (key.expiresAt === expiresAt) return { reason: null, fields: [] }
      return {
        reason: null,
        fields: [diff('expiresAt', key.expiresAt, expiresAt)],
        write: () => {
          key.expiresAt = expiresAt
        },
      }
    }
    case 'ACCESS':
      return judgeAccess(key.id, key.workspaceId, change.access!)
    default:
      return refused('INELIGIBLE')
  }
}

function judgeVm(vm: Vm, change: Schemas['AdminBulkChangeSpec']): Judgement {
  switch (change.kind) {
    case 'VM_PERIOD': {
      const next = change.vmPeriod!.clearEndDate ? null : (change.vmPeriod!.endDate ?? null)
      if (vm.endDate === next) return { reason: null, fields: [] }
      return {
        reason: null,
        fields: [diff('endDate', vm.endDate, next)],
        write: () => {
          vm.endDate = next
        },
      }
    }
    case 'VM_POWER': {
      const action = change.vmPower!.action
      const ok =
        action === 'START'
          ? vm.status === 'STOPPED'
          : action === 'FORCE_STOP'
            ? vm.status === 'RUNNING' || vm.status === 'REBOOTING'
            : vm.status === 'RUNNING'
      if (!ok) return refused('INVALID_STATE')
      return { reason: null, fields: [diff('pendingPowerAction', null, action)] }
    }
    case 'VM_DELETION': {
      const deletion = change.vmDeletion!
      if (deletion.action === 'CANCEL') {
        if (!vm.deletion?.cancelable) return refused('INVALID_STATE')
        return {
          reason: null,
          fields: [diff('deleteKind', vm.deletion.kind, null)],
          write: () => {
            vm.deletion = null
          },
        }
      }
      if (vm.deletion) return refused('INVALID_STATE')
      return {
        reason: null,
        fields: [
          diff('deleteKind', null, 'ADMIN'),
          diff('deleteScheduledFor', null, deletion.scheduledFor),
        ],
      }
    }
    case 'ACCESS':
      return judgeAccess(vm.id, vm.workspaceId, change.access!)
    default:
      return refused('INELIGIBLE')
  }
}

function judgeDomain(domain: Domain, change: Schemas['AdminBulkChangeSpec']): Judgement {
  switch (change.kind) {
    case 'DOMAIN_RENEWAL': {
      // Only an external name has a deadline; a released one can no longer move it.
      if (domain.kind !== 'EXTERNAL') return refused('INELIGIBLE')
      if (domain.releasedAt) return refused('INVALID_STATE')
      const next = change.domainRenewal!.renewDueAt
      if (domain.renewDueAt && Date.parse(domain.renewDueAt) === Date.parse(next)) {
        return { reason: null, fields: [] }
      }
      return {
        reason: null,
        fields: [diff('renewDueAt', domain.renewDueAt ?? null, next)],
        write: () => setExternalRenewal(domain.id, next),
      }
    }
    case 'DOMAIN_FORCE_RELEASE': {
      // The single path refuses no name it can find, so neither does this.
      const fields = [diff('status', domain.status, 'REMOVED')]
      if (domain.releasedAt) fields.push(diff('releasedAt', domain.releasedAt, null))
      if (domain.routeStatus && domain.routeStatus !== 'REMOVED') {
        fields.push(diff('routeStatus', domain.routeStatus, 'REMOVED'))
      }
      // Counts appear only when there is something to take down.
      const { records, activeCertificates } = releaseTeardownCounts(domain.id)
      if (records > 0) fields.push(diff('records', records, 0))
      if (activeCertificates > 0) fields.push(diff('activeCertificates', activeCertificates, 0))
      return { reason: null, fields, write: () => void releaseAdminDomain(domain.id) }
    }
    case 'DOMAIN_VERIFY':
      if (domain.kind !== 'CUSTOM') return refused('INELIGIBLE')
      return { reason: null, fields: [diff('verification', null, 'REQUESTED')] }
    case 'ACCESS':
      // Grants exist only on external names; any other reachable name is
      // refused by kind, with its name shown.
      if (domain.kind !== 'EXTERNAL') return refused('INELIGIBLE')
      return judgeAccess(domain.id, domain.workspaceId, change.access!)
    default:
      return refused('INELIGIBLE')
  }
}

/**
 * The server's rule for a key with an OpenRouter half: it may be shortened,
 * never extended. The mock reads the connected flag as that half.
 */
function extendsPaidKey(key: AdminKey, next: string): boolean {
  return key.creditAxisConnected && key.expiresAt != null && Date.parse(next) > Date.parse(key.expiresAt)
}

/** The day after `endDate` at 00:00 KST, as the server stores an expiry. */
function nextDayKst(endDate: string): string {
  const start = new Date(`${endDate}T00:00:00+09:00`)
  return new Date(start.getTime() + 86_400_000).toISOString()
}

/**
 * Changes whenever anything on the target changes, like the server's hash.
 * An access change also covers the grantee's current grant on the target.
 */
function fingerprintOf(target: Target, change: Schemas['AdminBulkChangeSpec']): string {
  const grant =
    change.kind === 'ACCESS' ? (grants[`${target.id}:${change.access?.userId}`] ?? null) : null
  return hashed(target.id, [target, grant])
}

function hashed(id: string, values: unknown): string {
  let hash = 7
  for (const char of JSON.stringify(values)) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return `${id}:${hash}`
}

/**
 * A domain's fingerprint, per kind, from the values the server hashes: kind
 * and status always, and what each kind's judgment reads besides. Access reads
 * only the grantee's current grant.
 */
function domainFingerprintOf(domain: Domain, change: Schemas['AdminBulkChangeSpec']): string {
  if (change.kind === 'ACCESS') {
    return hashed(domain.id, grants[`${domain.id}:${change.access?.userId}`] ?? null)
  }
  const values: Record<string, unknown> = { kind: domain.kind, status: domain.status }
  if (change.kind === 'DOMAIN_RENEWAL') {
    values.releasedAt = domain.releasedAt ?? null
    values.renewDueAt = domain.renewDueAt ?? null
  } else if (change.kind === 'DOMAIN_FORCE_RELEASE') {
    Object.assign(values, releaseFingerprintParts(domain.id))
  }
  return hashed(domain.id, values)
}

/** Seeds or clears one grant, as another administrator would between preview and apply. */
export function setBulkGrant(targetId: string, userId: string, role: Schemas['ResourceRole'] | null) {
  if (role) grants[`${targetId}:${userId}`] = role
  else delete grants[`${targetId}:${userId}`]
}

/** The target types each kind accepts, as the server's enum declares them. */
const KIND_TARGETS: Record<Schemas['AdminBulkChangeKind'], Schemas['AdminBulkChangeTargetType'][]> = {
  LLM_KEY_LIMITS: ['LLM_KEY'],
  LLM_KEY_STATUS: ['LLM_KEY'],
  LLM_KEY_EXPIRY: ['LLM_KEY'],
  VM_PERIOD: ['VM'],
  VM_POWER: ['VM'],
  VM_DELETION: ['VM'],
  DOMAIN_RENEWAL: ['DOMAIN'],
  DOMAIN_FORCE_RELEASE: ['DOMAIN'],
  DOMAIN_VERIFY: ['DOMAIN'],
  ACCESS: ['LLM_KEY', 'VM', 'DOMAIN', 'GPU_ALLOCATION'],
}

/** The spec member each kind fills, as the server names it. */
const KIND_MEMBERS: Record<Schemas['AdminBulkChangeKind'], keyof Schemas['AdminBulkChangeSpec']> = {
  LLM_KEY_LIMITS: 'llmKeyLimits',
  LLM_KEY_STATUS: 'llmKeyStatus',
  LLM_KEY_EXPIRY: 'llmKeyExpiry',
  VM_PERIOD: 'vmPeriod',
  VM_POWER: 'vmPower',
  VM_DELETION: 'vmDeletion',
  DOMAIN_RENEWAL: 'domainRenewal',
  DOMAIN_FORCE_RELEASE: 'domainForceRelease',
  DOMAIN_VERIFY: 'domainVerify',
  ACCESS: 'access',
}

/**
 * The checks the server makes on the request as a whole. The kind's own
 * checks run only when these pass, as the server skips them otherwise.
 */
function validateRequest(body: Request_): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = []
  const change = body.change
  if (!KIND_TARGETS[change.kind]?.includes(body.targetType)) {
    errors.push({
      field: 'targetType',
      message: `이 변경 종류는 ${body.targetType} 대상에 쓸 수 없습니다.`,
    })
  }
  if (new Set(body.targetIds).size !== body.targetIds.length) {
    errors.push({ field: 'targetIds', message: '같은 대상을 두 번 지정했습니다.' })
  }
  for (const [kind, member] of Object.entries(KIND_MEMBERS)) {
    const present = change[member] != null
    if (kind === change.kind && !present) {
      errors.push({ field: `change.${member}`, message: '이 변경 종류의 내용을 채워 주세요.' })
    } else if (kind !== change.kind && present) {
      errors.push({ field: `change.${member}`, message: '변경 종류와 다른 내용은 보낼 수 없습니다.' })
    }
  }
  return errors
}

function validate(body: Request_): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = []
  const change = body.change
  if (change.kind === 'DOMAIN_RENEWAL') {
    const due = change.domainRenewal?.renewDueAt
    if (!due) {
      errors.push({ field: 'change.domainRenewal.renewDueAt', message: '새 사용 기한을 지정해 주세요.' })
    } else if (Date.parse(due) <= Date.now()) {
      errors.push({
        field: 'change.domainRenewal.renewDueAt',
        message: '지난 시각으로는 옮길 수 없습니다. 지금 회수하려면 강제 해제를 쓰세요.',
      })
    }
  }
  if (change.kind === 'LLM_KEY_LIMITS') {
    const limits = change.llmKeyLimits
    if (!limits || Object.keys(limits).length === 0) {
      errors.push({ field: 'change.llmKeyLimits', message: '바꿀 한도를 하나 이상 지정해 주세요.' })
    }
  }
  if (change.kind === 'LLM_KEY_STATUS' && change.llmKeyStatus?.action === 'SUSPEND' && !change.llmKeyStatus.reason?.trim()) {
    errors.push({ field: 'change.llmKeyStatus.reason', message: '정지 사유를 입력해 주세요.' })
  }
  if (change.kind === 'LLM_KEY_EXPIRY' && (change.llmKeyExpiry?.endDate ?? '') < kstDateString()) {
    errors.push({ field: 'change.llmKeyExpiry.endDate', message: '종료일은 오늘 이후여야 합니다.' })
  }
  if (change.kind === 'ACCESS' && change.access?.action !== 'REVOKE' && change.access?.role == null) {
    errors.push({ field: 'change.access.role', message: '부여할 등급을 지정해 주세요.' })
  }
  return errors
}

interface Resolved {
  targetId: string
  name: string | null
  reach: Reason | null
  judgement: Judgement | null
  fingerprint: string
}

function resolve(profile: Profile, body: Request_): Resolved[] {
  return body.targetIds.map((targetId) => {
    const missing: Resolved = {
      targetId,
      name: null,
      reach: 'NOT_FOUND',
      judgement: null,
      fingerprint: 'none',
    }
    let target: Target | undefined
    let name: string | undefined
    let reach: Reason | null = null
    let judge: () => Judgement
    let fingerprint = () => fingerprintOf(target!, body.change)
    if (body.targetType === 'LLM_KEY') {
      const key = adminLlmKeyStore.find((item) => item.id === targetId)
      if (!key) return missing
      target = key
      name = key.name
      reach = reachKey(profile, key, body.change)
      judge = () => judgeKey(profile, key, body.change)
    } else if (body.targetType === 'VM') {
      const vm = vmStore.find((item) => item.id === targetId)
      if (!vm) return missing
      target = vm
      name = vm.name
      reach = reachVm(profile, vm, body.change)
      judge = () => judgeVm(vm, body.change)
    } else if (body.targetType === 'DOMAIN') {
      const domain = findAdminDomain(targetId)
      if (!domain) return missing
      target = domain
      name = domain.fqdn
      reach = reachDomain(profile, domain, body.change)
      judge = () => judgeDomain(domain, body.change)
      fingerprint = () => domainFingerprintOf(domain, body.change)
    } else {
      return missing
    }
    const shown = reach === 'NOT_FOUND' ? null : name
    if (reach) return { targetId, name: shown, reach, judgement: null, fingerprint: 'none' }
    return {
      targetId,
      name: shown,
      reach: null,
      judgement: judge(),
      fingerprint: fingerprint(),
    }
  })
}

export const bulkChangeHandlers: RequestHandler[] = [
  http.post('*/api/v1/admin/bulk-changes/preview', async ({ request }) => {
    const profile = adminActor(request)
    if (!profile) return new HttpResponse(null, { status: 401 })
    if (!OPERATE.includes(profile.role)) return forbidden('/api/v1/admin/bulk-changes/preview')
    const body = (await request.json()) as Request_
    bulkPreviewBodies.push(body)
    const errors = validateRequest(body)
    if (errors.length === 0) errors.push(...validate(body))
    if (errors.length > 0) return validation('/api/v1/admin/bulk-changes/preview', errors)
    const items: Schemas['AdminBulkChangePreviewItem'][] = resolve(profile, body).map((entry) => {
      const reason = entry.reach ?? entry.judgement?.reason ?? null
      return {
        targetId: entry.targetId,
        name: entry.name,
        applicable: reason == null,
        reason,
        fields: reason == null ? (entry.judgement?.fields ?? []) : [],
        fingerprint: entry.fingerprint,
      }
    })
    return HttpResponse.json({ items } satisfies Schemas['AdminBulkChangePreviewResponse'])
  }),

  http.post('*/api/v1/admin/bulk-changes', async ({ request }) => {
    const profile = adminActor(request)
    if (!profile) return new HttpResponse(null, { status: 401 })
    if (!OPERATE.includes(profile.role)) return forbidden('/api/v1/admin/bulk-changes')
    const body = (await request.json()) as Request_
    bulkApplyBodies.push(body)
    const errors = validateRequest(body)
    if (!body.fingerprints || body.targetIds.some((id) => body.fingerprints?.[id] == null)) {
      errors.push({
        field: 'fingerprints',
        message: '모든 대상의 fingerprint를 미리보기에서 받은 대로 보내 주세요.',
      })
    }
    if (errors.length === 0) errors.push(...validate(body))
    if (errors.length > 0) return validation('/api/v1/admin/bulk-changes', errors)
    const items: Schemas['AdminBulkChangeApplyItem'][] = resolve(profile, body).map((entry) => {
      const base = { targetId: entry.targetId, name: entry.name, fields: [] as Diff[] }
      if (entry.reach) return { ...base, result: 'SKIPPED', reason: entry.reach }
      if (entry.fingerprint !== body.fingerprints![entry.targetId]) {
        return { ...base, result: 'STALE', reason: null }
      }
      const judgement = entry.judgement!
      if (judgement.reason) return { ...base, result: 'SKIPPED', reason: judgement.reason }
      if (judgement.fields.length === 0) return { ...base, result: 'UNCHANGED', reason: null }
      judgement.write?.()
      return { ...base, result: 'APPLIED', reason: null, fields: judgement.fields }
    })
    return HttpResponse.json({
      batchId: '00000000-0000-4000-8000-00000000b001',
      items,
    } satisfies Schemas['AdminBulkChangeApplyResponse'])
  }),

  http.patch('*/api/v1/admin/llm/keys/:keyId/expiry', async ({ params, request }) => {
    const profile = adminActor(request)
    const key = adminLlmKeyStore.find((item) => item.id === String(params.keyId))
    const role = profile && key ? activeAdminRole(profile, key.orgId) : undefined
    const instance = `/api/v1/admin/llm/keys/${String(params.keyId)}/expiry`
    if (!profile || !key || !role || !OPERATE.includes(role)) {
      return problemResponse({
        type: 'about:blank',
        title: '리소스를 찾을 수 없습니다',
        status: 404,
        detail: 'LLM API 키를 찾을 수 없습니다.',
        instance,
        code: 'RESOURCE_NOT_FOUND',
      })
    }
    const body = (await request.json()) as Schemas['AdminLlmKeyExpiryRequest']
    expiryBodies.push({ keyId: key.id, endDate: body.endDate })
    if (body.endDate < kstDateString()) {
      return validation(instance, [{ field: 'endDate', message: '종료일은 오늘 이후여야 합니다.' }])
    }
    const expiresAt = nextDayKst(body.endDate)
    if (key.status === 'REVOKED' || extendsPaidKey(key, expiresAt)) {
      return problemResponse({
        type: 'about:blank',
        title: '키 상태가 올바르지 않습니다',
        status: 409,
        detail: key.status === 'REVOKED'
          ? '폐기된 키의 만료일은 바꿀 수 없습니다.'
          : '유료 모델 키의 만료 연장은 아직 지원하지 않습니다. 공급자가 키의 만료일을 발급 시점에 고정하기 때문이며, 앞당기는 것은 가능합니다.',
        instance,
        code: 'LLM_KEY_INVALID_STATE',
      })
    }
    key.expiresAt = expiresAt
    if (key.status === 'EXPIRED') key.status = 'ACTIVE'
    return HttpResponse.json(key)
  }),
]
