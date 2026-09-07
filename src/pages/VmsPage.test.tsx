import { screen, within } from '@testing-library/react'
import { http, HttpResponse, passthrough } from 'msw'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { asGrantManager, vmStore, vmSummaryAs } from '../test/msw/handlers/vms'
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
  test('생성 중 VM은 생성 중이라고 말하고 IP 자리를 비워 둔다', async () => {
    // **중간 상태를 잡으려고 경주하지 않는다.** 기본 목이 두 번째 상세 조회에서
    // RUNNING 으로 넘기므로 「생성 중」 화면은 한 폴링 주기만 살고, 느린 기계에서는
    // 단언 전에 그 창이 닫힌다. 실제로 배포 호스트에서 이 시험이 그렇게 떨어졌다.
    //
    // 공용 픽스처에 전이하지 않는 VM 을 더하는 대신 이 시험 안에서만 응답을
    // 고정한다 — 픽스처를 늘리면 관리자 목록의 첫 페이지가 밀려 무관한 시험 넷이
    // 함께 깨진다(실제로 그렇게 됐다).
    const creating = { ...vmStore.find((vm) => vm.id === uuid(55))!, status: 'CREATING' }
    server.use(
      http.get('*/api/v1/vms/:vmId', ({ params }) =>
        String(params.vmId) === uuid(55)
          ? HttpResponse.json(creating, { status: 200 })
          : passthrough()),
    )
    renderVms(`/console/vms/${uuid(55)}`)

    await screen.findByRole('heading', { name: 'capstone-team3-api' })
    expect(screen.getByText('생성 중')).toBeInTheDocument()
    expect(screen.getByText(/생성이 끝나면 상태가 자동으로 갱신됩니다/)).toBeInTheDocument()
    expect(screen.getByText('할당 전')).toBeInTheDocument()
  })

  test('생성이 끝나면 폴링이 실행 중과 IP를 가져온다', async () => {
    // 이쪽은 도착 상태만 단언하므로 언제 전이하든 상관없다.
    renderVms(`/console/vms/${uuid(55)}`)

    await screen.findByRole('heading', { name: 'capstone-team3-api' })
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
