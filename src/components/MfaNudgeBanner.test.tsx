import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  refreshSuccessHandler,
  sysAdminUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

describe('2FA 권유 배너와 관리자 계정 설정', () => {
  test('2FA 미등록 기관 계층에게 배너가 보이고 닫을 수 있다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin')

    await screen.findByRole('heading', { name: '관리자 대시보드' })
    expect(
      screen.getByText(/2단계 인증\(2FA\) 등록을 권장합니다/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '계정 설정에서 등록하기' })).toHaveAttribute(
      'href',
      '/admin/account',
    )

    // 강제가 아니라 권유 — 닫으면 사라진다.
    await user.click(screen.getByRole('button', { name: '2단계 인증 권유 닫기' }))
    await waitFor(() =>
      expect(screen.queryByText(/2단계 인증\(2FA\) 등록을 권장합니다/)).not.toBeInTheDocument(),
    )
  })

  test('시스템 계층에는 배너가 없다 — 로그인 필터가 2FA를 강제한다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin')

    await screen.findByRole('heading', { name: '관리자 대시보드' })
    expect(
      screen.queryByText(/2단계 인증\(2FA\) 등록을 권장합니다/),
    ).not.toBeInTheDocument()
  })

  test('관리자도 /admin/account에서 계정 설정 화면을 쓴다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/account')

    // 관리자는 /console에 닿지 못하므로 같은 화면이 관리자 셸 안에서 뜬다.
    expect(await screen.findByRole('heading', { name: '계정 설정' })).toBeInTheDocument()
  })
})
