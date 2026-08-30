import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { userPatchBodies } from '../test/msw/handlers/admin'
import { adminProfilePatches } from '../test/msw/handlers/users'
import {
  orgAdminUser,
  refreshSuccessHandler,
  sysAdminUser,
  sysViewerUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

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
    await user.click(screen.getByRole('button', { name: '인증 대기' }))
    expect(await screen.findByText('pending.choi@pusan.ac.kr')).toBeInTheDocument()
    expect(screen.queryByText('example@pusan.ac.kr')).not.toBeInTheDocument()
  })

  test('ORG_ADMIN은 active 기관 사용자만 보고 검색한다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    expect(await screen.findByText('example@pusan.ac.kr')).toBeInTheDocument()
    // 전역 selector의 active 기관이 사용자 목록 API 기본 scope가 된다.
    await user.type(screen.getByLabelText('사용자 검색'), 'outsider')
    await waitFor(() =>
      expect(screen.queryByText('example@pusan.ac.kr')).not.toBeInTheDocument(),
    )
    expect(screen.queryByText('outsider.jung@pusan.ac.kr')).not.toBeInTheDocument()
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
    await user.type(screen.getByPlaceholderText(/비활성화 사유를 입력/), '리소스 남용 신고 확인')
    await user.click(screen.getByRole('button', { name: '비활성화' }))

    // 상세가 갱신돼 해제 버튼이 나타난다
    expect(await screen.findByRole('button', { name: '비활성화 해제' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '비활성화 해제' }))
    expect(await screen.findByRole('button', { name: '계정 비활성화' })).toBeInTheDocument()
  })

  // 상태를 바꾼 사람은 이메일로만 적혀 있었다. 이름이 오는 지금은 이름으로 읽는다 —
  // 둘 다 붙이면 한 사람을 두 번 부르는 셈이라 이름만 남긴다.
  test('상태 변경 이력은 수행자를 이름으로 적는다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await openDetail(user, '홍길동')
    const panel = (await screen.findByText('계정 상태 관리')).closest('section')!
    await user.click(within(panel).getByRole('button', { name: '계정 비활성화' }))
    await user.type(screen.getByPlaceholderText(/비활성화 사유를 입력/), '리소스 남용 신고 확인')
    await user.click(screen.getByRole('button', { name: '비활성화' }))

    const history = (await screen.findByText('상태 변경 이력')).closest('section')!
    const entry = (await within(history).findByText(/리소스 남용 신고 확인/)).closest('li')!
    expect(entry.textContent).toContain(sysAdminUser.name)
    expect(entry.textContent).not.toContain(sysAdminUser.email)
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

  test('워크스페이스 멤버십의 VM 보기 링크로 VM 관리에 워크스페이스 필터가 적용된다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await openDetail(user, '홍길동')
    const drawer = within(await screen.findByRole('dialog', { name: '사용자 상세' }))
    const membership = (await drawer.findByText('연구팀')).closest('li')!
    await user.click(within(membership).getByRole('link', { name: 'VM 보기' }))

    // 라우트 이동으로 드로어가 닫히고, 해당 워크스페이스의 VM만 조회된다 (연구팀 VM 없음)
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
      drawer.getByText('기관 계층 역할은 관리할 기관을 선택해야 합니다.'),
    ).toBeInTheDocument()
    expect(userPatchBodies).toHaveLength(0)

    // 기관을 지정하면 선택된 사용자를 대상으로 제출된다 (ID 수기 입력 없음)
    await user.selectOptions(drawer.getByLabelText('관리 기관'), uuid(1))
    await user.click(drawer.getByRole('button', { name: '역할 변경' }))
    expect(await screen.findByText(/홍길동.*기관 관리자.*변경했습니다/)).toBeInTheDocument()
    expect(userPatchBodies).toEqual([{ userId: uuid(42), body: { role: 'ORG_ADMIN', orgId: uuid(1) } }])
  })

  test('ORG_ADMIN에게는 전역 역할 변경이 보이지 않는다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await openDetail(user, '홍길동')
    const drawer = within(await screen.findByRole('dialog', { name: '사용자 상세' }))
    await drawer.findByText('워크스페이스 멤버십')
    expect(drawer.queryByText('역할 관리')).not.toBeInTheDocument()
    expect(drawer.queryByRole('button', { name: '역할 변경' })).not.toBeInTheDocument()
  })

  test('ORG_ADMIN에게는 계정 상태 관리가 보이지 않는다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await openDetail(user, '홍길동')
    await screen.findByText('워크스페이스 멤버십')
    expect(screen.queryByText('계정 상태 관리')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '계정 비활성화' })).not.toBeInTheDocument()
  })

  test('ORG_ADMIN이 자기 관리 기관의 역할을 부여하고 회수한다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await openDetail(user, '홍길동')
    const drawer = within(await screen.findByRole('dialog', { name: '사용자 상세' }))
    await drawer.findByText('기관 역할')
    expect(drawer.getByText('관리하는 기관이 없습니다.')).toBeInTheDocument()

    // 부여할 수 있는 기관은 행위자가 관리자로 있는 기관뿐이다.
    const orgSelect = drawer.getByLabelText('부여할 기관')
    expect(
      within(orgSelect as HTMLSelectElement).queryByRole('option', { name: '전자공학과' }),
    ).not.toBeInTheDocument()
    await user.selectOptions(orgSelect, uuid(1))
    // 역할 선택지에는 열람 역할도 있다 — 기관끼리 서로 보게 하는 부여 통로다.
    const roleSelect = drawer.getByLabelText('부여할 역할')
    expect(
      within(roleSelect as HTMLSelectElement).getByRole('option', { name: '기관 열람자' }),
    ).toBeInTheDocument()
    await user.selectOptions(roleSelect, 'ORG_MANAGER')
    await user.click(drawer.getByRole('button', { name: '부여' }))

    // 부여되면 목록 항목이 생기고 '관리하는 기관이 없습니다'가 사라진다.
    await waitFor(() =>
      expect(drawer.queryByText('관리하는 기관이 없습니다.')).not.toBeInTheDocument(),
    )
    expect(drawer.getByRole('button', { name: '회수' })).toBeEnabled()

    // 마지막 관리 기관을 회수하면 일반 사용자가 된다고 확인 모달이 말한다.
    await user.click(drawer.getByRole('button', { name: '회수' }))
    const modal = within(await screen.findByRole('dialog', { name: '기관 역할 회수' }))
    expect(
      modal.getByText(/마지막 관리 기관이므로 이 계정은 일반 사용자가 되고/),
    ).toBeInTheDocument()
    await user.click(modal.getByRole('button', { name: '회수' }))

    await waitFor(() =>
      expect(drawer.getByText('관리하는 기관이 없습니다.')).toBeInTheDocument(),
    )
  })

  test('ORG active scope에서는 기관 소속이 없는 시스템 계정을 노출하지 않는다', async () => {
    renderAsOrgAdmin()

    await screen.findByRole('heading', { name: '사용자 관리' })
    expect(screen.queryByRole('button', { name: '이시스템' })).not.toBeInTheDocument()
  })

  test('SYS_ADMIN은 상세에서 프로필을 읽고 정정한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await openDetail(user, '홍길동')
    // 잠긴 값이라 본인은 못 바꾼다. 관리자가 읽을 수 있어야 정정이 성립한다.
    expect(await screen.findByText('202012345')).toBeInTheDocument()
    expect(await screen.findByText('학부생')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '정정' }))
    await screen.findByRole('heading', { name: '프로필 정정' })

    await user.clear(screen.getByLabelText('학번'))
    await user.type(screen.getByLabelText('학번'), '202054321')
    await user.type(screen.getByLabelText('사유'), '본인 확인 후 정정')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(adminProfilePatches).toHaveLength(1))
    expect(adminProfilePatches[0].body).toMatchObject({
      studentNo: '202054321',
      reason: '본인 확인 후 정정',
    })
  })

  test('기관 계층에는 프로필이 오지 않고 그 사실을 적는다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await openDetail(user, '홍길동')
    // 이 엔드포인트는 다른 기관 직원이 받는 ORG_VIEWER 까지 받고 기관 범위로 좁히지도
    // 않으므로 서버가 비워서 보낸다. 화면은 값이 없는 것과 볼 권한이 없는 것을 구분해
    // 적어야 한다 — 「입력하지 않음」으로 찍으면 거짓말이 된다.
    expect(
      await screen.findByText('직책과 학번과 소속은 시스템 계층에서만 조회할 수 있습니다.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('202012345')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '정정' })).not.toBeInTheDocument()
  })

  test('무변경 저장은 요청을 보내지 않는다', async () => {
    // 서버는 저장값 재전송을 no-op 으로 흡수하지만 감사와 알림은 남는다. 실수로 눌러도
    // 본인에게 「관리자가 프로필을 정정했습니다」가 간다.
    const user = userEvent.setup()
    renderAsSysAdmin()

    await openDetail(user, '홍길동')
    await user.click(screen.getByRole('button', { name: '정정' }))
    await screen.findByRole('heading', { name: '프로필 정정' })
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: '프로필 정정' })).not.toBeInTheDocument(),
    )
    expect(adminProfilePatches).toHaveLength(0)
  })

  test('한 필드만 고쳐도 본문은 저장값 전체를 담는다', async () => {
    // 프리필이 깨지는 회귀의 유일한 방어선이다. 열 때 값을 못 채우면 본문에
    // null 이 실려 전면 비우기가 되는데, 부분 검사로는 통과한다.
    const user = userEvent.setup()
    renderAsSysAdmin()

    await openDetail(user, '홍길동')
    await user.click(screen.getByRole('button', { name: '정정' }))
    await screen.findByRole('heading', { name: '프로필 정정' })
    await user.clear(screen.getByLabelText('학번'))
    await user.type(screen.getByLabelText('학번'), '202054321')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(adminProfilePatches).toHaveLength(1))
    expect(adminProfilePatches[0].body).toEqual({
      position: 'STUDENT_UNDERGRAD',
      studentNo: '202054321',
      departmentCode: 'COMPUTER_SCIENCE',
      departmentOther: null,
      reason: null,
    })
  })

  test('학생의 학번만 비우면 서버가 거절한다', async () => {
    // 이 엔드포인트의 존재 이유가 「잘못 들어간 값 제거」인데, 학생 직책은 학번을
    // 요구하므로 학번만 비우는 정정은 성립하지 않는다. 직책도 함께 옮겨야 한다.
    const user = userEvent.setup()
    renderAsSysAdmin()

    await openDetail(user, '홍길동')
    await user.click(screen.getByRole('button', { name: '정정' }))
    await screen.findByRole('heading', { name: '프로필 정정' })
    await user.clear(screen.getByLabelText('학번'))
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('학번을 입력해 주세요.')).toBeInTheDocument()
  })

  test('정정 폼도 기타 코드만으로는 저장할 수 없다', async () => {
    // 이 화면은 소속이 「기타」로 굳은 계정을 고치러 오는 곳이면서, 차단이 없으면 같은
    // 상태를 다시 만들 수 있는 곳이다. 서버에 이 규칙이 없고 CHECK 도 허용한다.
    const user = userEvent.setup()
    renderAsSysAdmin()

    await openDetail(user, '홍길동')
    await user.click(screen.getByRole('button', { name: '정정' }))
    await screen.findByRole('heading', { name: '프로필 정정' })

    await user.selectOptions(screen.getByLabelText('소속 학과 코드'), 'OTHER')
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.getByText(/소속이 「기타」라는 값으로 굳습니다/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('소속 직접 입력'), '융합학부')
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
  })

  test('정정이 두 번이면 알림도 두 번이다', async () => {
    // dedup 키가 시각 기준으로 되돌아가면 같은 밀리초의 두 정정이 한 건으로 합쳐진다.
    // 키가 갈라 놓아야 하는 유일한 경우다.
    const user = userEvent.setup()
    renderAsSysAdmin()

    await openDetail(user, '홍길동')
    for (const value of ['202054321', '202099999']) {
      await user.click(screen.getByRole('button', { name: '정정' }))
      await screen.findByRole('heading', { name: '프로필 정정' })
      await user.clear(screen.getByLabelText('학번'))
      await user.type(screen.getByLabelText('학번'), value)
      await user.click(screen.getByRole('button', { name: '저장' }))
      await waitFor(() =>
        expect(screen.queryByRole('heading', { name: '프로필 정정' })).not.toBeInTheDocument(),
      )
    }
    expect(adminProfilePatches).toHaveLength(2)
    expect(adminProfilePatches.map((p) => p.body.studentNo)).toEqual(['202054321', '202099999'])
  })

  test('시스템 열람자는 프로필을 읽지만 정정하지 못한다', async () => {
    // 경계가 둘이다. 조회는 시스템 계층 전체이고 정정은 SYS_ADMIN 하나다. 기관 계층은
    // 절 자체가 보이지 않으므로 이 갈래가 없으면 두 번째 경계가 검사되지 않는다.
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser))
    renderApp('/admin/users')

    await openDetail(user, '홍길동')
    expect(await screen.findByText('202012345')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '정정' })).not.toBeInTheDocument()
  })

  test('코드와 직접 입력을 함께 보내면 필드 오류로 돌아온다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await openDetail(user, '홍길동')
    await user.click(screen.getByRole('button', { name: '정정' }))
    await screen.findByRole('heading', { name: '프로필 정정' })

    // 소속의 두 모양은 대안이다. 목록에 없는 학과의 학생만 둘을 함께 쓴다.
    await user.type(screen.getByLabelText('소속 직접 입력'), '부설연구소')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(
      await screen.findByText(
        '목록에서 고른 소속과 직접 입력한 소속 중 하나만 보낼 수 있습니다.',
      ),
    ).toBeInTheDocument()
  })
})
