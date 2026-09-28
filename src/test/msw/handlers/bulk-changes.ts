import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { isSysTier } from '../../../auth/permissions'
import { kstDateString } from '../../../lib/format'
import { problemResponse } from './auth'
import { activeAdminRole, adminActor, adminLlmKeyStore } from './llm-keys'
import { adminUserStore } from './users'
import { vmStore } from './vms'

type Schemas = components['schemas']
type Request_ = Schemas['AdminBulkChangeRequest']
type Reason = Schemas['AdminBulkChangeReason']
type Diff = Schemas['AdminBulkChangeFieldDiff']
type Profile = Schemas['UserProfileResponse']
type AdminKey = (typeof adminLlmKeyStore)[number]
type Vm = (typeof vmStore)[number]

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

function judgeAccess(targetId: string, change: Schemas['AdminBulkAccessChange']): Judgement {
  const user = adminUserStore.find((row) => row.id === change.userId && row.status === 'ACTIVE')
  if (!user) return refused('INELIGIBLE')
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
      return judgeAccess(key.id, change.access!)
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
      return judgeAccess(vm.id, change.access!)
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

/** Changes whenever anything on the target changes, like the server's hash. */
function fingerprintOf(target: AdminKey | Vm): string {
  let hash = 7
  for (const char of JSON.stringify(target)) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return `${target.id}:${hash}`
}

function validate(body: Request_): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = []
  const change = body.change
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
    const target =
      body.targetType === 'LLM_KEY'
        ? adminLlmKeyStore.find((key) => key.id === targetId)
        : body.targetType === 'VM'
          ? vmStore.find((vm) => vm.id === targetId)
          : undefined
    if (!target) {
      return { targetId, name: null, reach: 'NOT_FOUND', judgement: null, fingerprint: 'none' }
    }
    const isKey = body.targetType === 'LLM_KEY'
    const reach = isKey
      ? reachKey(profile, target as AdminKey, body.change)
      : reachVm(profile, target as Vm, body.change)
    const name = reach === 'NOT_FOUND' ? null : target.name
    if (reach) return { targetId, name, reach, judgement: null, fingerprint: 'none' }
    const judgement = isKey
      ? judgeKey(profile, target as AdminKey, body.change)
      : judgeVm(target as Vm, body.change)
    return { targetId, name, reach: null, judgement, fingerprint: fingerprintOf(target) }
  })
}

export const bulkChangeHandlers: RequestHandler[] = [
  http.post('*/api/v1/admin/bulk-changes/preview', async ({ request }) => {
    const profile = adminActor(request)
    if (!profile) return new HttpResponse(null, { status: 401 })
    const body = (await request.json()) as Request_
    bulkPreviewBodies.push(body)
    const errors = validate(body)
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
    const body = (await request.json()) as Request_
    bulkApplyBodies.push(body)
    const errors = validate(body)
    if (!body.fingerprints || body.targetIds.some((id) => body.fingerprints?.[id] == null)) {
      errors.push({
        field: 'fingerprints',
        message: '모든 대상의 fingerprint를 미리보기에서 받은 대로 보내 주세요.',
      })
    }
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
    if (!profile || !key || !role || (!isSysTier(profile.role) && !OPERATE.includes(role))) {
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
