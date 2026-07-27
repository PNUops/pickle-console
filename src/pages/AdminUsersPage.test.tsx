import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { userPatchBodies } from '../test/msw/handlers/admin'
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
    expect(await screen.findByText('example@pusan.ac.kr')).toBeInTheDocument()
    expect(screen.getByText('outsider.jung@pusan.ac.kr')).toBeInTheDocument()

    // 상태 탭: 인증 대기 → PENDING만
    await user.click(screen.getByRole('tab', { name: '인증 대기' }))
    expect(await screen.findByText('pending.choi@pusan.ac.kr')).toBeInTheDocument()
    expect(screen.queryByText('example@pusan.ac.kr')).not.toBeInTheDocument()
  })

  test('ORG_ADMIN은 파생 소속 사용자만 보고, 타 기관 사용자는 검색되지 않는다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    // 파생 소속(org1) 사용자는 보인다
    expect(await screen.findByText('example@pusan.ac.kr')).toBeInTheDocument()
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
    // 상세 드로어: 활성 VM 수·멤버십이 보인다
    const panel = (await screen.findByText('계정 상태 관리')).closest('section')!
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

    const dialog = within(screen.getByRole('dialog', { name: '2단계 인증 초기화' }))
    await user.click(dialog.getByRole('button', { name: '초기화' }))

    expect(await screen.findByText(/2단계 인증을 초기화했습니다/)).toBeInTheDocument()
  })

  test('그룹 멤버십의 VM 보기 링크로 VM 관리에 그룹 필터가 적용된다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await openDetail(user, '홍길동')
    const drawer = within(await screen.findByRole('dialog', { name: '사용자 상세' }))
    const membership = (await drawer.findByText('연구팀')).closest('li')!
    await user.click(within(membership).getByRole('link', { name: 'VM 보기' }))

    // 라우트 이동으로 드로어가 닫히고, 해당 그룹의 VM만 조회된다 (연구팀 VM 없음)
    await screen.findByRole('heading', { name: 'VM 관리' })
    expect(screen.queryByRole('dialog', { name: '사용자 상세' })).not.toBeInTheDocument()
    expect(await screen.findByText('표시할 VM이 없습니다.')).toBeInTheDocument()
  })

  test('상세는 드로어로 열리고 닫기 버튼으로 닫힌다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await openDetail(user, '홍길동')
    const drawer = await screen.findByRole('dialog', { name: '사용자 상세' })
    expect(drawer).toHaveAttribute('aria-modal', 'true')

    await user.click(within(drawer).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog', { name: '사용자 상세' })).not.toBeInTheDocument()
  })

  test('SYS_ADMIN은 상세에서 역할을 변경할 수 있고 기관 미선택이면 제출하지 않는다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await openDetail(user, '홍길동')
    const drawer = within(await screen.findByRole('dialog', { name: '사용자 상세' }))
    await drawer.findByText('역할 관리')

    // 기관 계층 역할인데 기관을 고르지 않으면 클라이언트에서 막는다
    await user.selectOptions(drawer.getByLabelText('역할'), 'ORG_ADMIN')
    await user.click(drawer.getByRole('button', { name: '역할 변경' }))
    expect(
      drawer.getByText('기관 관리자·기관 운영자는 관리할 기관을 선택해야 합니다.'),
    ).toBeInTheDocument()
    expect(userPatchBodies).toHaveLength(0)

    // 기관을 지정하면 선택된 사용자를 대상으로 제출된다 (ID 수기 입력 없음)
    await user.selectOptions(drawer.getByLabelText('관리 기관'), '1')
    await user.click(drawer.getByRole('button', { name: '역할 변경' }))
    expect(await screen.findByText(/홍길동.*기관 관리자.*변경했습니다/)).toBeInTheDocument()
    expect(userPatchBodies).toEqual([{ userId: 42, body: { role: 'ORG_ADMIN', orgId: 1 } }])
  })

  test('ORG_ADMIN에게는 역할 변경이 보이되 비활성 상태다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await openDetail(user, '홍길동')
    const drawer = within(await screen.findByRole('dialog', { name: '사용자 상세' }))
    await drawer.findByText('역할 관리')
    expect(
      drawer.getByText('역할 변경은 시스템 관리자만 수행할 수 있습니다.'),
    ).toBeInTheDocument()
    expect(drawer.getByRole('button', { name: '역할 변경' })).toBeDisabled()
    expect(drawer.getByLabelText('역할')).toBeDisabled()
  })

  test('ORG_ADMIN에게도 상태 관리가 보이되 비활성 상태로 사유가 표시된다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await openDetail(user, '홍길동')
    await screen.findByText('그룹 멤버십')
    expect(screen.getByText('계정 상태 관리')).toBeInTheDocument()
    expect(
      screen.getByText('계정 상태 변경과 2단계 인증 초기화는 시스템 관리자만 수행할 수 있습니다.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '계정 비활성화' })).toBeDisabled()
  })
})
