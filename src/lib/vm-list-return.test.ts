import { expect, test } from 'vitest'
import { orgAdminProfile } from '../test/msw/handlers/auth'
import { mockAuthorityActor } from '../test/msw/institution-authority'
import { requestReaderKey } from '../api/request-review'
import { uuid } from '../test/msw/ids'
import { vmListReturn, type VmListReturn } from './vm-list-return'

const actor = mockAuthorityActor(orgAdminProfile)
const reader = requestReaderKey(actor)
const context: VmListReturn = {
  reader,
  path: `/admin/vms?workspaceId=${uuid(15)}&org=${uuid(1)}`,
  filters: { status: 'RUNNING', workspaceId: uuid(15), qInput: 'algo', sort: '-name', page: 2 },
}

test('keeps local filters separately from the list cross-link and management scope', () => {
  expect(vmListReturn(context, reader, uuid(1))).toEqual(context)
  const cleared = { ...context, filters: { ...context.filters, workspaceId: undefined } }
  expect(vmListReturn(cleared, reader, uuid(1))?.filters.workspaceId).toBeUndefined()
})

test('restores a global list only when the reader can return to a global scope', () => {
  const global = { ...context, path: '/admin/vms' }
  expect(vmListReturn(global, reader, uuid(1), true)).toEqual(global)
  expect(vmListReturn(global, reader, uuid(1), false)).toBeNull()
  expect(vmListReturn({ ...context, path: `/admin/vms?org=${uuid(2)}` }, reader, uuid(1), true)).toBeNull()
})

test('discards prior accounts, actual roles and authority fingerprints', () => {
  for (const changed of [
    { ...actor, id: uuid(6) },
    { ...actor, role: 'SYS_VIEWER' },
    { ...actor, institutionAuthority: { ...actor.institutionAuthority!, authorityFingerprint: 'changed-current-authority' } },
  ]) expect(vmListReturn(context, requestReaderKey(changed), uuid(1), true)).toBeNull()
})

test('rejects external destinations, unrelated routes and ambiguous list scopes', () => {
  for (const path of ['https://outside.invalid', '//outside.invalid', '/\\outside.invalid', '/admin/users',
    '/admin/vms#unexpected', '/admin/vms?org=bad', '/admin/vms?workspaceId=bad',
    `/admin/vms?org=${uuid(1)}&org=${uuid(1)}`, '/admin/vms?returnTo=/admin/users']) {
    expect(vmListReturn({ ...context, path }, reader, uuid(1), true)).toBeNull()
  }
})

test('rejects malformed snapshots before their filters can reach list queries', () => {
  for (const value of [null, [], 1, 'state', {}, { ...context, filters: null },
    ...[{ page: -1 }, { page: 1.1 }, { page: 2_147_483_648 }, { page: '2' }, { qInput: 10 },
      { status: 'UNKNOWN' }, { status: null }, { sort: 'owner' }, { workspaceId: 'bad' }]
      .map((filters) => ({ ...context, filters: { ...context.filters, ...filters } }))]) {
    expect(vmListReturn(value, reader, uuid(1), true)).toBeNull()
  }
})

test('display affiliation hints do not replace the authority fingerprint', () => {
  expect(vmListReturn(context, requestReaderKey({ ...actor, managedOrgs: [] }), uuid(1), true)).toEqual(context)
})
