import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler, sysAdminUser, sysManagerUser } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderAsSysAdmin() {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp('/admin/terminal-sessions')
}

function renderAsSysManager() {
  server.use(refreshSuccessHandler('access-sys-manager', sysManagerUser))
  renderApp('/admin/terminal-sessions')
}

describe('관리자 웹 터미널 세션', () => {
  test('라이브 세션을 VM·기관·사용자·IP와 함께 나열한다', async () => {
    renderAsSysAdmin()

    expect(await screen.findByRole('heading', { name: '웹 터미널 세션' })).toBeInTheDocument()
    expect(await screen.findByText('algo-judge')).toBeInTheDocument()
    expect(screen.getByText('홍길동')).toBeInTheDocument()
    expect(screen.getByText('203.0.113.7')).toBeInTheDocument()
    expect(screen.getByText('ai-train')).toBeInTheDocument()
  })

  test('SYS_ADMIN은 세션을 강제 종료하고 목록에서 사라진다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByText('algo-judge')
    const row = screen.getByText('algo-judge').closest('tr') as HTMLElement
    await user.click(within(row).getByRole('button', { name: '강제 종료' }))

    const dialog = await screen.findByRole('dialog', { name: '웹 터미널 세션 강제 종료' })
    await user.click(within(dialog).getByRole('button', { name: '강제 종료' }))

    expect(await screen.findByText('세션 강제 종료를 지시했습니다.')).toBeInTheDocument()
    // 목록 갱신 후 해당 세션이 사라진다.
    await screen.findByText('ai-train')
    expect(screen.queryByText('algo-judge')).not.toBeInTheDocument()
  })

  test('SYS_MANAGER에게는 강제 종료 버튼이 없다', async () => {
    renderAsSysManager()

    await screen.findByText('algo-judge')
    expect(screen.queryByRole('button', { name: '강제 종료' })).not.toBeInTheDocument()
  })

  test('진행 중인 세션이 없으면 빈 목록 안내를 보여준다', async () => {
    server.use(http.get('*/api/v1/admin/terminal-sessions', () => HttpResponse.json([])))
    renderAsSysAdmin()

    expect(
      await screen.findByText('진행 중인 웹 터미널 세션이 없습니다.'),
    ).toBeInTheDocument()
  })
})
