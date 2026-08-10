import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'

function renderConsole(path: string) {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(path)
}

describe('워크스페이스 선택기', () => {
  test('워크스페이스를 고르면 보고 있던 화면이 그 워크스페이스로 바뀐다', async () => {
    const user = userEvent.setup()
    renderConsole('/console/resources')

    await screen.findByRole('link', { name: 'capstone-team3-api' })
    await user.selectOptions(screen.getByRole('combobox', { name: '워크스페이스 선택' }), '15')

    // 보고 있던 화면 그대로, 주소만 그 워크스페이스로 옮겨간다.
    await waitFor(() => expect(currentPath()).toBe('/console/15/resources'))
    expect(screen.getByRole('link', { name: 'VM' })).toHaveAttribute('href', '/console/15/vms')
    expect(await screen.findByText('이 워크스페이스의 리소스입니다.')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByText('capstone-team3-api')).not.toBeInTheDocument(),
    )
  })

  test('전체로 되돌리면 범위 없는 같은 화면으로 간다', async () => {
    const user = userEvent.setup()
    renderConsole('/console/15/resources')

    await screen.findByRole('link', { name: 'algo-judge' })
    await user.selectOptions(
      screen.getByRole('combobox', { name: '워크스페이스 선택' }),
      'all',
    )

    await waitFor(() => expect(currentPath()).toBe('/console/resources'))
    expect(
      await screen.findByText('내가 속한 모든 워크스페이스의 리소스입니다.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'VM' })).toHaveAttribute('href', '/console/vms')
  })

  test('내 워크스페이스가 아닌 범위에서는 전체라고 말하지 않는다', async () => {
    renderConsole('/console/999/resources')

    // 범위가 걸러지고 나면 선택기도 목록도 범위 없는 화면과 같은 것을 말한다.
    await waitFor(() => expect(currentPath()).toBe('/console/resources'))
    expect(screen.getByRole('combobox', { name: '워크스페이스 선택' })).toHaveValue('all')
  })
})
