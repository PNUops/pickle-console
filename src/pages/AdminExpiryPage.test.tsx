import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { localDateStr } from '../test/msw/handlers/vms'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderExpiry() {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp('/admin/expiry')
}

describe('만료 관리', () => {
  test('7일 이내 탭은 임박 VM만 D-day 배지와 함께 보여준다', async () => {
    renderExpiry()

    await screen.findByRole('heading', { name: '만료 관리' })
    const row = (await screen.findByText('expiring-api')).closest('tr')!
    expect(within(row).getByText('D-3')).toBeInTheDocument()
    // 20일 뒤 만료 VM은 7일 탭에 없다.
    expect(screen.queryByText('semester-web')).not.toBeInTheDocument()
    expect(screen.queryByText('expired-lab')).not.toBeInTheDocument()
  })

  test('30일 이내 탭은 더 먼 만료 예정 VM도 포함한다', async () => {
    const user = userEvent.setup()
    renderExpiry()

    await screen.findByRole('heading', { name: '만료 관리' })
    await user.click(screen.getByRole('tab', { name: '30일 이내' }))

    await screen.findByText('semester-web')
    expect(screen.getByText('expiring-api')).toBeInTheDocument()
  })

  test('만료됨 탭은 자동 중지 배지와 D+n을 보여준다', async () => {
    const user = userEvent.setup()
    renderExpiry()

    await screen.findByRole('heading', { name: '만료 관리' })
    await user.click(screen.getByRole('tab', { name: '만료됨' }))

    const row = (await screen.findByText('expired-lab')).closest('tr')!
    expect(within(row).getByText('D+2')).toBeInTheDocument()
    expect(within(row).getByText('자동 중지됨')).toBeInTheDocument()
    expect(within(row).getByText('중지됨')).toBeInTheDocument()
  })

  test('기간 연장 후 안내 문구가 보이고 만료 목록에서 사라진다', async () => {
    const user = userEvent.setup()
    renderExpiry()

    await screen.findByRole('heading', { name: '만료 관리' })
    await user.click(screen.getByRole('tab', { name: '만료됨' }))
    const row = (await screen.findByText('expired-lab')).closest('tr')!
    await user.click(within(row).getByRole('button', { name: '기간 연장' }))

    const dialog = await screen.findByRole('dialog', { name: '기간 연장 — expired-lab' })
    fireEvent.change(within(dialog).getByLabelText(/새 종료일/), {
      target: { value: localDateStr(30) },
    })
    await user.click(within(dialog).getByRole('button', { name: '연장' }))

    expect(
      await screen.findByText('연장되었습니다. 중지된 VM은 VM 관리에서 다시 시작해 주세요.'),
    ).toBeInTheDocument()
    // 연장되어 endDate가 미래가 되었으니 만료됨 탭에서 사라진다.
    await waitFor(() => expect(screen.queryByText('expired-lab')).not.toBeInTheDocument())
  })
})
