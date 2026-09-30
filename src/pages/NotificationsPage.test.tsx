import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { http, HttpResponse } from 'msw'
import { orgAdminDualProfile, orgAdminUser, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { adminRequestStore } from '../test/msw/handlers/admin'
import { notificationStore } from '../test/msw/handlers/notifications'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

describe('알림 종(bell)', () => {
  test('사용자 상단 바에 읽지 않은 알림 수를 배지로 보여준다', async () => {
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console')

    const bell = await screen.findByRole('button', { name: '읽지 않은 알림 2개' })
    expect(bell).toHaveTextContent('2')
  })

  test('종을 누르면 최근 알림 팝오버가 열리고 전체 보기가 알림함으로 연결된다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console')

    await user.click(await screen.findByRole('button', { name: '읽지 않은 알림 2개' }))
    const panel = await screen.findByRole('dialog', { name: '알림' })
    expect(panel).toHaveTextContent('VM 생성 완료')
    expect(screen.getByRole('link', { name: '알림함 전체 보기' })).toHaveAttribute(
      'href',
      '/console/notifications',
    )
  })

  test('팝오버에서 linkPath 알림을 누르면 해당 화면으로 이동하고 읽음 처리된다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console')

    await user.click(await screen.findByRole('button', { name: '읽지 않은 알림 2개' }))
    const panel = await screen.findByRole('dialog', { name: '알림' })
    await user.click(await within(panel).findByText('VM 생성 완료'))

    // /console/vms/55 → VM 상세, 읽음 처리로 배지 감소, 팝오버는 라우트 이동으로 닫힘
    await screen.findByRole('heading', { name: 'capstone-team3-api' })
    await screen.findByRole('button', { name: '읽지 않은 알림 1개' })
    expect(screen.queryByRole('dialog', { name: '알림' })).not.toBeInTheDocument()
  })

  test('팝오버 모두 읽음으로 배지가 사라진다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console')

    await user.click(await screen.findByRole('button', { name: '읽지 않은 알림 2개' }))
    await user.click(await screen.findByRole('button', { name: '모두 읽음' }))
    await screen.findByRole('button', { name: '읽지 않은 알림 0개' })
  })

  test('관리자 상단 바 종은 관리자 알림함으로 연결된다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin')

    await user.click(await screen.findByRole('button', { name: '읽지 않은 알림 1개' }))
    expect(await screen.findByRole('link', { name: '알림함 전체 보기' })).toHaveAttribute(
      'href',
      `/admin/notifications?org=${uuid(1)}`,
    )
  })

  test('읽지 않은 알림이 없으면 숫자 배지를 감춘다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin')

    const bell = await screen.findByRole('button', { name: '읽지 않은 알림 0개' })
    expect(bell).not.toHaveTextContent('0')
  })
})

describe('알림함', () => {
  test.each(['bell', 'inbox'])('legacy request notification opens its institution from the %s', async (surface) => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin-dual', orgAdminUser))
    server.use(http.get('*/api/v1/me', () => HttpResponse.json(orgAdminDualProfile)))
    adminRequestStore.find((request) => request.id === uuid(201))!.orgId = uuid(2)
    renderApp(`/admin${surface === 'inbox' ? '/notifications' : ''}?org=${uuid(1)}`)
    if (surface === 'bell') {
      await user.click(await screen.findByRole('button', { name: '읽지 않은 알림 1개' }))
    }
    await user.click(await screen.findByText('새 VM 신청'))
    await waitFor(() => expect(currentPath()).toBe(`/admin/requests/${uuid(201)}?org=${uuid(2)}`))
    expect(screen.queryByText('현재 관리 범위에서 이 신청을 찾을 수 없습니다.')).not.toBeInTheDocument()
    await waitFor(() => expect(notificationStore.find((row) => row.id === uuid(310))?.readAt).not.toBeNull())
  })

  test('a failed target lookup keeps the inbox open and reports the navigation failure', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    server.use(http.get('*/api/v1/admin/requests/:requestId', () => HttpResponse.json({
      type: 'about:blank', title: '찾을 수 없습니다', status: 404, code: 'RESOURCE_NOT_FOUND', detail: '알림 신청을 찾을 수 없습니다.',
    }, { status: 404 })))
    renderApp(`/admin/notifications?org=${uuid(1)}`)
    await user.click(await screen.findByText('새 VM 신청'))
    await screen.findByText('알림 신청을 찾을 수 없습니다.')
    expect(currentPath()).toBe(`/admin/notifications?org=${uuid(1)}`)
  })
  test('알림을 누르면 읽음 처리되어 종 배지 수가 줄어든다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/notifications')

    await screen.findByRole('heading', { name: '알림함' })
    await screen.findByRole('button', { name: '읽지 않은 알림 2개' })

    // linkPath가 없는 알림 — 화면 이동 없이 읽음 처리만 된다.
    await user.click(await screen.findByText('VM 만료 7일 전'))
    await screen.findByRole('button', { name: '읽지 않은 알림 1개' })
    expect(screen.getByRole('heading', { name: '알림함' })).toBeInTheDocument()
  })

  test('linkPath가 있는 알림을 누르면 해당 화면으로 이동한다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/notifications')

    await screen.findByRole('heading', { name: '알림함' })
    await user.click(await screen.findByText('VM 생성 완료'))

    // /console/vms/55 → VM 상세
    await screen.findByRole('heading', { name: 'capstone-team3-api' })
  })

  test('모두 읽음을 누르면 종 배지가 사라진다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/notifications')

    await screen.findByRole('heading', { name: '알림함' })
    await user.click(screen.getByRole('button', { name: '모두 읽음' }))

    await screen.findByRole('button', { name: '읽지 않은 알림 0개' })
  })

  test('안읽음 탭은 읽지 않은 알림만 보여준다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/notifications')

    await screen.findByRole('heading', { name: '알림함' })
    // 전체 탭에는 읽은 공지도 보인다.
    await screen.findByText('7월 정기 점검 안내')

    await user.click(screen.getByRole('button', { name: '안읽음' }))
    await waitFor(() =>
      expect(screen.queryByText('7월 정기 점검 안내')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('VM 생성 완료')).toBeInTheDocument()
    expect(screen.getByText('VM 만료 7일 전')).toBeInTheDocument()
  })
})
