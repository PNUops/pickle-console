import { describe, expect, test } from 'vitest'
import { uuid } from '../ids'
import { makeNotice, noticeImage, seedNotices } from './notices'

function get(path: string, token?: string) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

describe('Notice handler contract boundaries', () => {
  test.each(['access-org-viewer', 'access-org-manager', 'access-sys-viewer', 'access-sys-manager', 'access-user'])('all existing notice writes deny %s', async (token) => {
    for (const [method, path, body] of [
      ['POST', '/admin/notices', JSON.stringify({ title: 'Forbidden', body: 'Body' })],
      ['PATCH', `/admin/notices/${uuid(201)}`, JSON.stringify({ title: 'Forbidden' })],
      ['DELETE', `/admin/notices/${uuid(201)}`, undefined],
      ['POST', `/admin/notices/${uuid(201)}/images`, undefined],
      ['DELETE', `/admin/notices/${uuid(201)}/images/${uuid(211)}`, undefined],
    ] as const) {
      const response = await fetch(`http://localhost/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body })
      expect(response.status).toBe(403)
      expect((await response.json()).code).toBe('ACCESS_DENIED')
    }
  })

  test('creation records the current author and current creation time', async () => {
    const before = Date.now()
    const response = await fetch('http://localhost/api/v1/admin/notices', { method: 'POST', headers: { Authorization: 'Bearer access-org-admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Now', body: 'Body' }) })
    expect(response.status).toBe(201)
    const created = await response.json()
    expect(created.createdByName).toBe('김관리')
    expect(Date.parse(created.createdAt)).toBeGreaterThanOrEqual(before)
    expect(created.updatedAt).toBe(created.createdAt)
  })
  test.each([
    'access-org-viewer', 'access-org-manager', 'access-org-admin',
    'access-sys-viewer', 'access-sys-manager', 'access-sys-admin',
  ])('admin detail permits all publication windows for %s', async (token) => {
    const response = await get(`/admin/notices/${uuid(203)}`, token)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: uuid(203), active: false })
    expect((await get(`/admin/notices/${uuid(9999)}`, token)).status).toBe(404)
  })

  test('admin detail requires authentication and an administrator role', async () => {
    expect((await get(`/admin/notices/${uuid(203)}`)).status).toBe(401)
    const denied = await get(`/admin/notices/${uuid(203)}`, 'access-user')
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({ code: 'ACCESS_DENIED' })
    expect((await get('/admin/notices', 'access-user')).status).toBe(403)
    expect((await get(`/notices/${uuid(203)}`, 'access-sys-admin')).status).toBe(404)
  })

  test('popup filtering preserves anonymous visibility and reports an empty page accurately', async () => {
    seedNotices([
      makeNotice({ id: uuid(5000), title: 'ordinary' }),
      makeNotice({ id: uuid(5001), title: 'popup', popup: true }),
    ])
    expect(await (await get('/notices?popup=false')).json()).toMatchObject({ totalElements: 1, totalPages: 1 })
    expect(await (await get('/notices?popup=false', 'access-user')).json()).toMatchObject({ totalElements: 2 })
    expect(await (await get('/notices?popup=true', 'access-user')).json()).toMatchObject({ totalElements: 1 })
    seedNotices([makeNotice({ id: uuid(5000) })])
    expect(await (await get('/notices?popup=true', 'access-user')).json()).toMatchObject({ content: [], totalElements: 0, totalPages: 0 })
  })

  test('image cache directives distinguish current public images from admin preview', async () => {
    seedNotices([
      makeNotice({ id: uuid(5010), popup: true, images: [noticeImage(uuid(5010), 5011, 'public.png')] }),
      makeNotice({ id: uuid(5020), popup: true, startsAt: '2099-01-01T00:00:00Z', images: [noticeImage(uuid(5020), 5021, 'scheduled.png')] }),
    ])
    const publicImage = await get(`/notices/${uuid(5010)}/images/${uuid(5011)}`)
    expect(publicImage.status).toBe(200)
    expect(publicImage.headers.get('Cache-Control')).toBe('public, max-age=31536000, s-maxage=3600')
    const previewPath = `/notices/${uuid(5020)}/images/${uuid(5021)}`
    expect((await get(previewPath)).status).toBe(404)
    expect((await get(previewPath, 'access-user')).status).toBe(404)
    const preview = await get(previewPath, 'access-org-viewer')
    expect(preview.status).toBe(200)
    expect(preview.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable')
  })
})
