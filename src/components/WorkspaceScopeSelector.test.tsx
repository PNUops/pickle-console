import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

function renderConsole(path: string) {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(path)
}

/** 선택기를 펼치고 그 안의 항목을 누른다. */
async function pick(user: ReturnType<typeof userEvent.setup>, name: string | RegExp) {
  await user.click(screen.getByRole('button', { name: '워크스페이스 선택' }))
  const menu = screen.getByRole('menu', { name: '워크스페이스' })
  await user.click(within(menu).getByRole('menuitem', { name }))
}

describe('워크스페이스 선택기', () => {
  test('워크스페이스를 고르면 보고 있던 화면이 그 워크스페이스로 바뀐다', async () => {
    const user = userEvent.setup()
    renderConsole('/console/resources')

    await screen.findByRole('link', { name: 'capstone-team3-api' })
    await pick(user, /알고리즘 스터디/)

    // 보고 있던 화면 그대로, 주소만 그 워크스페이스로 옮겨간다.
    await waitFor(() => expect(currentPath()).toBe(`/console/${uuid(15)}/resources`))
    expect(screen.getByRole('link', { name: '가상머신' })).toHaveAttribute(
      'href',
      `/console/${uuid(15)}/vms`,
    )
    expect(await screen.findByText('이 워크스페이스의 리소스입니다.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('capstone-team3-api')).not.toBeInTheDocument())
  })

  test('전체로 되돌리면 범위 없는 같은 화면으로 간다', async () => {
    const user = userEvent.setup()
    renderConsole(`/console/${uuid(15)}/resources`)

    await screen.findByRole('link', { name: 'algo-judge' })
    await pick(user, '전체 워크스페이스')

    await waitFor(() => expect(currentPath()).toBe('/console/resources'))
    expect(
      await screen.findByText('내가 속한 모든 워크스페이스의 리소스입니다.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '가상머신' })).toHaveAttribute('href', '/console/vms')
  })

  test('내 워크스페이스가 아닌 범위에서는 전체라고 말하지 않는다', async () => {
    renderConsole(`/console/${uuid(999)}/resources`)

    // 범위가 걸러지고 나면 선택기도 목록도 범위 없는 화면과 같은 것을 말한다.
    await waitFor(() => expect(currentPath()).toBe('/console/resources'))
    expect(screen.getByRole('button', { name: '워크스페이스 선택' })).toHaveTextContent(
      '전체 워크스페이스',
    )
  })

  test('목록 맨 아래에서 새 워크스페이스를 만들 수 있다', async () => {
    const user = userEvent.setup()
    renderConsole('/console/resources')

    await screen.findByRole('link', { name: 'capstone-team3-api' })
    await pick(user, '새 워크스페이스 만들기')

    expect(
      await screen.findByRole('dialog', { name: '새 워크스페이스 만들기' }),
    ).toBeInTheDocument()
  })
})
