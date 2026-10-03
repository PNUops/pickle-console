import { describe, expect, test } from 'vitest'
import { noticeListReturn, noticeListWithoutSelection, noticeListWithSelection } from './notice-paths'
import { adminPaths } from './paths'
import { uuid } from '../test/msw/ids'

describe('Notice authoring return destinations', () => {
  test('accepts only the canonical notice list and normalizes supported query state', () => {
    expect(noticeListReturn(`/admin/notices?page=002&selected=${uuid(201)}&create=1&extra=ignored`, uuid(1))).toBe(adminPaths.notices(uuid(1), 2, uuid(201)))
    expect(noticeListReturn('/admin/notices?page=-2&selected=bad', undefined, true)).toBe('/admin/notices')
    expect(noticeListReturn(`/admin/notices?org=&page=2&selected=${uuid(201)}`, uuid(1))).toBe(adminPaths.notices(uuid(1), 2, uuid(201)))
    for (const path of ['https://example.test', '//example.test', '/admin/users', '/admin/notices/new', '/admin/notices#untrusted', '/\\example.test', `/admin/notices?org=${uuid(2)}`]) expect(noticeListReturn(path, uuid(1))).toBe(adminPaths.notices(uuid(1)))
  })
  test('retains a list page while dropping or setting the exact reading target', () => {
    const path = adminPaths.notices(uuid(1), 2, uuid(201))
    expect(noticeListWithoutSelection(path)).toBe(adminPaths.notices(uuid(1), 2))
    expect(noticeListWithSelection(adminPaths.notices(uuid(1), 2), uuid(203))).toContain(`selected=${uuid(203)}`)
  })
})
