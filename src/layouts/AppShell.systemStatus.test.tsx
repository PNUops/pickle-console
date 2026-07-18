import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { setSystemStatus } from '../test/msw/handlers/reference'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

describe('점검 모드·공지 배너·문의처 (AppShell)', () => {
  test('점검 중 비관리자는 전체 화면 점검 안내로 콘솔이 차단된다', async () => {
    setSystemStatus({
      maintenance: true,
      maintenanceMessage: '디스크 교체 중입니다',
      contactEmail: 'ops@pickle.local',
    })
    server.use(refreshSuccessHandler('access-student'))
    renderApp('/console')

    expect(await screen.findByRole('heading', { name: '서비스 점검 중' })).toBeInTheDocument()
    expect(screen.getByText('디스크 교체 중입니다')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ops@pickle.local' })).toHaveAttribute(
      'href',
      'mailto:ops@pickle.local',
    )
    // 콘솔 내비게이션은 차단 화면에 존재하지 않는다.
    expect(screen.queryByRole('link', { name: '내 그룹' })).not.toBeInTheDocument()
  })

  test('점검 중 관리자는 상단 경고 스트립만 보이고 콘솔은 계속 쓸 수 있다', async () => {
    setSystemStatus({ maintenance: true })
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin')

    expect(await screen.findByText(/점검 모드가 켜져 있습니다/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '사용자 관리' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '서비스 점검 중' })).not.toBeInTheDocument()
  })

  test('공지 배너는 표시되며 세션 동안 닫을 수 있다', async () => {
    setSystemStatus({ bannerMessage: '오늘 22시 정기 점검 예정' })
    server.use(refreshSuccessHandler('access-student'))
    renderApp('/console')

    expect(await screen.findByText('오늘 22시 정기 점검 예정')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: '공지 닫기' }))
    expect(screen.queryByText('오늘 22시 정기 점검 예정')).not.toBeInTheDocument()
  })

  test('문의 이메일은 셸 푸터에 mailto 링크로 노출된다', async () => {
    setSystemStatus({ contactEmail: 'help@pickle.local' })
    server.use(refreshSuccessHandler('access-student'))
    renderApp('/console')

    expect(await screen.findByRole('link', { name: 'help@pickle.local' })).toHaveAttribute(
      'href',
      'mailto:help@pickle.local',
    )
  })
})
