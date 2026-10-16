import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  refreshSuccessHandler,
  sysAdminUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

describe('관리자 워크스페이스 관리', () => {
  test('SYS_ADMIN은 전체 워크스페이스를 종류·구성원 수와 함께 나열한다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/workspaces')

    await screen.findByRole('heading', { name: '워크스페이스 관리' })
    const row = (await screen.findByText('캡스톤 3조')).closest('tr')!
    expect(within(row).getByText('4')).toBeInTheDocument()
    expect(screen.getByText('AI 동아리')).toBeInTheDocument()
    expect(screen.getByLabelText('관리 기관 선택')).toHaveValue('')
  })

  test('상세 드로어는 비활성·탈퇴 구성원까지 상태와 함께 보여준다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/workspaces')

    await user.click(await screen.findByRole('button', { name: '캡스톤 3조' }))
    const drawer = within(await screen.findByRole('dialog', { name: '워크스페이스 상세' }))
    await user.click(await drawer.findByRole('tab', { name: '구성원' }))
    expect(await drawer.findByText('홍길동')).toBeInTheDocument()
    expect(drawer.getByText('박탈퇴')).toBeInTheDocument()
    expect(drawer.getByText('탈퇴')).toBeInTheDocument()
    await user.click(drawer.getByRole('tab', { name: '개요' }))
    expect(drawer.getByRole('link', { name: 'VM 보기' })).toHaveAttribute(
      'href',
      `/admin/vms?workspaceId=${uuid(12)}`,
    )
  })

  test('workspace members link only to support details the actor can read', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser),
      http.get('*/api/v1/admin/workspaces/:workspaceId', () => HttpResponse.json({
        id: uuid(12), kind: 'PROJECT', name: '캡스톤 3조', description: null,
        createdAt: '2026-06-01T10:00:00+09:00', memberCount: 2, vmCount: 0,
        members: [
          { userId: uuid(42), name: '학생 구성원', email: 'student@pusan.ac.kr', workspaceRole: 'OWNER', userStatus: 'ACTIVE', supportDetailVisible: true, joinedAt: '2026-06-01T10:00:00+09:00' },
          { userId: uuid(77), name: '시스템 구성원', email: 'system@pusan.ac.kr', workspaceRole: 'MEMBER', userStatus: 'ACTIVE', supportDetailVisible: false, joinedAt: '2026-06-02T10:00:00+09:00' },
        ],
      })),
    )
    renderApp('/admin/workspaces')

    await user.click(await screen.findByRole('button', { name: '캡스톤 3조' }))
    const drawer = within(await screen.findByRole('dialog', { name: '워크스페이스 상세' }))
    await user.click(await drawer.findByRole('tab', { name: '구성원' }))
    expect(drawer.getByRole('link', { name: '학생 구성원' })).toHaveAttribute('href', expect.stringContaining(`/admin/users/${uuid(42)}`))
    expect(drawer.getByText('시스템 구성원')).toBeInTheDocument()
    expect(drawer.queryByRole('link', { name: '시스템 구성원' })).not.toBeInTheDocument()
  })

  test('assigned institution support reads foreign workspaces through the global picker', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/workspaces')

    await screen.findByRole('heading', { name: '워크스페이스 관리' })
    // The shared support picker filters globally readable workspace metadata.
    expect(await screen.findByText('캡스톤 3조')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI 동아리' })).toBeInTheDocument()
    expect(screen.queryByLabelText('기관 필터')).not.toBeInTheDocument()
  })
})
