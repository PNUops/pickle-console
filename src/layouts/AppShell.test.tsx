import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

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

    await user.click(within(drawer).getByRole('link', { name: '가상머신' }))
    expect(screen.queryByRole('dialog', { name: '콘솔 메뉴' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '내 가상머신' })).toBeInTheDocument()
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

describe('사이드바 리소스 목록', () => {
  test('아직 없는 종류는 링크가 아니라 준비 중 항목으로 선다', async () => {
    renderConsole()
    const nav = await screen.findByRole('navigation', { name: '콘솔 메뉴' })

    expect(within(nav).getByRole('link', { name: '가상머신' })).toHaveAttribute(
      'href',
      '/console/vms',
    )
    const planned = [
      '컨테이너',
      '컨테이너 레지스트리',
      '데이터베이스',
      '오브젝트 스토리지',
      'GPU',
      '도메인',
      '단축 링크',
    ]
    for (const label of planned) {
      expect(within(nav).queryByRole('link', { name: label })).not.toBeInTheDocument()
      const text = within(nav).getByText(label)
      const item = text.closest('[aria-disabled="true"]')
      expect(item).not.toBeNull()
      expect(item).not.toHaveClass('whitespace-nowrap')
      expect(text).toHaveClass('min-w-0', 'flex-1')
      expect(within(item as HTMLElement).getByText('준비 중')).toHaveClass('shrink-0')
    }
    expect(within(nav).getAllByText('준비 중')).toHaveLength(7)
  })

  test('LLM API는 열려 있되 Beta 배지를 단다', async () => {
    renderConsole()
    const nav = await screen.findByRole('navigation', { name: '콘솔 메뉴' })

    const llm = within(nav).getByRole('link', { name: /LLM API/ })
    expect(llm).toHaveAttribute('href', '/console/llm-keys')
    expect(within(llm).getByText('Beta')).toBeInTheDocument()
  })

  test('범위를 좁혀 두면 워크스페이스 항목이 그 워크스페이스 관리로 바뀐다', async () => {
    server.use(refreshSuccessHandler('access-user'))
    renderApp(`/console/${uuid(15)}`)

    const nav = await screen.findByRole('navigation', { name: '콘솔 메뉴' })
    expect(await within(nav).findByRole('link', { name: '워크스페이스 관리' })).toHaveAttribute(
      'href',
      `/console/workspaces/${uuid(15)}`,
    )
    expect(within(nav).queryByRole('link', { name: '내 워크스페이스' })).not.toBeInTheDocument()
  })
})

describe('셸 정보 밀도', () => {
  test('사용자 console은 comfortable, 관리자 console은 compact density를 쓴다', async () => {
    renderConsole()
    const consoleNav = await screen.findByRole('navigation', { name: '콘솔 메뉴' })
    expect(consoleNav.closest('[data-density]')).toHaveAttribute('data-density', 'comfortable')

    server.use(refreshSuccessHandler('access-sys-admin'))
    renderApp('/admin')
    const adminNav = await screen.findByRole('navigation', { name: '관리자 메뉴' })
    expect(adminNav.closest('[data-density]')).toHaveAttribute('data-density', 'compact')
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
