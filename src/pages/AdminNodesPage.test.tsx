import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderNodes() {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp('/admin/nodes')
}

describe('노드/용량', () => {
  test('노드별 상태·할당/용량·IP 풀 여유를 나열한다', async () => {
    renderNodes()

    await screen.findByRole('heading', { name: '노드/IP', level: 1 })
    const row = (await screen.findByText('pve1')).closest('tr')!
    expect(within(row).getByText('활성')).toBeInTheDocument()
    expect(within(row).getByText('14 vCPU / 40 스레드')).toBeInTheDocument()
    expect(within(row).getByText('20 GiB / 78 GiB')).toBeInTheDocument()
    expect(within(row).getByText('65,200개')).toBeInTheDocument()
    expect(within(row).getByText(/172\.29\.0\.0\/16/)).toBeInTheDocument()
    // 임계값 이내면 경고 배지가 없다.
    expect(within(row).queryByText('임계 초과')).not.toBeInTheDocument()
  })

  test('오버커밋 비율이 경고 임계값을 넘으면 경고 배지를 붙인다', async () => {
    renderNodes()

    const row = (await screen.findByText('pve2')).closest('tr')!
    expect(within(row).getByText('점검 중')).toBeInTheDocument()
    // CPU 3.25 > 3.0, 메모리 0.88 > 0.8 — 두 칸 모두 경고
    expect(within(row).getAllByText('임계 초과')).toHaveLength(2)
  })

  test('SYS_ADMIN은 상태 전환 모달로 노드를 점검 중으로 전환한다', async () => {
    const user = userEvent.setup()
    renderNodes()

    const row = (await screen.findByText('pve1')).closest('tr')!
    await user.click(within(row).getByRole('button', { name: '상태 전환' }))

    const dialog = await screen.findByRole('dialog', { name: '노드 상태 전환 — pve1' })
    await user.selectOptions(within(dialog).getByLabelText('노드 상태'), 'MAINTENANCE')
    expect(within(dialog).getByText(/신규 VM 배치가 불가능해집니다/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '전환' }))

    expect(
      await screen.findByText('노드 pve1의 상태를 점검 중(으)로 전환했습니다.'),
    ).toBeInTheDocument()
  })
})
