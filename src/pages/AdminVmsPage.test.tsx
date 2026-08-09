import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  problemResponse,
  refreshSuccessHandler,
  sysAdminUser,
  sysManagerUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderAsOrgAdmin() {
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
  renderApp('/admin/vms')
}

function renderAsSysAdmin() {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp('/admin/vms')
}

/** 목록에서 VM 행을 클릭해 상세 드로어를 연다. */
async function selectVm(user: ReturnType<typeof userEvent.setup>, name: string) {
  const row = (await screen.findByText(name)).closest('tr')!
  await user.click(row)
  return screen.findByRole('dialog', { name: 'VM 상세' })
}

describe('관리자 VM 목록', () => {
  test('VM을 워크스페이스 이름과 함께 나열하고 상태 탭·기관 필터가 동작한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByRole('heading', { name: 'VM 관리' })
    const row = (await screen.findByText('capstone-team3-api')).closest('tr')!
    expect(within(row).getByText('캡스톤 3조')).toBeInTheDocument()

    // 상태 탭: 중지됨 → STOPPED VM만
    await user.click(screen.getByRole('button', { name: '중지됨' }))
    expect(await screen.findByText('web-lab')).toBeInTheDocument()
    expect(screen.queryByText('capstone-team3-api')).not.toBeInTheDocument()

    // 기관 필터 (SYS_ADMIN 전용): org 2 → ai-train만
    await user.click(screen.getByRole('button', { name: '전체' }))
    await user.selectOptions(screen.getByLabelText('기관 필터'), '2')
    expect(await screen.findByText('ai-train')).toBeInTheDocument()
    expect(screen.queryByText('capstone-team3-api')).not.toBeInTheDocument()
  })

  test('이름 검색과 정렬 헤더가 서버 파라미터로 동작한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()
    await screen.findByText('capstone-team3-api')

    // 검색(디바운스): 'algo' → algo-judge만 남는다
    await user.type(screen.getByLabelText('VM 검색'), 'algo')
    await waitFor(() =>
      expect(screen.queryByText('capstone-team3-api')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('algo-judge')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('VM 검색'))
    await screen.findByText('capstone-team3-api')

    // 이름 헤더 클릭 → 오름차순 (ai-train이 첫 행)
    await user.click(screen.getByRole('button', { name: '이름' }))
    expect(screen.getByRole('columnheader', { name: '이름' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    await waitFor(() => {
      const firstRow = screen.getAllByRole('row')[1]
      expect(within(firstRow).getByText('ai-train')).toBeInTheDocument()
    })

    // 다시 클릭 → 내림차순, 세 번째 클릭 → 해제(기본 최신순)
    await user.click(screen.getByRole('button', { name: '이름' }))
    expect(screen.getByRole('columnheader', { name: '이름' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    await waitFor(() => {
      const firstRow = screen.getAllByRole('row')[1]
      expect(within(firstRow).getByText('web-lab')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: '이름' }))
    expect(screen.getByRole('columnheader', { name: '이름' })).not.toHaveAttribute('aria-sort')
  })

  test('워크스페이스 필터 드롭다운으로 워크스페이스를 좁힐 수 있고, 기관 변경 시 선택이 초기화된다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByText('capstone-team3-api')
    const workspaceSelect = screen.getByLabelText('워크스페이스 필터')
    expect(within(workspaceSelect).getByRole('option', { name: /캡스톤 3조/ })).toBeInTheDocument()

    await user.selectOptions(workspaceSelect, '12')
    expect(await screen.findByText('capstone-team3-api')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('ai-train')).not.toBeInTheDocument())

    // 기관을 바꾸면 이전 기관의 워크스페이스 선택은 무효 → 전체 워크스페이스로 초기화
    await user.selectOptions(screen.getByLabelText('기관 필터'), '2')
    expect(screen.getByLabelText('워크스페이스 필터')).toHaveValue('')
    expect(await screen.findByText('ai-train')).toBeInTheDocument()
  })

  test('ORG_ADMIN에게는 기관 필터가 없고 강제 삭제는 비활성+사유로 보인다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await screen.findByRole('heading', { name: 'VM 관리' })
    expect(screen.queryByLabelText('기관 필터')).not.toBeInTheDocument()

    await selectVm(user, 'algo-judge')
    expect(screen.getByRole('button', { name: '일반 삭제 접수' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '삭제 취소' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '강제 삭제' })).toBeDisabled()
    expect(
      screen.getByText('강제 삭제는 시스템 관리자만 수행할 수 있습니다.'),
    ).toBeInTheDocument()
  })

  test('SYS_MANAGER에게도 드로어가 열리고 삭제 조작은 비활성+사유로 보인다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-manager', sysManagerUser))
    renderApp('/admin/vms')

    const drawer = await selectVm(user, 'algo-judge')
    expect(within(drawer).getByText('호스트네임')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '일반 삭제 접수' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '삭제 취소' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '강제 삭제' })).toBeDisabled()
    expect(
      screen.getByText('일반 삭제 접수·취소는 기관 관리자·시스템 관리자만 수행할 수 있습니다.'),
    ).toBeInTheDocument()
  })
})

describe('관리자 VM 일반 삭제 접수', () => {
  test('과거 날짜는 422 필드 에러, 7일 미만은 경고와 함께 접수된다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await selectVm(user, 'algo-judge')
    const dateInput = screen.getByLabelText(/파기 예정일/)
    const reasonInput = screen.getByLabelText(/삭제 사유/)

    // 과거 시각 → 서버 422 → scheduledFor 필드 에러 (유일하게 남은 날짜 규칙)
    fireEvent.change(dateInput, { target: { value: '2020-01-01' } })
    await user.type(reasonInput, '사용 종료일이 지난 VM 정리')
    expect(
      screen.getByText(/권장 통보 기간\(7일\)보다 이른 파기 예정일입니다/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '일반 삭제 접수' }))
    expect(
      await screen.findByText('삭제 예정일은 미래 시각이어야 합니다.'),
    ).toBeInTheDocument()

    // 미래이되 권장 통보 기간(7일) 미만 → 경고 표시 상태로도 접수된다
    const nearDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
    fireEvent.change(dateInput, { target: { value: nearDate } })
    expect(
      screen.getByText(/권장 통보 기간\(7일\)보다 이른 파기 예정일입니다/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '일반 삭제 접수' }))
    expect(
      await screen.findByText(
        '일반 삭제를 접수했습니다. 사용자에게 사유가 포함된 통보 메일이 발송됩니다.',
      ),
    ).toBeInTheDocument()
  })

  test('사유 없이 제출하면 필드 에러를 보여준다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await selectVm(user, 'algo-judge')
    fireEvent.change(screen.getByLabelText(/파기 예정일/), {
      target: { value: '2099-01-01' },
    })
    await user.click(screen.getByRole('button', { name: '일반 삭제 접수' }))
    expect(await screen.findByText('삭제 사유를 입력해 주세요.')).toBeInTheDocument()
  })
})

describe('교차 링크·URL 필터', () => {
  test('URL의 workspaceId 파라미터로 워크스페이스 필터가 초기화된다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/vms?workspaceId=12')

    await screen.findByRole('heading', { name: 'VM 관리' })
    expect(await screen.findByText('capstone-team3-api')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('ai-train')).not.toBeInTheDocument())
    expect(screen.getByLabelText('워크스페이스 필터')).toHaveValue('12')
  })

  test('드로어의 워크스페이스 링크로 같은 워크스페이스 VM만 필터한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await selectVm(user, 'capstone-team3-api')
    await user.click(screen.getByRole('button', { name: '이 워크스페이스의 VM 보기' }))

    // 드로어가 닫히고 워크스페이스 필터가 적용된다
    expect(screen.queryByRole('dialog', { name: 'VM 상세' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('워크스페이스 필터')).toHaveValue('12')
    await waitFor(() => expect(screen.queryByText('ai-train')).not.toBeInTheDocument())
  })
})

describe('SSH·웹 터미널 차단 토글', () => {
  test('SYS_ADMIN이 드로어에서 차단하면 차단 배지와 해제 버튼으로 바뀐다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await selectVm(user, 'algo-judge')
    await user.click(screen.getByRole('button', { name: '접속 차단' }))
    const dialog = await screen.findByRole('dialog', { name: 'SSH·웹 터미널 차단' })
    await user.type(within(dialog).getByPlaceholderText(/감사 기록/), '남용 신고 확인')
    await user.click(within(dialog).getByRole('button', { name: '차단' }))

    expect(await screen.findByText('SSH·웹 터미널 접속을 차단했습니다.')).toBeInTheDocument()
    expect(await screen.findByText('SSH·터미널 차단됨')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '차단 해제' })).toBeEnabled()
  })

  test('ORG_ADMIN에게는 차단 토글이 비활성+사유로 보인다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await selectVm(user, 'algo-judge')
    expect(screen.getByRole('button', { name: '접속 차단' })).toBeDisabled()
    expect(
      screen.getByText('차단 토글은 시스템 관리자만 수행할 수 있습니다.'),
    ).toBeInTheDocument()
  })
})

describe('VM 드로어 기간 연장', () => {
  test('드로어에서 기간을 연장하면 확인 메시지가 남는다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await selectVm(user, 'algo-judge')
    await user.click(screen.getByRole('button', { name: '기간 연장' }))
    const dialog = await screen.findByRole('dialog', { name: '기간 연장 — algo-judge' })
    fireEvent.change(within(dialog).getByLabelText(/새 종료일/), {
      target: { value: '2099-01-01' },
    })
    await user.click(within(dialog).getByRole('button', { name: '연장' }))

    expect(await screen.findByText(/연장되었습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '기간 연장 — algo-judge' })).not.toBeInTheDocument()
  })
})

describe('관리자 삭제 취소', () => {
  test('본인 삭제 유예 중 VM을 취소하면 중지됨으로 남는다는 안내를 보여준다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await selectVm(user, 'retiring-vm')
    await user.click(screen.getByRole('button', { name: '삭제 취소' }))

    expect(
      await screen.findByText(
        '삭제가 취소되었습니다. VM은 중지됨 상태로 남으며, 시작은 사용자가 직접 수행합니다.',
      ),
    ).toBeInTheDocument()
    // 목록 무효화로 상태 배지도 중지됨으로 갱신된다. (드로어에도 이름이 있어
    // 행은 목록의 이름 버튼 기준으로 찾는다.)
    await waitFor(() => {
      const row = screen.getByRole('button', { name: 'retiring-vm' }).closest('tr')!
      expect(within(row).getByText('중지됨')).toBeInTheDocument()
    })
  })

  test('필터 탭에서 취소로 VM이 목록을 떠나도 결과 안내가 남는다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    // 삭제 중 탭에서 취소하면 VM이 중지됨으로 바뀌어 필터된 목록을 떠나고
    // 드로어가 닫힌다 — 결과 안내는 페이지 알림으로 남아야 한다.
    await screen.findByRole('heading', { name: 'VM 관리' })
    await user.click(screen.getByRole('button', { name: '삭제 중' }))
    await selectVm(user, 'retiring-vm')
    await user.click(screen.getByRole('button', { name: '삭제 취소' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'VM 상세' })).not.toBeInTheDocument()
    })
    expect(
      screen.getByText(
        '삭제가 취소되었습니다. VM은 중지됨 상태로 남으며, 시작은 사용자가 직접 수행합니다.',
      ),
    ).toBeInTheDocument()
  })

  test('대기 중인 삭제가 없으면 409 안내를 보여준다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await selectVm(user, 'algo-judge')
    await user.click(screen.getByRole('button', { name: '삭제 취소' }))
    expect(
      await screen.findByText(/취소할 수 있는 삭제가 없습니다/),
    ).toBeInTheDocument()
  })
})

describe('강제 삭제 (SYS_ADMIN)', () => {
  test('이름 확인 모달을 거쳐 즉시 파기를 접수한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await selectVm(user, 'algo-judge')
    await user.click(screen.getByRole('button', { name: '강제 삭제' }))

    const dialog = await screen.findByRole('dialog', { name: 'VM 강제 삭제' })
    const confirm = within(dialog).getByRole('button', { name: '즉시 파기' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'algo-judge')
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    expect(
      await screen.findByText(
        '강제 삭제를 접수했습니다. VM이 즉시 강제 종료되고 파기됩니다.',
      ),
    ).toBeInTheDocument()
    // 목록 무효화로 상태가 삭제됨으로 갱신된다. (드로어에도 이름이 있어
    // 행은 목록의 이름 버튼 기준으로 찾는다.)
    await waitFor(() => {
      const row = screen.getByRole('button', { name: 'algo-judge' }).closest('tr')!
      expect(within(row).getByText('삭제됨')).toBeInTheDocument()
    })
  })

  test('강제 삭제가 409로 실패하면 모달이 유지되고 입력을 다시 치지 않아도 재시도할 수 있다', async () => {
    const user = userEvent.setup()
    // 첫 요청만 이름 불일치 409 — 이후에는 기본 핸들러(성공)로 떨어진다.
    server.use(
      http.post(
        '*/api/v1/admin/vms/:vmId/force-delete',
        () =>
          problemResponse({
            type: 'about:blank',
            title: '확인용 이름이 일치하지 않습니다',
            status: 409,
            detail:
              '입력한 이름이 VM 이름과 일치하지 않습니다. VM 이름을 정확히 입력해 주세요.',
            code: 'VM_CONFIRM_NAME_MISMATCH',
          }),
        { once: true },
      ),
    )
    renderAsSysAdmin()

    await selectVm(user, 'algo-judge')
    await user.click(screen.getByRole('button', { name: '강제 삭제' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 강제 삭제' })
    await user.type(within(dialog).getByRole('textbox'), 'algo-judge')
    await user.click(within(dialog).getByRole('button', { name: '즉시 파기' }))

    // 모달이 닫히지 않고 오류가 모달 안에 인라인으로 표시되며 입력이 보존된다.
    expect(
      await within(dialog).findByText(/입력한 이름이 VM 이름과 일치하지 않습니다/),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox')).toHaveValue('algo-judge')

    // 다시 치지 않고 재시도만으로 접수된다.
    await user.click(within(dialog).getByRole('button', { name: '즉시 파기' }))
    expect(
      await screen.findByText(
        '강제 삭제를 접수했습니다. VM이 즉시 강제 종료되고 파기됩니다.',
      ),
    ).toBeInTheDocument()
  })

  test('필터된 목록에서 VM이 사라져 패널이 언마운트돼도 접수 확인 메시지는 남는다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    // 실행 중 탭에서 강제 삭제 → DELETED가 되며 목록에서 빠져 패널이 사라진다.
    await screen.findByRole('heading', { name: 'VM 관리' })
    await user.click(screen.getByRole('button', { name: '실행 중' }))
    await selectVm(user, 'algo-judge')
    await user.click(screen.getByRole('button', { name: '강제 삭제' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 강제 삭제' })
    await user.type(within(dialog).getByRole('textbox'), 'algo-judge')
    await user.click(within(dialog).getByRole('button', { name: '즉시 파기' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'VM 상세' })).not.toBeInTheDocument(),
    )
    expect(
      screen.getByText('강제 삭제를 접수했습니다. VM이 즉시 강제 종료되고 파기됩니다.'),
    ).toBeInTheDocument()
  })
})
