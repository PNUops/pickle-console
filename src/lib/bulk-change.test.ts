import { describe, expect, test } from 'vitest'
import {
  bulkKindsFor,
  buildChange,
  clearingLists,
  emptyDraft,
  formFieldOf,
  formatDiffValue,
  kstLocalToIso,
  limitFieldsFor,
} from './bulk-change'
import { BULK_SELECTION_CAP, togglePage, toggleTarget } from './bulk-selection'
import { labelForBulkReason, labelForBulkResult } from './labels'

const target = (n: number) => ({ id: `id-${n}`, name: `name-${n}` })

describe('bulk selection', () => {
  test('toggling a page adds only missing rows and stops at the cap', () => {
    const almost = Array.from({ length: BULK_SELECTION_CAP - 1 }, (_, n) => target(n))
    const page = [target(0), target(500), target(501)]
    const { next, capped } = togglePage(almost, page, true)
    expect(next).toHaveLength(BULK_SELECTION_CAP)
    expect(next.at(-1)).toEqual(target(500))
    expect(capped).toBe(true)
  })

  test('clearing a page leaves other pages selected', () => {
    const { next } = togglePage([target(1), target(2)], [target(2)], false)
    expect(next).toEqual([target(1)])
  })

  test('a single row past the cap is refused', () => {
    const full = Array.from({ length: BULK_SELECTION_CAP }, (_, n) => target(n))
    expect(toggleTarget(full, target(999), true)).toEqual({ next: full, capped: true })
  })
})

describe('bulk change body', () => {
  test('only the chosen limits are sent, and an empty value means the default', () => {
    const draft = emptyDraft()
    draft.limits.chosen = ['rpm', 'dailyTokens']
    draft.limits.rpm = ''
    draft.limits.dailyTokens = '0'
    draft.limits.tpm = '999'
    expect(buildChange('LLM_KEY_LIMITS', draft)).toEqual({
      change: { kind: 'LLM_KEY_LIMITS', llmKeyLimits: { rpm: null, dailyTokens: 0 } },
      errors: null,
    })
  })

  test('choosing nothing is an error on the limits member', () => {
    expect(buildChange('LLM_KEY_LIMITS', emptyDraft()).errors).toEqual({
      'change.llmKeyLimits': '바꿀 항목을 하나 이상 골라 주세요.',
    })
  })

  test('clearing the end date sends clearEndDate alone', () => {
    const draft = emptyDraft()
    draft.period.mode = 'clear'
    draft.period.endDate = '2030-01-01'
    expect(buildChange('VM_PERIOD', draft).change).toEqual({
      kind: 'VM_PERIOD',
      vmPeriod: { clearEndDate: true },
    })
  })

  test('reads a datetime-local value as KST with or without seconds', () => {
    expect(kstLocalToIso('2030-01-01T09:30')).toBe('2030-01-01T00:30:00.000Z')
    expect(kstLocalToIso('2030-01-01T09:30:15')).toBe('2030-01-01T00:30:15.000Z')
  })

  test('warns per model list that a replace would empty', () => {
    const limits = { ...emptyDraft().limits, chosen: ['creditModels' as const], modelsOp: 'REPLACE' as const }
    expect(clearingLists({ ...limits, modelRules: '+openai/*' })).toMatchObject({ allowed: false, denied: true })
    expect(clearingLists({ ...limits, modelRules: '' })).toMatchObject({ allowed: true, denied: true })
    expect(clearingLists({ ...limits, modelsOp: 'ADD', modelRules: '' })).toMatchObject({ allowed: false, denied: false })
  })

  test('revoking access sends no role', () => {
    const draft = emptyDraft()
    draft.access = { userId: 'u', userLabel: 'x', action: 'REVOKE', role: 'EDITOR' }
    expect(buildChange('ACCESS', draft).change).toEqual({
      kind: 'ACCESS',
      access: { userId: 'u', action: 'REVOKE', role: null },
    })
  })

  test('server list errors land on the one model input', () => {
    expect(formFieldOf('change.llmKeyLimits.creditDeniedModels.values')).toBe(
      'change.llmKeyLimits.creditModels',
    )
    expect(formFieldOf('change.llmKeyLimits.creditAllowedModels.values[3]')).toBe(
      'change.llmKeyLimits.creditModels',
    )
    expect(formFieldOf('change.llmKeyLimits.passthroughEndpoints.values[0]')).toBe(
      'change.llmKeyLimits.passthroughEndpoints',
    )
    expect(formFieldOf('change.llmKeyLimits.passthroughEndpoints.values')).toBe(
      'change.llmKeyLimits.passthroughEndpoints',
    )
  })
})

describe('bulk change offers and labels', () => {
  test('roles are offered the kinds and fields the server lets them run', () => {
    expect(bulkKindsFor('llm-keys', 'ORG_MANAGER').map((k) => k.kind)).toEqual([
      'LLM_KEY_LIMITS',
      'LLM_KEY_STATUS',
      'LLM_KEY_EXPIRY',
    ])
    expect(bulkKindsFor('vms', 'SYS_MANAGER').map((k) => k.kind)).toEqual(['VM_PERIOD', 'VM_POWER'])
    expect(bulkKindsFor('vms', 'ORG_ADMIN').map((k) => k.kind)).toEqual([
      'VM_PERIOD',
      'VM_POWER',
      'VM_DELETION',
      'ACCESS',
    ])
    expect(bulkKindsFor('llm-keys', 'ORG_VIEWER')).toEqual([])
    expect(limitFieldsFor('SYS_MANAGER')).toEqual(['rpm', 'tpm', 'dailyTokens', 'concurrency'])
  })

  test('unknown codes and values render as themselves', () => {
    expect(labelForBulkReason('NOT_MEMBER')).toBe('워크스페이스 구성원 아님')
    expect(labelForBulkReason('SOMETHING_NEW')).toBe('SOMETHING_NEW')
    expect(labelForBulkResult('STALE')).toBe('미리보기 이후 변경됨')
    expect(labelForBulkResult('LATER')).toBe('LATER')
    expect(formatDiffValue('rpm', null)).toBe('서비스 기본값')
    expect(formatDiffValue('passthroughEndpoints', [])).toBe('부여 안 됨')
    expect(formatDiffValue('mystery', { a: 1 })).toBe('{"a":1}')
  })
})
