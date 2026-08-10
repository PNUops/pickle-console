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

describe('노드/용량 — 사용량·용량 추이', () => {
  test('노드 탭 아래에 노드별 실측 사용량 차트를 펼쳐 둔다', async () => {
    renderNodes()

    const usage = await screen.findByRole('heading', { name: 'pve1 사용량' })
    const section = usage.closest('div')!.parentElement as HTMLElement
    expect(
      await within(section).findByRole('heading', { name: 'CPU' }),
    ).toBeInTheDocument()
    expect(within(section).getByRole('heading', { name: '메모리' })).toBeInTheDocument()
    expect(within(section).getByRole('heading', { name: '네트워크' })).toBeInTheDocument()
    expect(
      within(section).getByRole('group', { name: 'pve1 조회 구간' }),
    ).toBeInTheDocument()
  })

  test('노드 표는 게스트 디스크 풀 용량을 함께 보여준다', async () => {
    renderNodes()

    const row = (await screen.findByText('pve1')).closest('tr')!
    expect(within(row).getByText('풀 용량 900 GiB')).toBeInTheDocument()
    // 아직 측정되지 않은 노드는 수치 대신 미측정으로 남는다.
    const other = (await screen.findByText('pve2')).closest('tr')!
    expect(within(other).getByText('풀 용량 미측정')).toBeInTheDocument()
  })

  test('용량 추이 탭은 자원별 차트를 보여주고 기간을 바꿀 수 있다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/nodes?tab=trend')

    expect(await screen.findByRole('heading', { name: 'vCPU 할당' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '메모리 할당' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '디스크 할당' })).toBeInTheDocument()
    // VM 대수는 단위가 달라 같은 축에 얹지 않고 별도 차트로 둔다.
    expect(screen.getByRole('heading', { name: 'VM 수' })).toBeInTheDocument()

    const period = screen.getByRole('group', { name: '조회 기간' })
    expect(within(period).getByRole('button', { name: '90일' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(within(period).getByRole('button', { name: '30일' }))
    expect(within(period).getByRole('button', { name: '30일' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // 시스템 관리자는 기관을 좁혀 볼 수 있다.
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
