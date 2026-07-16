import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  refreshSuccessHandler,
  sysAdminUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

describe('감사 로그', () => {
  test('SYS_ADMIN은 전체 기록과 행위자 역할 배지를 본다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/audit')

    await screen.findByRole('heading', { name: '감사 로그' })
    // 시스템 관리자 설정 변경 행 (이름은 상단 사용자 메뉴에도 있어 이메일로 특정)
    const row = (await screen.findByText('sysadmin.lee@pusan.ac.kr')).closest('tr')!
    expect(within(row).getByText('설정 변경')).toBeInTheDocument()
    expect(within(row).getByText('setting:ssh_gateway_enabled')).toBeInTheDocument()
    expect(within(row).getByText('시스템 관리자')).toBeInTheDocument()
    // 타 기관(org 2) 행도 보인다.
    expect(screen.getByText('박영희')).toBeInTheDocument()
    // SYS_ADMIN에게는 기관 필터가 있다.
    expect(screen.getByLabelText('기관 필터')).toBeInTheDocument()
  })

  test('UserRole 밖의 열린 actorRole(sshgw 등)은 원문 그대로 배지로 보여준다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/audit')

    await screen.findByRole('heading', { name: '감사 로그' })
    const row = (await screen.findByText('ssh-gateway')).closest('tr')!
    expect(within(row).getByText('SSHGW')).toBeInTheDocument()
    // 게이트웨이 감사 동작도 카탈로그 라벨로 노출된다
    expect(within(row).getByText('SSH 접속 라우팅')).toBeInTheDocument()
  })

  test('동작 필터를 고르면 해당 동작만 남는다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/audit')

    await screen.findByRole('heading', { name: '감사 로그' })
    await screen.findByText('sysadmin.lee@pusan.ac.kr')
    await user.selectOptions(screen.getByLabelText('동작 필터'), 'auth.login')

    await waitFor(() =>
      expect(screen.queryByText('sysadmin.lee@pusan.ac.kr')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('홍길동')).toBeInTheDocument()
  })

  test('ORG_ADMIN은 자기 기관 행만 보고 기관 필터는 없다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/audit')

    await screen.findByRole('heading', { name: '감사 로그' })
    await screen.findByText('김관리')
    // org 2 행위자·시스템 관리자 행은 보이지 않는다.
    expect(screen.queryByText('박영희')).not.toBeInTheDocument()
    expect(screen.queryByText('sysadmin.lee@pusan.ac.kr')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('기관 필터')).not.toBeInTheDocument()
  })
})

describe('내 활동', () => {
  test('사용자는 로그인 기록과 IP, 보안 안내 문구를 본다', async () => {
    server.use(refreshSuccessHandler('access-student'))
    renderApp('/console/activity')

    await screen.findByRole('heading', { name: '내 활동' })
    expect(
      screen.getByText(/낯선 IP가 보이면 비밀번호를 변경해 주세요/),
    ).toBeInTheDocument()
    const loginRows = await screen.findAllByText('로그인')
    expect(loginRows.length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('127.0.0.1').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('127.0.0.2')).toBeInTheDocument()
    expect(screen.getByText('vm:60')).toBeInTheDocument()
  })
})
