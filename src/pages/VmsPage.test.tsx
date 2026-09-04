import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { asGrantManager, vmSummaryAs } from '../test/msw/handlers/vms'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

function renderVms(path = '/console/vms') {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(path)
}

describe('내 가상머신 목록', () => {
  test('목록에서 바로 가상머신을 신청할 수 있다', async () => {
    renderVms()

    expect(await screen.findByRole('link', { name: '가상머신 신청' })).toHaveAttribute(
      'href',
      '/console/requests/new?kind=VM',
    )
  })

  test('VM을 상태·사양·워크스페이스와 함께 나열한다', async () => {
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

  test('접근 권한이 없는 VM은 이름·상태만 나오고 누구에게 요청할지 알려 준다', async () => {
    renderVms()

    // 같은 워크스페이스의 VM이지만 접근 목록에 없다 — 상세로 가는 링크도, 사양도 없다.
    const limitedRow = (await screen.findByText('ml-notebook')).closest('tr')!
    expect(screen.queryByRole('link', { name: 'ml-notebook' })).not.toBeInTheDocument()
    expect(within(limitedRow).getByText('실행 중')).toBeInTheDocument()
    expect(within(limitedRow).getByText('—')).toBeInTheDocument()
    expect(
      within(limitedRow).getByText(/접근 권한이 없습니다 — 김철수 님에게 요청하세요/),
    ).toBeInTheDocument()
    // 접근 권한이 없는 구성원에게는 관리 진입점도 없다.
    expect(
      within(limitedRow).queryByRole('link', { name: '접근 권한 관리' }),
    ).not.toBeInTheDocument()
  })

  test('워크스페이스 소유자는 안을 못 봐도 제한 행에서 접근 권한 관리로 갈 수 있다', async () => {
    // 상세는 막혀 있으므로 목록이 유일한 진입점이고, 소유자가 떠난 VM을
    // 되살리는 길이기도 하다.
    server.use(vmSummaryAs(uuid(44), { accessManageAllowed: true }))
    renderVms()

    const limitedRow = (await screen.findByText('ml-notebook')).closest('tr')!
    const manage = within(limitedRow).getByRole('link', { name: '접근 권한 관리' })
    expect(manage).toHaveAttribute('href', `/console/vms/${uuid(44)}/access`)
    // 그래도 안은 여전히 안 보인다.
    expect(screen.queryByRole('link', { name: 'ml-notebook' })).not.toBeInTheDocument()
  })

  test('접근 권한 화면은 VM 상세가 막혀 있어도 열린다', async () => {
    // 이 수정의 전부다 — 상세를 부르면 403이라, 화면이 상세에 기대면 관리
    // 경로가 통째로 닫힌다. 이름·상태는 접근 목록 응답이 준 것으로만 그린다.
    asGrantManager(uuid(44))
    renderVms(`/console/vms/${uuid(44)}/access`)

    expect(await screen.findByRole('heading', { name: 'ml-notebook' })).toBeInTheDocument()
    expect(screen.getByText(/알고리즘 스터디 소유/)).toBeInTheDocument()
    expect(await screen.findByText(/접근 권한 \(/)).toBeInTheDocument()
  })
})

describe('VM 상세', () => {
  test('생성 중 VM은 폴링으로 실행 중 전이를 자동 반영한다', async () => {
    renderVms(`/console/vms/${uuid(55)}`)

    // 첫 응답: 생성 중 + 안내 배너, IP는 아직 없음
    await screen.findByRole('heading', { name: 'capstone-team3-api' })
    expect(screen.getByText('생성 중')).toBeInTheDocument()
    expect(screen.getByText(/생성이 끝나면 상태가 자동으로 갱신됩니다/)).toBeInTheDocument()
    expect(screen.getByText('할당 전')).toBeInTheDocument()

    // 폴링이 돌면 mock 프로비저닝 완료 → 실행 중으로 갱신
    expect(await screen.findByText('실행 중')).toBeInTheDocument()
    expect(screen.queryByText(/생성이 끝나면 상태가 자동으로 갱신됩니다/)).not.toBeInTheDocument()
    expect(screen.getByText('10.10.0.55')).toBeInTheDocument()
  })

  test('실행 중 VM은 접속 정보와 생성 신청 링크를 보여준다', async () => {
    renderVms(`/console/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByText('실행 중')).toBeInTheDocument()
    expect(screen.getByText('ubuntu')).toBeInTheDocument()
    expect(screen.getByText('10.10.0.56')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '신청 상세' })).toBeInTheDocument()
  })
})
