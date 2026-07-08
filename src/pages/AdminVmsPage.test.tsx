import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  refreshSuccessHandler,
  sysAdminUser,
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

/** 목록에서 VM 행을 클릭해 관리 작업 패널을 연다. */
async function selectVm(user: ReturnType<typeof userEvent.setup>, name: string) {
  const row = (await screen.findByText(name)).closest('tr')!
  await user.click(row)
  return screen.findByText(`관리 작업 — ${name}`)
}

describe('관리자 VM 목록', () => {
  test('VM을 그룹 이름과 함께 나열하고 상태 탭·기관 필터가 동작한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByRole('heading', { name: 'VM 관리' })
    const row = (await screen.findByText('capstone-team3-api')).closest('tr')!
    expect(within(row).getByText('캡스톤 3조')).toBeInTheDocument()

    // 상태 탭: 중지됨 → STOPPED VM만
    await user.click(screen.getByRole('tab', { name: '중지됨' }))
    expect(await screen.findByText('web-lab')).toBeInTheDocument()
    expect(screen.queryByText('capstone-team3-api')).not.toBeInTheDocument()

    // 기관 필터 (SYS_ADMIN 전용): org 2 → ai-train만
    await user.click(screen.getByRole('tab', { name: '전체' }))
    await user.selectOptions(screen.getByLabelText('기관 필터'), '2')
    expect(await screen.findByText('ai-train')).toBeInTheDocument()
    expect(screen.queryByText('capstone-team3-api')).not.toBeInTheDocument()
  })

  test('ORG_ADMIN에게는 기관 필터와 긴급 삭제가 노출되지 않는다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await screen.findByRole('heading', { name: 'VM 관리' })
    expect(screen.queryByLabelText('기관 필터')).not.toBeInTheDocument()

    await selectVm(user, 'algo-judge')
    expect(screen.getByRole('button', { name: '삭제 예약' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '삭제 취소' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '긴급 삭제' })).not.toBeInTheDocument()
  })
})

describe('관리자 VM 삭제 예약', () => {
  test('최소 통보 기간 미만 날짜는 422 필드 에러로 표시되고, 유효하면 접수된다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await selectVm(user, 'algo-judge')
    const dateInput = screen.getByLabelText(/파기 예정일/)
    const reasonInput = screen.getByLabelText(/삭제 사유/)

    // 통보 기간(7일) 미만의 날짜 → 서버 422 → scheduledFor 필드 에러
    fireEvent.change(dateInput, { target: { value: '2020-01-01' } })
    await user.type(reasonInput, '사용 종료일이 지난 VM 정리')
    await user.click(screen.getByRole('button', { name: '삭제 예약' }))
    expect(
      await screen.findByText('삭제 예정일은 최소 통보 기간(7일) 이후여야 합니다.'),
    ).toBeInTheDocument()

    // 유효한 날짜로 다시 제출 → 접수 안내
    fireEvent.change(dateInput, { target: { value: '2099-01-01' } })
    await user.click(screen.getByRole('button', { name: '삭제 예약' }))
    expect(
      await screen.findByText(
        '삭제 예약을 접수했습니다. 이용자에게 사유가 포함된 통보 메일이 발송됩니다.',
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
    await user.click(screen.getByRole('button', { name: '삭제 예약' }))
    expect(await screen.findByText('삭제 사유를 입력해 주세요.')).toBeInTheDocument()
  })
})

describe('관리자 삭제 취소', () => {
  test('셀프 삭제 유예 중 VM을 취소하면 중지됨으로 남는다는 안내를 보여준다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await selectVm(user, 'retiring-vm')
    await user.click(screen.getByRole('button', { name: '삭제 취소' }))

    expect(
      await screen.findByText(
        '삭제가 취소되었습니다. VM은 중지됨 상태로 남으며, 전원 켜기는 이용자가 직접 수행합니다.',
      ),
    ).toBeInTheDocument()
    // 목록 무효화로 상태 배지도 중지됨으로 갱신된다.
    await waitFor(() => {
      const row = screen.getByText('retiring-vm').closest('tr')!
      expect(within(row).getByText('중지됨')).toBeInTheDocument()
    })
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

describe('긴급 삭제 (SYS_ADMIN)', () => {
  test('이름 확인 모달을 거쳐 즉시 파기를 접수한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await selectVm(user, 'algo-judge')
    await user.click(screen.getByRole('button', { name: '긴급 삭제' }))

    const dialog = await screen.findByRole('dialog', { name: 'VM 긴급 삭제' })
    const confirm = within(dialog).getByRole('button', { name: '즉시 파기' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'algo-judge')
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    expect(
      await screen.findByText(
        '긴급 삭제를 접수했습니다. VM이 즉시 강제 종료되고 파기됩니다.',
      ),
    ).toBeInTheDocument()
    // 목록 무효화로 상태가 삭제됨으로 갱신된다.
    await waitFor(() => {
      const row = screen.getByText('algo-judge').closest('tr')!
      expect(within(row).getByText('삭제됨')).toBeInTheDocument()
    })
  })
})
