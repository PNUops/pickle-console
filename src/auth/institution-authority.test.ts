import { describe, expect, test } from 'vitest'
import { hasAnyWork, hasSameSourceWorks, hasWork, rowAllows, type AuthorityActor, type InstitutionGrant } from './institution-authority'
import { canVisitAdministration } from './admin-navigation'
import { MOCK_WORK_CATALOGUE } from '../test/msw/institution-authority'

function source(institutionId: string, work: string[], workspaceIds: string[]): InstitutionGrant {
  return { institutionId, institutionName: institutionId,
    permission: { mode: 'SELECTED', work, revision: 1, scopes: { LLM: { mode: 'LISTED', workspaceIds } } } }
}
function actor(assignments: InstitutionGrant[]): AuthorityActor {
  return { role: 'ORG_MANAGER', institutionAuthority: { state: 'VALID_SOURCES', failure: null, accountRole: 'ORG_MANAGER',
    catalogueRevision: '4', authorityFingerprint: 'synthetic', assignments, catalogue: MOCK_WORK_CATALOGUE } }
}

describe('institution work decisions', () => {
  test('display roles and invalid contexts never invent authority', () => {
    expect(hasAnyWork({ role: 'ORG_ADMIN' }, ['notice.manage'])).toBe(false)
    const invalid = actor([source('A', ['notice.manage'], [])])
    invalid.institutionAuthority!.state = 'INVALID'
    expect(hasWork(invalid, 'notice.manage')).toBe(false)
  })

  test('a source keeps its institution and shared group scope together', () => {
    const user = actor([source('A', ['llm.token.operate'], ['one']), source('B', ['llm.observe'], ['two'])])
    expect(hasWork(user, 'llm.token.operate', { orgId: 'A', workspaceId: 'one' })).toBe(true)
    expect(hasWork(user, 'llm.token.operate', { orgId: 'A', workspaceId: 'two' })).toBe(false)
    expect(hasWork(user, 'llm.token.operate', { orgId: 'B', workspaceId: 'one' })).toBe(false)
    expect(hasWork(user, 'llm.token.operate', { orgId: 'A' })).toBe(false)
  })

  test('selecting every work remains selected and cannot borrow FULL finance', () => {
    const selected = source('A', MOCK_WORK_CATALOGUE.filter((work) => work.selectable).map((work) => work.id), ['one'])
    const user = actor([selected])
    expect(hasWork(user, 'llm.key.cost.read', { orgId: 'B', workspaceId: 'one' })).toBe(false)
    expect(hasWork(user, 'institution.delegate', { orgId: 'A' })).toBe(false)
    user.institutionAuthority!.assignments.push({ institutionId: 'C', institutionName: 'C', permission: { mode: 'FULL', work: [], scopes: {}, revision: 2 } })
    expect(hasWork(user, 'llm.key.cost.read', { orgId: 'B', workspaceId: 'one' })).toBe(true)
    expect(hasWork(user, 'llm.key.budget', { orgId: 'B', workspaceId: 'one' })).toBe(false)
    expect(hasWork(user, 'llm.key.cost.read', { orgId: 'B' })).toBe(false)
    expect(hasWork(user, 'llm.key.cost.read', { orgId: null, workspaceId: 'one' })).toBe(true)
    expect(hasWork(user, 'llm.key.cost.read', { workspaceId: 'one' })).toBe(false)
    expect(hasWork(actor([selected]), 'llm.key.cost.read', { orgId: null, workspaceId: 'one' })).toBe(false)
  })

  test('paid roster requirements cannot be assembled across two sources', () => {
    const user = actor([source('A', ['llm.roster.issue'], ['one']), source('B', ['llm.key.budget'], ['one'])])
    expect(hasSameSourceWorks(user, ['llm.roster.issue', 'llm.key.budget'], { orgId: 'A', workspaceId: 'one' })).toBe(false)
    user.institutionAuthority!.assignments[0].permission.work.push('llm.key.budget')
    expect(hasSameSourceWorks(user, ['llm.roster.issue', 'llm.key.budget'], { orgId: 'A', workspaceId: 'one' })).toBe(true)
  })

  test('explicit global support keeps workspace limits but not resource institution ownership', () => {
    const user = actor([source('A', ['llm.observe.support.read'], ['one'])])
    expect(hasWork(user, 'llm.observe.support.read', { orgId: 'B', workspaceId: 'one' })).toBe(true)
    expect(hasWork(user, 'llm.observe.support.read', { orgId: 'B', workspaceId: 'two' })).toBe(false)
    user.institutionAuthority!.assignments[0].permission.scopes.LLM!.workspaceIds = []
    expect(hasAnyWork(user, ['llm.observe.support.read'])).toBe(false)
  })

  test('row decisions and SYS operation subsets are explicit', () => {
    expect(rowAllows({ allowedWorkIds: ['vm.period'] }, 'vm.power')).toBe(false)
    expect(rowAllows({}, 'vm.period')).toBe(false)
    expect(hasWork({ role: 'SYS_MANAGER' }, 'notice.manage', {}, ['SYS_ADMIN'])).toBe(false)
    expect(hasWork({ role: 'SYS_MANAGER' }, 'vm.power', {}, ['SYS_MANAGER', 'SYS_ADMIN'])).toBe(true)
  })
})

test.each([
  ['gpu.metadata.read', 'GPU', '/admin/expiry'],
  ['vm.metadata.support.read', 'VM', '/admin/domains'],
] as const)('the reference route %s retains its independently granted surface', (work, group, route) => {
  const user = actor([{ institutionId: 'A', institutionName: 'A', permission: { mode: 'SELECTED', work: [work], revision: 1, scopes: { [group]: { mode: 'ALL', workspaceIds: [] } } } }])
  expect(canVisitAdministration(user, route)).toBe(true)
  expect(canVisitAdministration(user, '/admin/settings')).toBe(false)
})
