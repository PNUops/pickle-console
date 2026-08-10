import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  refreshSuccessHandler,
  sysAdminUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

function renderAsSysAdmin(path: string) {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(path)
}

describe('관리자 VM 상세', () => {
  test('개요 탭에 요약과 상태에 맞는 전원 버튼이 보인다', async () => {
    renderAsSysAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByText('10.10.0.56')).toBeInTheDocument()
    expect(screen.getByText('알고리즘 스터디')).toBeInTheDocument()

    // RUNNING: 시작만 비활성, 종료·재부팅·강제 종료는 활성
    expect(screen.getByRole('button', { name: '시작' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '종료' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '재부팅' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '강제 종료' })).toBeEnabled()
  })

  test('종료는 확인 모달을 거쳐 접수 메시지를 보여준다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: '종료' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 종료' })
    expect(within(dialog).getByText(/정지 보호 설정과 무관하게/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '종료' }))

    expect(
      await screen.findByText('VM 종료 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.'),
    ).toBeInTheDocument()
  })

  test('STOPPED VM은 시작만 활성화된다', async () => {
    renderAsSysAdmin(`/admin/vms/${uuid(57)}`)

    await screen.findByRole('heading', { name: 'web-lab' })
    expect(screen.getByRole('button', { name: '시작' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '종료' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '강제 종료' })).toBeDisabled()
  })

  test('이벤트 탭은 이력을 최신순으로 보여준다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('tab', { name: '이벤트' }))

    expect(await screen.findByText('승인 신청 90에 따라 자동 생성')).toBeInTheDocument()
    const rows = screen.getAllByRole('row')
    // 헤더 다음 첫 행이 최신 이벤트(START)
    expect(within(rows[1]).getByText('시작')).toBeInTheDocument()
  })

  test('ORG_ADMIN에게는 차단 토글이 비활성+사유로 보이고 전원 제어는 열려 있다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByRole('button', { name: '종료' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '접속 차단' })).toBeDisabled()
    expect(
      screen.getByText('차단 토글은 시스템 관리자만 수행할 수 있습니다.'),
    ).toBeInTheDocument()
  })
})
