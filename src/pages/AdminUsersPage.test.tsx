import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { orgAdminUser, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderAsSysAdmin() {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp('/admin/users')
}

function renderAsOrgAdmin() {
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
  renderApp('/admin/users')
}

async function openDetail(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name }))
}

describe('관리자 사용자 목록', () => {
  test('SYS_ADMIN은 전체 사용자를 나열하고 상태 탭이 동작한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByRole('heading', { name: '사용자 관리' })
    expect(await screen.findByText('gildong.hong@pusan.ac.kr')).toBeInTheDocument()
    expect(screen.getByText('outsider.jung@pusan.ac.kr')).toBeInTheDocument()

    // 상태 탭: 인증 대기 → PENDING만
    await user.click(screen.getByRole('tab', { name: '인증 대기' }))
    expect(await screen.findByText('pending.choi@pusan.ac.kr')).toBeInTheDocument()
    expect(screen.queryByText('gildong.hong@pusan.ac.kr')).not.toBeInTheDocument()
  })

  test('ORG_ADMIN은 파생 소속 사용자만 보고, 타 기관 사용자는 검색되지 않는다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    // 파생 소속(org1) 사용자는 보인다
    expect(await screen.findByText('gildong.hong@pusan.ac.kr')).toBeInTheDocument()
    // 타 기관(org2) 사용자는 목록·검색에서 제외
    await user.type(screen.getByLabelText('사용자 검색'), 'outsider')
    await waitFor(() =>
      expect(screen.getByText('표시할 사용자가 없습니다.')).toBeInTheDocument(),
    )
  })

  test('SYS_ADMIN은 상세에서 계정을 비활성화하고 해제할 수 있다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await openDetail(user, '홍길동')
    // 상세 패널: 활성 VM 수·멤버십이 보인다
    const panel = (await screen.findByText('계정 상태 관리 (SYS_ADMIN)')).closest('section')!
    expect(screen.getByText('연구팀')).toBeInTheDocument()

    // 비활성화 모달 — 사유 없이는 버튼 비활성
    await user.click(within(panel).getByRole('button', { name: '계정 비활성화' }))
    const disableBtn = screen.getByRole('button', { name: '비활성화' })
    expect(disableBtn).toBeDisabled()
    await user.type(screen.getByPlaceholderText(/비활성화 사유를 입력/), '자원 남용 신고 확인')
    await user.click(screen.getByRole('button', { name: '비활성화' }))

    // 상세가 갱신돼 해제 버튼이 나타난다
    expect(await screen.findByRole('button', { name: '비활성화 해제' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '비활성화 해제' }))
    expect(await screen.findByRole('button', { name: '계정 비활성화' })).toBeInTheDocument()
  })

  test('SYS_ADMIN은 상세에서 2단계 인증을 초기화할 수 있다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await openDetail(user, '홍길동')
    await user.click(await screen.findByRole('button', { name: '2단계 인증 초기화' }))

    const dialog = within(screen.getByRole('dialog'))
    await user.click(dialog.getByRole('button', { name: '초기화' }))

    expect(await screen.findByText(/2단계 인증을 초기화했습니다/)).toBeInTheDocument()
  })

  test('ORG_ADMIN에게는 비활성화 조작이 노출되지 않는다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await openDetail(user, '홍길동')
    await screen.findByText('그룹 멤버십')
    expect(screen.queryByText('계정 상태 관리 (SYS_ADMIN)')).not.toBeInTheDocument()
  })
})
