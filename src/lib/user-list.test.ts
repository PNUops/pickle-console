import { expect, test } from 'vitest'
import { uuid } from '../test/msw/ids'
import { userListParams, userListState, userSupportReturn } from './user-list'

test('user directory canonicalization preserves independent filters and exposes malformed selected IDs', () => {
  const selected = 'DEADBEEF-0000-4000-8000-000000000001'
  const state = userListState(new URLSearchParams(`org=${uuid(1)}&status=bogus&role=forged&filterOrg=bad&sort=unsafe&page=-1&selected=${selected}`))
  expect(state.status).toBeUndefined()
  expect(state.role).toBeUndefined()
  expect(state.filterOrgId).toBeUndefined()
  expect(state.sort).toBeUndefined()
  expect(state.page).toBe(0)
  expect(userListParams(state, uuid(1)).toString()).toBe(`org=${uuid(1)}&selected=${selected.toLowerCase()}`)
  expect(userListState(new URLSearchParams('selected=invalid')).selectedId).toBe('invalid')
})

test('support returns only to an allowed scoped directory or workspace origin without nested redirects', () => {
  const fallback = `/admin/users?org=${uuid(1)}`
  for (const value of ['https://outside.invalid', '//outside.invalid', '/\\outside.invalid', '/admin/vms', `/admin/users?org=${uuid(2)}`, '/admin/workspaces#unsafe']) {
    expect(userSupportReturn(value, uuid(1))).toBe(fallback)
  }
  expect(userSupportReturn(`/admin/users?status=DISABLED&page=2&returnTo=https://outside.invalid`, uuid(1)))
    .toBe(`/admin/users?org=${uuid(1)}&status=DISABLED&page=2`)
  expect(userSupportReturn(`/admin/workspaces?org=${uuid(1)}&workspaceId=${uuid(12)}&tab=members`, uuid(1)))
    .toBe(`/admin/workspaces?org=${uuid(1)}&workspaceId=${uuid(12)}&tab=members`)
  expect(userSupportReturn('/admin/users?status=DISABLED&page=2', uuid(1), true))
    .toBe('/admin/users?status=DISABLED&page=2')
})
