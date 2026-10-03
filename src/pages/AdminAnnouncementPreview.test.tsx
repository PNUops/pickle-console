import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { ACCESS_TOKENS, orgAdminDualProfile, orgAdminUser, orgManagerUser, orgViewerUser, refreshSuccessHandler, sysAdminUser, sysManagerUser, sysViewerUser } from '../test/msw/handlers/auth'
import { adminUserStore } from '../test/msw/handlers/users'
import { announcementStore } from '../test/msw/handlers/announcements'
import { mailDeliveryStore } from '../test/msw/handlers/mail-deliveries'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'

function system(path = '/admin/announcements') {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(path)
}
async function fill(user: ReturnType<typeof userEvent.setup>, title = '검토할 안내') {
  await user.type(await screen.findByLabelText('제목'), title)
  await user.type(screen.getByLabelText('내용'), '평문 안내\n둘째 줄')
}
async function preview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '발송 대상 미리보기' }))
  return screen.findByRole('heading', { name: '발송 전 대상 확인' })
}

describe('Announcement publishing and preview authority', () => {
  test.each([
    ['access-sys-admin', sysAdminUser, true], ['access-sys-manager', sysManagerUser, false], ['access-sys-viewer', sysViewerUser, false],
    ['access-org-admin', orgAdminUser, true], ['access-org-manager', orgManagerUser, false], ['access-org-viewer', orgViewerUser, false],
  ] as const)('%s reads saved detail and retains its publishing capability', async (token, profile, writable) => {
    server.use(refreshSuccessHandler(token, profile))
    renderApp(`/admin/announcements?selected=${uuid(11)}`)
    const drawer = await screen.findByRole('dialog', { name: '알림 발송건 상세' })
    expect(await within(drawer).findByText('정기 점검 중 일부 서비스가 중단됩니다.')).toBeInTheDocument()
    expect(!!screen.queryByRole('button', { name: '발송 대상 미리보기' })).toBe(writable)
    expect(!!within(drawer).queryByRole('link', { name: '수신자별 발송 결과' })).toBe(token.startsWith('access-sys-'))
  })

  test('the selected institution is the SYS default while a global send needs an explicit choice', async () => {
    system(`/admin/announcements?org=${uuid(2)}`)
    expect(await screen.findByRole('radio', { name: '특정 기관' })).toBeChecked()
    expect(screen.getByLabelText('대상 기관')).toHaveValue(uuid(2))
    expect(screen.getByRole('radio', { name: '전체' })).not.toBeChecked()
  })

  test('an institution viewer assignment cannot borrow the highest administrator role', async () => {
    const token = 'access-announce-mixed'
    ACCESS_TOKENS[token] = { ...orgAdminDualProfile, managedOrgs: [{ ...orgAdminDualProfile.managedOrgs[0] }, { ...orgAdminDualProfile.managedOrgs[1], role: 'ORG_VIEWER' }] }
    try {
      server.use(refreshSuccessHandler(token, orgAdminUser))
      renderApp(`/admin/announcements?org=${uuid(2)}`)
      await screen.findByRole('heading', { name: '알림 보내기' })
      expect(screen.queryByRole('button', { name: '발송 대상 미리보기' })).not.toBeInTheDocument()
    } finally { delete ACCESS_TOKENS[token] }
  })

  test('preview samples hide system accounts without changing the actual workspace recipient count', async () => {
    const account = adminUserStore.find((row) => row.id === uuid(5))!
    account.memberships.push({ workspaceId: uuid(12), workspaceName: '캡스톤 3조', workspaceKind: 'PROJECT', role: 'MEMBER', vmOrgIds: [uuid(1)] })
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/announcements')
    await fill(user)
    await user.click(screen.getByRole('radio', { name: '특정 워크스페이스' }))
    await user.selectOptions(await screen.findByLabelText('대상 워크스페이스'), uuid(12))
    await preview(user)
    expect(await screen.findByText('조회 가능한 수신자 일부를 표시합니다.')).toBeInTheDocument()
    expect(screen.getByText('일부 발송 대상자는 계정 열람 권한 때문에 예시에 표시되지 않습니다.')).toBeInTheDocument()
    const previewSection = screen.getByRole('heading', { name: '발송 전 대상 확인' }).closest('section')!
    expect(within(previewSection).queryByText('sysadmin.lee@pusan.ac.kr')).not.toBeInTheDocument()
    const expected = adminUserStore.filter((row) => row.status === 'ACTIVE' && row.memberships.some((membership) => membership.workspaceId === uuid(12))).length
    expect(within(previewSection).getByText(new RegExp(`예상 ${expected}명`))).toBeInTheDocument()
  })
})

describe('Announcement estimate, queue snapshot and stale responses', () => {
  test('preview writes nothing, zero recipients warn, and create displays its actual saved count', async () => {
    for (const account of adminUserStore) if (account.id !== uuid(5)) account.status = 'DISABLED'
    const user = userEvent.setup()
    system(`/admin/announcements?org=${uuid(1)}`)
    await fill(user)
    const initial = announcementStore.length
    await preview(user)
    expect(await screen.findByText('발송 대상자가 0명입니다. 알림과 메일이 생성되지 않습니다.')).toBeInTheDocument()
    expect(announcementStore).toHaveLength(initial)
    const recipient = adminUserStore.find((row) => row.id === uuid(42))!
    recipient.status = 'ACTIVE'
    const queuedAddress = recipient.email
    await user.click(screen.getByRole('button', { name: '검토한 알림 발송' }))
    const dialog = screen.getByRole('dialog', { name: '알림 발송 확인' })
    await user.click(within(dialog).getByRole('button', { name: '발송' }))
    expect(await screen.findByText(/1명의 콘솔 알림을 저장하고 이메일 큐에 접수했습니다/)).toBeInTheDocument()
    expect(screen.getByText('저장됨')).toBeInTheDocument()
    const created = announcementStore[0]
    expect(created.recipientCount).toBe(1)
    const deliveries = mailDeliveryStore.filter((delivery) => delivery.announcementId === created.id)
    expect(deliveries).toHaveLength(1)
    recipient.email = 'changed@example.test'
    expect(deliveries[0].recipientEmail).toBe(queuedAddress)
    expect(screen.getAllByRole('link', { name: '수신자별 발송 결과' }).some((link) => link.getAttribute('href') === `/admin/notification-log?announcementId=${created.id}`)).toBe(true)
  })

  test('editing a reviewed request removes the confirmation action', async () => {
    const user = userEvent.setup()
    system()
    await fill(user)
    await user.click(screen.getByRole('radio', { name: '전체' }))
    await preview(user)
    await user.type(screen.getByLabelText('제목'), ' 수정')
    expect(screen.queryByRole('button', { name: '검토한 알림 발송' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '발송 전 대상 확인' })).not.toBeInTheDocument()
  })

  test('a late preview for the old target does not appear under a new target', async () => {
    let completed = false
    server.use(http.post('*/api/v1/admin/announcements/preview', async () => { await delay(200); completed = true; return HttpResponse.json({ scope: 'ALL', orgId: null, workspaceId: null, recipientCount: 999, observedAt: new Date().toISOString(), sample: [], truncated: true, warnings: [] }) }))
    const user = userEvent.setup()
    system()
    await fill(user)
    await user.click(screen.getByRole('radio', { name: '전체' }))
    await user.click(screen.getByRole('button', { name: '발송 대상 미리보기' }))
    await user.click(screen.getByRole('radio', { name: '특정 기관' }))
    await user.selectOptions(screen.getByLabelText('대상 기관'), uuid(1))
    await waitFor(() => expect(completed).toBe(true))
    expect(screen.queryByText(/예상 999명/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '검토한 알림 발송' })).not.toBeInTheDocument()
  })

  test('a cancelled old create does not reset or announce success in the replacement draft', async () => {
    let completed = false
    server.use(http.post('*/api/v1/admin/announcements', async () => { await delay(200); completed = true; return HttpResponse.json({ id: uuid(900), title: '이전 안내', scope: 'ALL', orgId: null, workspaceId: null, recipientCount: 5, createdAt: new Date().toISOString() }, { status: 201 }) }))
    const user = userEvent.setup()
    system()
    await fill(user, '이전 안내')
    await user.click(screen.getByRole('radio', { name: '전체' }))
    await preview(user)
    await user.click(screen.getByRole('button', { name: '검토한 알림 발송' }))
    const old = screen.getByRole('dialog')
    await user.click(within(old).getByRole('button', { name: '발송' }))
    await user.click(within(old).getByRole('button', { name: '취소' }))
    await user.clear(screen.getByLabelText('제목'))
    await user.type(screen.getByLabelText('제목'), '새 작성 내용')
    await waitFor(() => expect(completed).toBe(true))
    expect(screen.getByLabelText('제목')).toHaveValue('새 작성 내용')
    expect(screen.queryByText('저장됨')).not.toBeInTheDocument()
  })

  test('scope switching discards a pending old preview and restores the new institutional default', async () => {
    let completed = false
    server.use(http.post('*/api/v1/admin/announcements/preview', async () => { await delay(200); completed = true; return HttpResponse.json({ scope: 'ORG', orgId: uuid(1), workspaceId: null, recipientCount: 888, observedAt: new Date().toISOString(), sample: [], truncated: true, warnings: [] }) }))
    const user = userEvent.setup()
    system(`/admin/announcements?org=${uuid(1)}`)
    await fill(user)
    await user.click(screen.getByRole('button', { name: '발송 대상 미리보기' }))
    await user.selectOptions(screen.getByLabelText('관리 기관 선택'), uuid(2))
    await waitFor(() => expect(completed).toBe(true))
    expect(screen.getByLabelText('대상 기관')).toHaveValue(uuid(2))
    expect(screen.getByLabelText('제목')).toHaveValue('')
    expect(screen.queryByText(/888명/)).not.toBeInTheDocument()
  })
})

describe('Saved announcement URL and visibility', () => {
  test('the existing saved announcement and its available delivery keep the same parent in both directions', async () => {
    const user = userEvent.setup()
    system(`/admin/announcements?selected=${uuid(11)}`)
    const saved = await screen.findByRole('dialog', { name: '알림 발송건 상세' })
    await within(saved).findByText('정기 점검 중 일부 서비스가 중단됩니다.')
    await user.click(within(saved).getByRole('link', { name: '수신자별 발송 결과' }))
    const deliveryButton = await screen.findByRole('button', { name: '7월 정기 점검 안내' })
    expect(currentPath()).toBe(`/admin/notification-log?announcementId=${uuid(11)}`)
    await user.click(deliveryButton)
    const delivery = screen.getByRole('dialog', { name: '메일 발송 상세' })
    await within(delivery).findByRole('heading', { name: '7월 정기 점검 안내' })
    const backlink = within(delivery).getByRole('link', { name: '알림 발송건 상세' })
    await user.click(backlink)
    const parent = await screen.findByRole('dialog', { name: '알림 발송건 상세' })
    expect(await within(parent).findByText('정기 점검 중 일부 서비스가 중단됩니다.')).toBeInTheDocument()
    expect(currentPath()).toContain(`selected=${uuid(11)}`)
  })
  test('an old saved target outside the current page resolves by ID and preserves the list URL', async () => {
    for (let index = 0; index < 25; index++) announcementStore.push({ ...announcementStore[0], id: uuid(500 + index), title: `기록${index}`, body: `보존 본문${index}` })
    const user = userEvent.setup()
    system(`/admin/announcements?page=2&selected=${uuid(524)}`)
    const drawer = await screen.findByRole('dialog', { name: '알림 발송건 상세' })
    expect(await within(drawer).findByText('보존 본문24')).toBeInTheDocument()
    expect(within(drawer).getByRole('link', { name: '대상 기관 운영' })).toHaveAttribute('href', `/admin/org-operations?org=${uuid(1)}`)
    expect(within(drawer).getByRole('link', { name: '발송건 감사' })).toHaveAttribute('href', `/admin/audit?targetType=announcement&targetId=${uuid(524)}`)
    expect(within(drawer).getByText('정보컴퓨터공학부 실습지원센터')).toBeInTheDocument()
    expect(drawer).not.toHaveTextContent(uuid(1))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(currentPath()).toBe('/admin/announcements?page=2'))
  })

  test('current author membership controls institution reads of past announcements', async () => {
    const author = adminUserStore.find((row) => row.id === uuid(7))!
    author.managedOrgs = []
    server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
    renderApp(`/admin/announcements?selected=${uuid(11)}`)
    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByText('발송건을 찾을 수 없습니다')).toBeInTheDocument()
    expect(within(drawer).queryByText('정기 점검 중 일부 서비스가 중단됩니다.')).not.toBeInTheDocument()
  })

  test('an author who now holds a viewer assignment still has the same institution membership visibility', async () => {
    const author = adminUserStore.find((row) => row.id === uuid(7))!
    author.managedOrgs[0].role = 'ORG_VIEWER'
    server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
    renderApp(`/admin/announcements?selected=${uuid(11)}`)
    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByText('정기 점검 중 일부 서비스가 중단됩니다.')).toBeInTheDocument()
  })

  test('scope cross fields and unavailable institution selections follow the API validation status', async () => {
    system()
    await screen.findByRole('heading', { name: '알림 보내기' })
    for (const [token, scope, fields] of [
      ['access-sys-admin', 'ALL', { orgId: uuid(1) }],
      ['access-sys-admin', 'ORG', {}],
      ['access-sys-admin', 'WORKSPACE', { workspaceId: uuid(12), orgId: uuid(1) }],
      ['access-org-admin', 'ORG', { orgId: uuid(2) }],
      ['access-org-admin', 'ORG', { orgId: uuid(999) }],
    ] as const) {
      const response = await fetch('/api/v1/admin/announcements/preview', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '검증', body: '본문', scope, ...fields }) })
      expect(response.status).toBe(422)
      expect((await response.json()).code).toBe('VALIDATION_FAILED')
    }
  })

  test('a saved workspace target reads its existing allowed name and keeps the exact link', async () => {
    announcementStore.push({ ...announcementStore[0], id: uuid(600), scope: 'WORKSPACE', orgId: null, workspaceId: uuid(12) })
    server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
    renderApp(`/admin/announcements?selected=${uuid(600)}`)
    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByText('캡스톤 3조')).toBeInTheDocument()
    expect(within(drawer).getByRole('link', { name: '대상 워크스페이스' })).toHaveAttribute('href', `/admin/workspaces?workspaceId=${uuid(12)}`)
    expect(drawer).not.toHaveTextContent(uuid(12))
  })

  test('missing target names fall back without exposing raw IDs or failing the saved detail', async () => {
    announcementStore.push({ ...announcementStore[0], id: uuid(601), scope: 'WORKSPACE', orgId: null, workspaceId: uuid(999) })
    system(`/admin/announcements?selected=${uuid(601)}`)
    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByText('이름 확인 불가')).toBeInTheDocument()
    expect(within(drawer).getByText('정기 점검 중 일부 서비스가 중단됩니다.')).toBeInTheDocument()
    expect(drawer).not.toHaveTextContent(uuid(999))
    expect(within(drawer).getByRole('link', { name: '대상 워크스페이스' })).toHaveAttribute('href', `/admin/workspaces?workspaceId=${uuid(999)}`)
  })

  test('a malformed target does not issue a detail request', async () => {
    let calls = 0
    server.use(http.get('*/api/v1/admin/announcements/:announcementId', () => { calls += 1 }))
    system('/admin/announcements?selected=bad')
    await screen.findByText('발송건 ID가 올바르지 않습니다.')
    expect(calls).toBe(0)
  })
})
