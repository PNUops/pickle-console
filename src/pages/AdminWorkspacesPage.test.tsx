import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    expect(await drawer.findByText('홍길동')).toBeInTheDocument()
    expect(drawer.getByText('박탈퇴')).toBeInTheDocument()
    expect(drawer.getByText('탈퇴')).toBeInTheDocument()
    expect(drawer.getByRole('link', { name: 'VM 보기' })).toHaveAttribute(
      'href',
      `/admin/vms?workspaceId=${uuid(12)}`,
    )
  })

  test('ORG_ADMIN은 보유 기관 워크스페이스만 보고 기관 필터가 없다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/workspaces')

    await screen.findByRole('heading', { name: '워크스페이스 관리' })
    // 계약 v0.46.0: 조회는 역할을 보유한 기관 안이다. 보유 기관이 하나뿐이면
    // 고를 것이 없으므로 기관 필터도 보이지 않는다.
    expect(await screen.findByText('캡스톤 3조')).toBeInTheDocument()
    expect(screen.queryByText('AI 동아리')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('기관 필터')).not.toBeInTheDocument()
  })
})
