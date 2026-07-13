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

function renderTasks() {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp('/admin/tasks')
}

describe('작업 큐 — 접근 제어', () => {
  test('ORG_ADMIN이 /admin/tasks에 접근하면 관리자 홈으로 돌려보내고 메뉴도 숨긴다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/tasks')

    expect(
      await screen.findByRole('heading', { name: '관리자 대시보드' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '작업' })).not.toBeInTheDocument()
  })
})

describe('작업 큐', () => {
  test('SYS_ADMIN은 작업 목록과 마지막 오류·시도 횟수를 본다', async () => {
    renderTasks()

    await screen.findByRole('heading', { name: '작업 큐' })
    const row = (await screen.findByText('stuck-vm')).closest('tr')!
    expect(within(row).getByText('관리자 확인 필요')).toBeInTheDocument()
    expect(within(row).getByText(/Proxmox API 응답 시간 초과/)).toBeInTheDocument()
    expect(within(row).getByText('4')).toBeInTheDocument()
    // NEEDS_ADMIN 행에만 재시도 버튼이 있다.
    expect(within(row).getByRole('button', { name: '재시도' })).toBeInTheDocument()
    const doneRow = screen.getByText('ai-train').closest('tr')!
    expect(within(doneRow).queryByRole('button', { name: '재시도' })).not.toBeInTheDocument()
  })

  test('실패 탭은 FAILED 작업만 보여준다', async () => {
    const user = userEvent.setup()
    renderTasks()

    await screen.findByRole('heading', { name: '작업 큐' })
    await screen.findByText('stuck-vm')
    await user.click(screen.getByRole('tab', { name: '실패' }))

    await screen.findByText('broken-vm')
    await waitFor(() => expect(screen.queryByText('stuck-vm')).not.toBeInTheDocument())
  })

  test('재시도는 확인 모달을 거쳐 접수되고 상태가 갱신된다', async () => {
    const user = userEvent.setup()
    renderTasks()

    await screen.findByRole('heading', { name: '작업 큐' })
    const row = (await screen.findByText('stuck-vm')).closest('tr')!
    await user.click(within(row).getByRole('button', { name: '재시도' }))

    const dialog = await screen.findByRole('dialog', { name: '작업 재시도' })
    expect(within(dialog).getByText(/실패한 단계/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '재시도' }))

    expect(
      await screen.findByText('작업 재시도를 접수했습니다. 잠시 후 작업 상태가 갱신됩니다.'),
    ).toBeInTheDocument()
    // mock은 접수와 함께 RETRYING으로 전이한다.
    const updated = screen.getByText('stuck-vm').closest('tr')!
    expect(within(updated).getByText('재시도 대기')).toBeInTheDocument()
  })
})
