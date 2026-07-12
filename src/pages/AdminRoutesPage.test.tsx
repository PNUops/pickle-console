import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { orgAdminUser, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderRoutes(token: string, user = sysAdminUser) {
  server.use(refreshSuccessHandler(token, user))
  renderApp('/admin/routes')
}

describe('관리자 라우팅', () => {
  test('SYS_ADMIN은 라우트 적용·동기화 상태를 기관 맥락과 함께 본다', async () => {
    renderRoutes('access-sys-admin')

    await screen.findByRole('heading', { name: '도메인 라우팅' })
    const applied = (await screen.findByText('ai-team.pickle.pnuops.com')).closest('tr')!
    expect(within(applied).getByText('적용됨')).toBeInTheDocument()
    expect(within(applied).getByText('AI 동아리')).toBeInTheDocument()

    // 라우트 적용 실패는 nginx 오류 요약을 함께 노출한다.
    const failed = screen.getByText('shop.example.com').closest('tr')!
    expect(within(failed).getByText('적용 실패')).toBeInTheDocument()
    expect(within(failed).getByText(/nginx -t 실패/)).toBeInTheDocument()
  })

  test('SYS_ADMIN은 전체 재동기화를 접수할 수 있다', async () => {
    const user = userEvent.setup()
    renderRoutes('access-sys-admin')

    await screen.findByRole('heading', { name: '도메인 라우팅' })
    await user.click(screen.getByRole('button', { name: /전체 재동기화/ }))
    expect(
      await screen.findByText(/라우트 전체 재동기화를 접수했습니다/),
    ).toBeInTheDocument()
  })

  test('ORG_ADMIN에게는 전체 재동기화 버튼이 없다', async () => {
    renderRoutes('access-org-admin', orgAdminUser)

    await screen.findByRole('heading', { name: '도메인 라우팅' })
    expect(screen.queryByRole('button', { name: /전체 재동기화/ })).not.toBeInTheDocument()
  })
})
