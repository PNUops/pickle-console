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

    await user.click(within(drawer).getByRole('link', { name: '내 워크스페이스' }))
    expect(screen.queryByRole('dialog', { name: '콘솔 메뉴' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '내 워크스페이스' })).toBeInTheDocument()
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

describe('사이드바 하단 참고 링크', () => {
  test('가이드는 콘솔 내부 경로로, 문의·의견은 새 탭 외부 링크로 걸린다', async () => {
    renderConsole()

    const guide = await screen.findByRole('link', { name: '사용 가이드' })
    expect(guide).toHaveAttribute('href', '/docs')
    expect(guide).not.toHaveAttribute('target')

    for (const name of ['1:1 문의하기', '개선 의견 남기기']) {
      const link = screen.getByRole('link', { name: new RegExp(name) })
      expect(link).toHaveAttribute('target', '_blank')
      expect(link.getAttribute('href')).toMatch(/^https:\/\//)
    }
  })

  test('모바일 드로어에도 같은 링크가 실린다', async () => {
    renderConsole()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '메뉴 열기' }))
    const drawer = screen.getByRole('dialog', { name: '콘솔 메뉴' })
    expect(within(drawer).getByRole('link', { name: '사용 가이드' })).toBeInTheDocument()
    expect(
      within(drawer).getByRole('link', { name: /개선 의견 남기기/ }),
    ).toBeInTheDocument()
  })
})
