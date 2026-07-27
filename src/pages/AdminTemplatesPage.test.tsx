import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import {
  refreshSuccessHandler,
  sysAdminUser,
  sysManagerUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

describe('관리자 템플릿 관리', () => {
  test('전 상태 템플릿을 나열하고 은퇴 리비전에 배지를 붙인다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/templates')

    await screen.findByRole('heading', { name: '템플릿 관리' })
    const active = (await screen.findByText('Ubuntu 24.04 LTS (기본형)')).closest('tr')!
    expect(within(active).getByText('활성')).toBeInTheDocument()
    const retired = screen.getByText('Ubuntu 24.04 LTS (구 리비전)').closest('tr')!
    expect(within(retired).getByText('은퇴')).toBeInTheDocument()
    expect(within(retired).getByRole('button', { name: '되살리기' })).toBeEnabled()
  })

  test('마지막 ACTIVE 템플릿 은퇴 시 경고를 띄우고 전환한다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/templates')

    const active = (await screen.findByText('Ubuntu 24.04 LTS (기본형)')).closest('tr')!
    await user.click(within(active).getByRole('button', { name: '은퇴' }))

    const dialog = await screen.findByRole('dialog', { name: '템플릿 은퇴' })
    expect(
      within(dialog).getByText(/마지막 ACTIVE 템플릿입니다/),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '은퇴' }))

    expect(await screen.findByText('템플릿을 은퇴시켰습니다.')).toBeInTheDocument()
    const updated = (await screen.findByText('Ubuntu 24.04 LTS (기본형)')).closest('tr')!
    expect(within(updated).getByText('은퇴')).toBeInTheDocument()
  })

  test('SYS_MANAGER에게는 토글이 비활성+사유로 보인다', async () => {
    server.use(refreshSuccessHandler('access-sys-manager', sysManagerUser))
    renderApp('/admin/templates')

    await screen.findByRole('heading', { name: '템플릿 관리' })
    expect(
      screen.getByText('템플릿 상태 변경은 시스템 관리자만 수행할 수 있습니다.'),
    ).toBeInTheDocument()
    const active = (await screen.findByText('Ubuntu 24.04 LTS (기본형)')).closest('tr')!
    expect(within(active).getByRole('button', { name: '은퇴' })).toBeDisabled()
  })
})
