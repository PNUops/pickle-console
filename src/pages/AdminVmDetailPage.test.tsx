import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  orgViewerUser,
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

    // RUNNING: 상태상 가능한 액션만 보인다.
    expect(screen.queryByRole('button', { name: '시작' })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: '종료' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강제 종료' })).not.toBeInTheDocument()
  })

  test('SYS 기관 scope 밖의 VM deep link는 작업 action을 렌더하지 않는다', async () => {
    renderAsSysAdmin(`/admin/vms/${uuid(61)}?org=${uuid(1)}`)

    expect(
      await screen.findByText('선택한 관리 범위의 가상머신이 아닙니다'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'ai-train' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '종료' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '가상머신 목록으로 돌아가기' })).toHaveAttribute(
      'href',
      `/admin/vms?org=${uuid(1)}`,
    )
  })

  test('이벤트 탭은 이력을 최신순으로 보여준다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('tab', { name: '이벤트' }))

    expect(await screen.findByText('승인 신청 90에 따라 자동 생성')).toBeInTheDocument()
    const rows = screen.getAllByRole('row')
    // 헤더 다음 첫 행이 최신 이벤트(관리자 차단), 그다음이 START.
    // 사용자 화면과 달리 개입한 관리자의 이름이 배지와 함께 보인다.
    expect(within(rows[1]).getByText('SSH·터미널 차단')).toBeInTheDocument()
    expect(within(rows[1]).getByText('운영 담당자')).toBeInTheDocument()
    expect(within(rows[1]).getByText('관리자')).toBeInTheDocument()
    expect(within(rows[2]).getByText('시작')).toBeInTheDocument()
    expect(within(rows[2]).getByText('홍길동')).toBeInTheDocument()
  })

  test('감사 로그가 닫힌 역할에게는 이벤트 이력의 관리자 이름이 가려진다', async () => {
    // 서버가 이 역할에게만 관리자 행의 신원을 비운다. 목이 그 규칙을 모르면
    // 이름이 비어 오는 화면 자체를 테스트가 한 번도 지나가지 못한다.
    server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
    const user = userEvent.setup()
    renderApp(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('tab', { name: '이벤트' }))

    await screen.findByText('승인 신청 90에 따라 자동 생성')
    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getByText('SSH·터미널 차단')).toBeInTheDocument()
    expect(within(rows[1]).getByText('관리자')).toBeInTheDocument()
    expect(within(rows[1]).queryByText('운영 담당자')).not.toBeInTheDocument()
    // 동료 행은 그대로 이름이 보인다 — 가리는 것은 개입한 관리자뿐이다.
    expect(within(rows[2]).getByText('홍길동')).toBeInTheDocument()
  })

  test('수행 화면을 모르는 행은 이름과 함께 미기록으로 구분된다', async () => {
    // 관리자에게는 이름이 오지만, 동료가 한 일과 같은 모양으로 그리면 서버가
    // 거부한 추측을 화면이 대신하게 된다.
    const user = userEvent.setup()
    renderAsSysAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('tab', { name: '이벤트' }))

    await screen.findByText('승인 신청 90에 따라 자동 생성')
    const rows = screen.getAllByRole('row')
    const unknownRow = rows[rows.length - 1]
    expect(within(unknownRow).getByText('홍길동')).toBeInTheDocument()
    expect(within(unknownRow).getByText('화면 미기록')).toBeInTheDocument()
  })

  test('ORG_ADMIN에게는 차단 토글이 보이지 않고 전원 제어는 열린다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByRole('button', { name: '종료' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '접속 차단' })).not.toBeInTheDocument()
  })

  test('ORG_VIEWER에게는 전원 제어와 기간 연장이 보이지 않는다', async () => {
    server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
    renderApp(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.queryByRole('button', { name: '종료' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '기간 연장' })).not.toBeInTheDocument()
    expect(screen.queryByText('전원 제어 (관리자 개입)')).not.toBeInTheDocument()
  })
})
