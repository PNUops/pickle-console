import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderConsole() {
  server.use(refreshSuccessHandler('access-user'))
  renderApp('/console')
}

describe('모바일 드로어 내비게이션', () => {
  test('햄버거 버튼으로 드로어를 열고, 항목 클릭 시 닫히며 해당 페이지로 이동한다', async () => {
    renderConsole()
    const user = userEvent.setup()

    const openButton = await screen.findByRole('button', { name: '메뉴 열기' })
    expect(openButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog', { name: '콘솔 메뉴' })).not.toBeInTheDocument()

    await user.click(openButton)
    const drawer = screen.getByRole('dialog', { name: '콘솔 메뉴' })
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    await user.click(within(drawer).getByRole('link', { name: '내 그룹' }))
    expect(screen.queryByRole('dialog', { name: '콘솔 메뉴' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '내 그룹' })).toBeInTheDocument()
  })

  test('ESC와 닫기 버튼으로 드로어를 닫을 수 있다', async () => {
    renderConsole()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '메뉴 열기' }))
    expect(screen.getByRole('dialog', { name: '콘솔 메뉴' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '콘솔 메뉴' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '메뉴 열기' }))
    const drawer = screen.getByRole('dialog', { name: '콘솔 메뉴' })
    await user.click(within(drawer).getByRole('button', { name: '메뉴 닫기' }))
    expect(screen.queryByRole('dialog', { name: '콘솔 메뉴' })).not.toBeInTheDocument()
  })
})
