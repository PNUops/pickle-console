import { describe, expect, test } from 'vitest'
import { hasWork, type AuthorityActor, type InstitutionPermission } from '../auth/institution-authority'
import { MOCK_WORK_CATALOGUE } from '../test/msw/institution-authority'
import { uuid } from '../test/msw/ids'
import { evaluateOrgOperations, orgOperationPermissions } from '../test/msw/handlers/org-operations'
import { permissionInput, permissionProblem, permissionRole, permissionSaveBody, selectedFromFull } from './org-operations'

describe('Explicit institution permission drafts', () => {
  test('all registered selectable work stays SELECTED and never delegates', () => {
    const input = selectedFromFull(MOCK_WORK_CATALOGUE, 17)
    expect(input.mode).toBe('SELECTED')
    expect(input.work).toHaveLength(85)
    expect(input.work).not.toContain('institution.delegate')
    expect(input.work).toContain('institution.account.finance.read')
    expect(input.work).toContain('llm.key.cost.read')
    expect(permissionRole(input, MOCK_WORK_CATALOGUE)).toBe('기관 운영자')
    expect(Object.keys(input.scopes).sort()).toEqual(['DOMAIN', 'GPU', 'LLM', 'VM', 'WORKSPACE'])
    const actor: AuthorityActor = { role: 'ORG_MANAGER', institutionAuthority: { state: 'VALID_SOURCES', failure: null, accountRole: 'ORG_MANAGER', catalogueRevision: '4', authorityFingerprint: 'synthetic-selected', catalogue: MOCK_WORK_CATALOGUE,
      assignments: [{ institutionId: uuid(1), institutionName: 'Synthetic institution', permission: { ...input, revision: input.expectedRevision } }] } }
    expect(hasWork(actor, 'institution.delegate', { orgId: uuid(1) })).toBe(false)
  })

  test('new catalogue entries do not change a previous selected snapshot', () => {
    const input = selectedFromFull(MOCK_WORK_CATALOGUE, 1)
    const extended = [...MOCK_WORK_CATALOGUE, { ...MOCK_WORK_CATALOGUE[0], id: 'synthetic.future.work' }]
    expect(permissionProblem(input, extended)).toBeNull()
    expect(input.work).not.toContain('synthetic.future.work')
  })

  test('empty listed and retained deleted identifiers survive immutable round trips', () => {
    const original: InstitutionPermission = { mode: 'SELECTED', work: ['vm.period', 'llm.state.operate'], scopes: { VM: { mode: 'LISTED', workspaceIds: [uuid(9900)] }, LLM: { mode: 'LISTED', workspaceIds: [] } }, revision: 8 }
    const draft = permissionInput(original)
    expect(permissionProblem(draft, MOCK_WORK_CATALOGUE)).toBeNull()
    draft.scopes.VM!.workspaceIds.length = 0
    expect(original.scopes.VM!.workspaceIds).toEqual([uuid(9900)])
    expect(draft.scopes.LLM).toEqual({ mode: 'LISTED', workspaceIds: [] })
  })

  test('a selected group must explicitly choose scope and unknown work fails closed', () => {
    expect(permissionProblem({ mode: 'SELECTED', work: ['vm.power'], scopes: {}, expectedRevision: 0 }, MOCK_WORK_CATALOGUE)).toContain('범위를 명시적으로')
    expect(permissionProblem({ mode: 'SELECTED', work: ['unknown.job'], scopes: {}, expectedRevision: 0 }, MOCK_WORK_CATALOGUE)).toContain('등록된 선택 업무')
    expect(permissionProblem({ mode: 'SELECTED', work: [], scopes: {}, expectedRevision: 0 }, MOCK_WORK_CATALOGUE)).toContain('하나 이상')
  })

  test('source CAS includes a removed row and never sends a role input', () => {
    const before = evaluateOrgOperations(uuid(1))!
    const first = before.members[0]
    orgOperationPermissions[`${first.userId}:${uuid(1)}`] = { ...first.permission!, revision: 44 }
    const baseline = evaluateOrgOperations(uuid(1))!
    const body = permissionSaveBody(baseline, [], 'Remove source')
    expect(body.expectedPermissionRevisions).toEqual({ [first.userId]: 44 })
    expect(body.members).toEqual([])
    expect(body).not.toHaveProperty('role')
  })

  test('hidden permission cannot fabricate a FULL source revision', () => {
    const baseline = evaluateOrgOperations(uuid(1))!
    baseline.members[0].permission = null
    expect(() => permissionSaveBody(baseline, [], '')).toThrow('원천 버전')
  })
})
