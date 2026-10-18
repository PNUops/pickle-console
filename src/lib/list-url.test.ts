import { expect, test } from 'vitest'
import { listPage, requestDetailReturn, requestListParams, requestListReturn, requestListState, updateListParams } from './list-url'
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

test('request search and stored end-date filters obey their exact API limits', () => {
  const state = requestListState(new URLSearchParams(`q=${'a'.repeat(101)}&requestedEndFrom=2026-02-30&requestedEndTo=2026-12-31&reqIndefinite=false&relatedUserId=${uuid(42)}`))
  expect(state.q).toHaveLength(100)
  expect(state.requestedEndFrom).toBeUndefined()
  expect(state.requestedEndTo).toBe('2026-12-31')
  expect(state.reqIndefinite).toBe(false)
  expect(state.relatedUserId).toBe(uuid(42))
  expect(requestListState(new URLSearchParams('reqIndefinite=maybe&relatedUserId=not-a-user')).relatedUserId).toBeUndefined()
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

test('indefinite request filters discard conflicting bounds in state, serialization and returns', () => {
  const mixed = `org=${uuid(1)}&requestedEndFrom=2026-12-31&requestedEndTo=2026-12-01&reqIndefinite=true`
  const state = requestListState(new URLSearchParams(mixed))
  expect(state).toMatchObject({ reqIndefinite: true, requestedEndFrom: undefined, requestedEndTo: undefined })
  const expected = `org=${uuid(1)}&reqIndefinite=true`
  expect(requestListParams({ ...state, requestedEndFrom: '2026-12-31', requestedEndTo: '2026-12-01' }, uuid(1)).toString()).toBe(expected)
  expect(requestListReturn(`/admin/requests?${mixed}`, uuid(1), false)).toBe(`/admin/requests?${expected}`)
})

test('resource return paths preserve only readable request destinations and canonical list filters', () => {
  const list = `/admin/requests?org=${uuid(1)}&q=course&status=all`
  const request = `/admin/requests/${uuid(201)}?org=${uuid(1)}&returnTo=${encodeURIComponent(list)}`
  const returned = new URL(requestDetailReturn(request, uuid(1), false)!, 'https://pickle.invalid')
  expect(returned.pathname).toBe(`/admin/requests/${uuid(201)}`)
  expect(returned.searchParams.get('returnTo')).toBe(`/admin/requests?org=${uuid(1)}&status=all&q=course`)
  expect(requestDetailReturn(request, uuid(2), false)).toBeNull()
  for (const value of ['https://evil.invalid', `/admin/requests/${uuid(201)}?org=bad`, '/admin/vms', `/admin/requests/${uuid(201)}#unexpected`]) expect(requestDetailReturn(value, uuid(1), true)).toBeNull()
})

test('valid UUID target casing is canonical while malformed targets remain visible for rejection', () => {
  const id = 'deadbeef-0000-4000-8000-000000000001'
  expect(workspaceListState(new URLSearchParams(`workspaceId=${id.toUpperCase()}`)).selectedId).toBe(id)
  expect(workspaceListState(new URLSearchParams('workspaceId=bad')).selectedId).toBe('bad')
})

test('workspace filtering sorts the complete array without mutating its source', () => {
  const rows = [
    { id: uuid(31), name: '수업10', metadataVisible: true, allowedWorkIds: [], kind: 'COURSE' as const, memberCount: 2, createdAt: '2026-09-02T00:00:00Z' },
    { id: uuid(32), name: '수업2', metadataVisible: true, allowedWorkIds: [], kind: 'COURSE' as const, memberCount: 9, createdAt: '2026-09-01T00:00:00Z' },
    { id: uuid(33), name: '팀', metadataVisible: true, allowedWorkIds: [], kind: 'PROJECT' as const, memberCount: 4, createdAt: '2026-09-03T00:00:00Z' },
  ]
  expect(filterWorkspaces(rows, workspaceListState(new URLSearchParams('q=수업&kind=COURSE'))).map((row) => row.name))
    .toEqual(['수업2', '수업10'])
  expect(filterWorkspaces(rows, workspaceListState(new URLSearchParams('sort=members-desc'))).map((row) => row.memberCount))
    .toEqual([9, 4, 2])
  expect(rows.map((row) => row.name)).toEqual(['수업10', '수업2', '팀'])
})
