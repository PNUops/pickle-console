import { expect, test } from 'vitest'
import { keyListState, llmExplorationReturn, responseUsageDays } from './llm-exploration'

test.each([
  ['2026-09-01', '2026-09-30', 30],
  ['2028-02-29', '2028-03-01', 2],
  ['2026-02-31', '2026-03-03', null],
  ['2026-09-30', '2026-09-01', null],
  ['2026-01-01', '2026-04-01', null],
])('a usage detail day count comes from valid displayed response dates (%s, %s)', (from, to, expected) => {
  expect(responseUsageDays(from as string, to as string)).toBe(expected)
})

test('key exploration parses the complete owned query without dropping the request or policy relation', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const parsed = keyListState(new URLSearchParams({ workspaceId: id, requestId: id, openrouterAccountId: id,
    status: 'ACTIVE', q: 'Synthetic search', cohort: 'COMMITTED', sort: 'NAME_ASC', page: '2', policyModel: 'pickle-general', policyFeature: 'chat' }))
  expect(parsed.error).toBeNull()
  expect(parsed.query).toMatchObject({ workspaceId: id, requestId: id, openrouterAccountId: id, status: 'ACTIVE', query: 'Synthetic search',
    cohort: 'COMMITTED', sort: 'NAME_ASC', page: 2, policyModel: 'pickle-general', policyFeature: 'chat' })
})

test.each(['https://example.invalid/admin/llm/keys', '//example.invalid/admin/llm/keys', '/admin/llm/keys#fragment', '/admin/llm/accounts/not-a-uuid'])('an unsafe or unrelated exploration return is rejected (%s)', (value) => {
  expect(llmExplorationReturn(value, undefined, true)).toBeNull()
})

test('a non-global reader never restores a different institution while a permitted exact return keeps its full query', () => {
  const org = '00000000-0000-4000-8000-000000000001'
  const other = '00000000-0000-4000-8000-000000000002'
  expect(llmExplorationReturn(`/admin/llm/keys?org=${other}`, org, false)).toBeNull()
  const same = `/admin/llm/keys?org=${org}&cohort=COMMITTED&sort=NAME_ASC&q=scope&page=2`
  expect(llmExplorationReturn(same, org, false)).toBe(same)
})
