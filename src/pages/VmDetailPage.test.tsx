import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderVm(vmId: number) {
  server.use(refreshSuccessHandler('access-student'))
  renderApp(`/console/vms/${vmId}`)
}

describe('VM 상세 — 전원 제어', () => {
  test('중지된 VM은 시작 버튼만 보이고, 확인 후 실행 중으로 갱신된다', async () => {
    const user = userEvent.setup()
    renderVm(57)

    await screen.findByRole('heading', { name: 'web-lab' })
    expect(screen.getByRole('button', { name: '시작' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '종료' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '재부팅' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강제 종료' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '시작' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 시작' })
    await user.click(within(dialog).getByRole('button', { name: '시작' }))

    expect(
      await screen.findByText('VM 시작 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.'),
    ).toBeInTheDocument()
    expect(await screen.findByText('실행 중')).toBeInTheDocument()
  })

  test('실행 중 VM은 종료·재부팅·강제 종료가 보이고 시작은 없다', async () => {
    renderVm(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByRole('button', { name: '종료' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '재부팅' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '강제 종료' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '시작' })).not.toBeInTheDocument()
  })

  test('강제 종료 확인 모달은 데이터 손상 경고를 보여준다', async () => {
    const user = userEvent.setup()
    renderVm(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: '강제 종료' }))

    const dialog = await screen.findByRole('dialog', { name: 'VM 강제 종료' })
    expect(
      within(dialog).getByText(/파일 시스템과 데이터가 손상될 수 있습니다/),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '강제 종료' }))
    expect(await screen.findByText('중지됨')).toBeInTheDocument()
    // 종료된 뒤에는 시작 버튼으로 바뀐다.
    expect(await screen.findByRole('button', { name: '시작' })).toBeInTheDocument()
  })

  test('NEEDS_ADMIN VM은 조작 버튼 없이 관리자 확인 안내만 보여준다', async () => {
    renderVm(58)

    await screen.findByRole('heading', { name: 'stuck-vm' })
    expect(screen.getByText('관리자 확인 중입니다')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '시작' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '종료' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '재부팅' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강제 종료' })).not.toBeInTheDocument()
  })
})

describe('VM 상세 — 진행 패널', () => {
  test('NEEDS_ADMIN 태스크는 단계·시도·마지막 오류를 보여준다', async () => {
    renderVm(58)

    await screen.findByRole('heading', { name: 'stuck-vm' })
    expect(screen.getByText('VM 생성 진행 상황')).toBeInTheDocument()
    expect(screen.getByText(/단계 6\/10 · cloud-init 설정 중 \(시도 3회\)/)).toBeInTheDocument()
    expect(screen.getByText('관리자 개입이 필요합니다')).toBeInTheDocument()
    expect(
      screen.getByText(/Proxmox API 응답 시간 초과 \(qm set 5058\)/),
    ).toBeInTheDocument()
  })

  test('생성 중에는 진행 패널이 보이고, 완료되면 폴링으로 사라진다', async () => {
    renderVm(55)

    await screen.findByRole('heading', { name: 'capstone-team3-api' })
    expect(screen.getByText(/템플릿 복제 중/)).toBeInTheDocument()

    // mock 프로비저닝 완료 → 실행 중으로 갱신되고 패널이 사라진다.
    expect(await screen.findByText('실행 중')).toBeInTheDocument()
    expect(screen.queryByText('VM 생성 진행 상황')).not.toBeInTheDocument()
  })
})

describe('VM 상세 — 이벤트 이력', () => {
  test('이벤트를 한국어 라벨·수행자와 함께 나열하고, 전원 조작 후 갱신된다', async () => {
    const user = userEvent.setup()
    renderVm(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    const history = (await screen.findByText('이벤트 이력')).closest('div')!
      .parentElement as HTMLElement
    expect(await within(history).findByText('생성')).toBeInTheDocument()
    expect(within(history).getByText('승인 신청 90에 따라 자동 생성')).toBeInTheDocument()
    expect(within(history).getByText('시스템')).toBeInTheDocument()
    expect(within(history).getByText('사용자 #42')).toBeInTheDocument()

    // 재부팅을 접수하면 무효화로 이벤트 이력에 REBOOT가 추가된다.
    await user.click(screen.getByRole('button', { name: '재부팅' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 재부팅' })
    await user.click(within(dialog).getByRole('button', { name: '재부팅' }))
    expect(await within(history).findByText('재부팅')).toBeInTheDocument()
  })
})
