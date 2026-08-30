import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  orgViewerUser,
  problemResponse,
  refreshSuccessHandler,
  sysAdminUser,
  sysManagerUser,
} from '../test/msw/handlers/auth'
import { vmStore } from '../test/msw/handlers/vms'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

function renderAsSysAdmin(path: string) {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(path)
}

function renderAsOrgAdmin(path: string) {
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
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

describe('관리자 VM 상세 작업', () => {
  test('워크스페이스 link는 기관 scope를 보존한 VM 목록 filter로 돌아간다', async () => {
    renderAsSysAdmin(`/admin/vms/${uuid(56)}?org=${uuid(1)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByRole('link', { name: 'VM 보기' })).toHaveAttribute(
      'href',
      `/admin/vms?workspaceId=${uuid(15)}&org=${uuid(1)}`,
    )
  })

  test('SYS_MANAGER는 전원 제어만 보고 삭제 작업은 보지 않는다', async () => {
    server.use(refreshSuccessHandler('access-sys-manager', sysManagerUser))
    renderApp(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByRole('button', { name: '종료' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '삭제 예약' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제 취소' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강제 삭제' })).not.toBeInTheDocument()
  })

  test('과거 날짜는 필드 오류, 7일 미만은 경고와 함께 상세 페이지에서 예약한다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    const dateInput = screen.getByLabelText(/파기 예정일/)
    const reasonInput = screen.getByLabelText(/삭제 사유/)
    fireEvent.change(dateInput, { target: { value: '2020-01-01' } })
    await user.type(reasonInput, '사용 종료일이 지난 VM 정리')
    expect(screen.getByText(/권장 통보 기간\(7일\)보다 이른/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '삭제 예약' }))
    expect(await screen.findByText('삭제 예정일은 미래 시각이어야 합니다.')).toBeInTheDocument()

    const nearDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
    fireEvent.change(dateInput, { target: { value: nearDate } })
    await user.click(screen.getByRole('button', { name: '삭제 예약' }))

    expect(
      await screen.findByText(
        '삭제 예약을 접수했습니다. 사용자에게 사유가 포함된 통보 메일이 발송됩니다.',
      ),
    ).toBeInTheDocument()
    expect(await screen.findByText('삭제 예약됨')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '삭제 취소' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제 예약' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '기간 연장' })).not.toBeInTheDocument()
  })

  test('삭제 사유 없이 제출하면 상세 페이지의 필드 오류를 보여준다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    fireEvent.change(screen.getByLabelText(/파기 예정일/), {
      target: { value: '2099-01-01' },
    })
    await user.click(screen.getByRole('button', { name: '삭제 예약' }))
    expect(await screen.findByText('삭제 사유를 입력해 주세요.')).toBeInTheDocument()
  })

  test('SYS_ADMIN이 상세 페이지에서 SSH와 웹 터미널을 차단한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: '접속 차단' }))
    const dialog = await screen.findByRole('dialog', { name: 'SSH·웹 터미널 차단' })
    await user.type(within(dialog).getByPlaceholderText(/감사 기록/), '남용 신고 확인')
    await user.click(within(dialog).getByRole('button', { name: '차단' }))

    expect(await screen.findByText('SSH·웹 터미널 접속을 차단했습니다.')).toBeInTheDocument()
    expect(await screen.findByText('SSH·터미널 차단됨')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '차단 해제' })).toBeEnabled()
  })

  test('기간 연장은 상세 페이지에 결과를 남긴다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: '기간 연장' }))
    const dialog = await screen.findByRole('dialog', { name: '기간 연장 — algo-judge' })
    fireEvent.change(within(dialog).getByLabelText(/새 종료일/), {
      target: { value: '2099-01-01' },
    })
    await user.click(within(dialog).getByRole('button', { name: '연장' }))

    expect(await screen.findByText(/연장되었습니다/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'algo-judge' })).toBeInTheDocument()
  })

  test('취소 불가 deletion은 상태만 보이고 삭제 action이 없다', async () => {
    const vm = vmStore.find((item) => item.id === uuid(56))!
    server.use(
      http.get('*/api/v1/admin/vms/:vmId', () =>
        HttpResponse.json({
          ...vm,
          deletion: {
            kind: 'FORCE',
            scheduledFor: '2026-08-30T14:00:00+09:00',
            requestedAt: '2026-08-30T14:00:00+09:00',
            requestedById: sysAdminUser.id,
            reason: '보안 사고 대응',
            cancelable: false,
          },
        }),
      ),
    )
    renderAsOrgAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByText('삭제가 진행 중입니다')).toBeInTheDocument()
    expect(screen.getByText(/취소할 수 없습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제 취소' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제 예약' })).not.toBeInTheDocument()
  })

  test('본인 삭제 유예 중 VM을 취소하면 상세 페이지에서 중지됨으로 갱신한다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin(`/admin/vms/${uuid(60)}`)

    await screen.findByRole('heading', { name: 'retiring-vm' })
    await user.click(screen.getByRole('button', { name: '삭제 취소' }))

    expect(
      await screen.findByText(
        '삭제가 취소되었습니다. VM은 중지됨 상태로 남으며, 시작은 사용자가 직접 수행합니다.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('중지됨')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '삭제 취소' })).not.toBeInTheDocument()
  })

  test('이름 확인 모달을 거쳐 상세 페이지에서 즉시 파기를 접수한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: '강제 삭제' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 강제 삭제' })
    const confirm = within(dialog).getByRole('button', { name: '즉시 파기' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'algo-judge')
    await user.click(confirm)

    expect(
      await screen.findByText('강제 삭제를 접수했습니다. VM이 즉시 강제 종료되고 파기됩니다.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('삭제됨')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '강제 삭제' })).not.toBeInTheDocument()
  })

  test('강제 삭제 409는 모달과 입력을 유지해 그대로 재시도한다', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(
        '*/api/v1/admin/vms/:vmId/force-delete',
        () =>
          problemResponse({
            type: 'about:blank',
            title: '확인용 이름이 일치하지 않습니다',
            status: 409,
            detail: '입력한 이름이 VM 이름과 일치하지 않습니다. VM 이름을 정확히 입력해 주세요.',
            code: 'VM_CONFIRM_NAME_MISMATCH',
          }),
        { once: true },
      ),
    )
    renderAsSysAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: '강제 삭제' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 강제 삭제' })
    await user.type(within(dialog).getByRole('textbox'), 'algo-judge')
    await user.click(within(dialog).getByRole('button', { name: '즉시 파기' }))

    expect(
      await within(dialog).findByText(/입력한 이름이 VM 이름과 일치하지 않습니다/),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox')).toHaveValue('algo-judge')

    await user.click(within(dialog).getByRole('button', { name: '즉시 파기' }))
    expect(
      await screen.findByText('강제 삭제를 접수했습니다. VM이 즉시 강제 종료되고 파기됩니다.'),
    ).toBeInTheDocument()
  })
})
