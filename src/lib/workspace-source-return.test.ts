import { expect, test } from 'vitest'
import { workspaceSourceReturn } from './workspace-source-return'
import { uuid } from '../test/msw/ids'

test('an owner request returns only to its actual workspace detail', () => {
  const path = `/console/workspaces/${uuid(12)}`
  expect(workspaceSourceReturn(path, uuid(12), false)).toBe(path)
  for (const source of [null, '/console/workspaces', `/console/workspaces/${uuid(13)}`, `${path}?returnTo=/console/account`, `${path}#unsafe`, '//evil.invalid', '/\\evil.invalid']) {
    expect(workspaceSourceReturn(source, uuid(12), false)).toBeNull()
  }
})

test('a support request preserves the exact workspace drawer and canonical source filters across institutions', () => {
  const source = `/admin/workspaces?org=${uuid(2)}&q=course&kind=COURSE&sort=name-desc&page=3&workspaceId=${uuid(12)}&tab=invitations&inspect=1&returnTo=https://evil.invalid`
  const returned = new URL(workspaceSourceReturn(source, uuid(12), true)!, 'https://pickle.invalid')
  expect(returned.pathname).toBe('/admin/workspaces')
  expect(Object.fromEntries(returned.searchParams)).toEqual({ org: uuid(2), q: 'course', kind: 'COURSE', sort: 'name-desc', page: '3', workspaceId: uuid(12), tab: 'invitations', inspect: '1' })
  expect(workspaceSourceReturn(`/admin/workspaces?workspaceId=${uuid(12)}`, uuid(12), true)).toBe(`/admin/workspaces?workspaceId=${uuid(12)}&inspect=1`)
})

test('support return paths reject unrelated workspaces and malformed destinations', () => {
  for (const source of ['https://evil.invalid', '//evil.invalid', '/admin/users', '/admin/workspaces', `/admin/workspaces?workspaceId=${uuid(13)}`, `/admin/workspaces?workspaceId=${uuid(12)}&org=bad`, `/admin/workspaces?workspaceId=${uuid(12)}#unsafe`]) {
    expect(workspaceSourceReturn(source, uuid(12), true)).toBeNull()
  }
  expect(workspaceSourceReturn(`/admin/workspaces?workspaceId=${uuid(12)}`, null, true)).toBeNull()
})
