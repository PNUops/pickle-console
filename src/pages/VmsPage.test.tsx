import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderVms(path = '/console/vms') {
  server.use(refreshSuccessHandler('access-student'))
  renderApp(path)
}

describe('내 VM 목록', () => {
  test('VM을 상태·사양·그룹과 함께 나열한다', async () => {
    renderVms()

    const creatingRow = (
      await screen.findByRole('link', { name: 'capstone-team3-api' })
    ).closest('tr')!
    expect(within(creatingRow).getByText('생성 중')).toBeInTheDocument()
    expect(within(creatingRow).getByText('2 vCPU · 2 GiB · 20 GiB')).toBeInTheDocument()
    expect(within(creatingRow).getByText('캡스톤 3조')).toBeInTheDocument()

    const runningRow = screen.getByRole('link', { name: 'algo-judge' }).closest('tr')!
    expect(within(runningRow).getByText('실행 중')).toBeInTheDocument()
    expect(within(runningRow).getByText('알고리즘 스터디')).toBeInTheDocument()
  })
})

describe('VM 상세', () => {
  test('생성 중 VM은 폴링으로 실행 중 전이를 자동 반영한다', async () => {
    renderVms('/console/vms/55')

    // 첫 응답: 생성 중 + 안내 배너, IP는 아직 없음
    await screen.findByRole('heading', { name: 'capstone-team3-api' })
    expect(screen.getByText('생성 중')).toBeInTheDocument()
    expect(screen.getByText(/VM을 생성하고 있습니다/)).toBeInTheDocument()
    expect(screen.getByText('할당 전')).toBeInTheDocument()

    // 폴링이 돌면 mock 프로비저닝 완료 → 실행 중으로 갱신
    expect(await screen.findByText('실행 중')).toBeInTheDocument()
    expect(screen.queryByText(/VM을 생성하고 있습니다/)).not.toBeInTheDocument()
    expect(screen.getByText('10.10.0.55')).toBeInTheDocument()
  })

  test('실행 중 VM은 접속 정보와 생성 신청 링크를 보여준다', async () => {
    renderVms('/console/vms/56')

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByText('실행 중')).toBeInTheDocument()
    expect(screen.getByText('student')).toBeInTheDocument()
    expect(screen.getByText('10.10.0.56')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '신청 #90' })).toBeInTheDocument()
  })
})
