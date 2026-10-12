import { expect, test } from 'vitest'
import { listPage, requestListReturn, requestListState, updateListParams } from './list-url'
import { filterWorkspaces, workspaceListState } from './workspace-list'
import { uuid } from '../test/msw/ids'

test('malformed pages and unsupported request filters never reach the API', () => {
  for (const value of [null, '-1', '1.2', 'NaN', 'Infinity', '2147483648', '1e2']) expect(listPage(value)).toBe(0)
  expect(listPage('12')).toBe(12)
  expect(requestListState(new URLSearchParams('status=bogus&type=secret&page=-3')))
    .toMatchObject({ status: 'SUBMITTED', type: undefined, page: 0 })
  expect(requestListState(new URLSearchParams('status=all&type=DOMAIN&page=2')))
    .toMatchObject({ status: undefined, type: 'DOMAIN', page: 2 })
})

test('filter updates preserve institution and reset only the requested page state', () => {
  expect(updateListParams(new URLSearchParams(`org=${uuid(1)}&page=3&sort=name-desc`), { q: '수업' }, true).toString())
    .toBe(`org=${uuid(1)}&sort=name-desc&q=${encodeURIComponent('수업')}`)
})

test('return links accept only request lists in the current scope or a SYS global origin', () => {
  const fallback = `/admin/requests?org=${uuid(1)}`
  for (const value of ['https://evil.invalid', '//evil.invalid', '/\\evil.invalid', '/admin/users', `/admin/requests?org=${uuid(2)}`]) {
    expect(requestListReturn(value, uuid(1), false)).toBe(fallback)
  }
  expect(requestListReturn('/admin/requests?status=all&type=VM&page=2&returnTo=/admin/users#danger', uuid(1), true))
    .toBe('/admin/requests?status=all&type=VM&page=2')
  expect(requestListReturn('/admin/requests?status=all', uuid(1), false)).toBe(fallback)
  const org = 'deadbeef-0000-4000-8000-000000000001'
  expect(requestListReturn(`/admin/requests?org=${org.toUpperCase()}&status=APPROVED`, org, false))
    .toBe(`/admin/requests?org=${org}&status=APPROVED`)
})

test('valid UUID target casing is canonical while malformed targets remain visible for rejection', () => {
  const id = 'deadbeef-0000-4000-8000-000000000001'
  expect(workspaceListState(new URLSearchParams(`workspaceId=${id.toUpperCase()}`)).selectedId).toBe(id)
  expect(workspaceListState(new URLSearchParams('workspaceId=bad')).selectedId).toBe('bad')
})

test('workspace filtering sorts the complete array without mutating its source', () => {
  const rows = [
    { id: uuid(31), name: '수업10', kind: 'COURSE' as const, memberCount: 2, createdAt: '2026-09-02T00:00:00Z' },
    { id: uuid(32), name: '수업2', kind: 'COURSE' as const, memberCount: 9, createdAt: '2026-09-01T00:00:00Z' },
    { id: uuid(33), name: '팀', kind: 'PROJECT' as const, memberCount: 4, createdAt: '2026-09-03T00:00:00Z' },
  ]
  expect(filterWorkspaces(rows, workspaceListState(new URLSearchParams('q=수업&kind=COURSE'))).map((row) => row.name))
    .toEqual(['수업2', '수업10'])
  expect(filterWorkspaces(rows, workspaceListState(new URLSearchParams('sort=members-desc'))).map((row) => row.memberCount))
    .toEqual([9, 4, 2])
  expect(rows.map((row) => row.name)).toEqual(['수업10', '수업2', '팀'])
})
