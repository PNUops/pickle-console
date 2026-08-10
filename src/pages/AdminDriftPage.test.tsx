import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderAsSysAdmin(path: string) {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(path)
}

describe('드리프트', () => {
  test('미해결 탭이 기본이고 유형 배지·대상·요약을 보여준다', async () => {
    renderAsSysAdmin('/admin/drift')

    await screen.findByRole('heading', { name: '드리프트' })
    const row = (await screen.findByText('이름 미상 VM · vmid 100059 · pve1')).closest('tr')!
    expect(within(row).getByText('Proxmox에 없음')).toBeInTheDocument()
    expect(within(row).getByText(/broken-vm/)).toBeInTheDocument()
    // 해결된 발견은 미해결 탭에 없다.
    expect(screen.queryByText('vmid 100900 · pve1')).not.toBeInTheDocument()
  })

  test('해결 처리하면 미해결 목록에서 사라지고, 해결됨 탭은 해결자·자동 해소를 보여준다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin('/admin/drift')

    await screen.findByRole('heading', { name: '드리프트' })
    const row = (await screen.findByText('vmid 100901 · pve1')).closest('tr')!
    await user.click(within(row).getByRole('button', { name: '해결 처리' }))

    const dialog = await screen.findByRole('dialog', { name: '드리프트 해결 처리' })
    await user.type(
      within(dialog).getByLabelText(/해결 메모/),
      '잔여 게스트를 수동 정리했습니다.',
    )
    await user.click(within(dialog).getByRole('button', { name: '해결 처리' }))

    expect(await screen.findByText('드리프트를 해결 처리했습니다.')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByText('vmid 100901 · pve1')).not.toBeInTheDocument(),
    )

    // 해결됨 탭: 수동 해결자는 이메일, 자동 해소는 라벨.
    await user.click(screen.getByRole('button', { name: '해결됨' }))
    const manualRow = (await screen.findByText('vmid 100901 · pve1')).closest('tr')!
    expect(within(manualRow).getByText('sysadmin.lee@pusan.ac.kr')).toBeInTheDocument()
    const autoRow = screen.getByText('vmid 100900 · pve1').closest('tr')!
    expect(within(autoRow).getByText('자동 해소')).toBeInTheDocument()
  })
})

describe('IP 할당', () => {
  test('풀 요약 카드와 할당 이력 테이블을 보여준다', async () => {
    renderAsSysAdmin('/admin/nodes?tab=ips')

    await screen.findByRole('heading', { name: '노드/IP' })
    // 노드 ipPool 재사용 요약 카드
    await screen.findByText('pve1 · 172.29.0.0/16')
    const row = (await screen.findByText('172.29.0.10')).closest('tr')!
    expect(within(row).getByText('capstone-team3-api')).toBeInTheDocument()
    expect(within(row).getByText('할당됨')).toBeInTheDocument()
  })

  test('해제됨 탭은 해제 이력만 보여준다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin('/admin/nodes?tab=ips')

    await screen.findByRole('heading', { name: '노드/IP' })
    await screen.findByText('172.29.0.10')
    await user.click(screen.getByRole('button', { name: '해제됨' }))

    const row = (await screen.findByText('172.29.0.5')).closest('tr')!
    expect(within(row).getByText('해제됨')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('172.29.0.10')).not.toBeInTheDocument())
  })
})
