import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import type { components } from '../api/schema'
import {
  refreshSuccessHandler,
  sysAdminUser,
  sysManagerUser,
} from '../test/msw/handlers/auth'
import {
  metricsUnavailableProblem,
  nodeMetricsFixture,
} from '../test/msw/handlers/metrics'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderNodes() {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp('/admin/nodes')
}

/** 노드 한 대만 있는 목록으로 바꿔 끼운다 — 상태별 화면을 좁혀 보기 위해. */
function onlyNode(status: components['schemas']['NodeStatus']) {
  const node: components['schemas']['NodeSummaryResponse'] = {
    id: 1,
    name: 'pve1',
    status,
    cpuThreads: 40,
    memoryMb: 79872,
    vmBridge: 'vmbr2',
    storage: 'local-lvm',
    diskCapacityGb: 900,
    runningVms: 6,
    allocatedVcpu: 14,
    allocatedMemoryMb: 20480,
    cpuOvercommitRatio: 0.35,
    memoryAllocRatio: 0.26,
    cpuWarnThreshold: 3.0,
    memoryWarnThreshold: 0.8,
    ipPool: {
      id: 1,
      name: 'guest-pool',
      cidr: '172.29.0.0/16',
      allocatedCount: 6,
      freeCount: 65200,
    },
  }
  return http.get('*/api/v1/admin/nodes', () => HttpResponse.json([node], { status: 200 }))
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

describe('노드/용량 — 사용량·할당 추이', () => {
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

  test('할당 추이 탭은 자원별 차트를 보여주고 기간을 바꿀 수 있다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    // 라벨은 '할당 추이'로 통일하되, 기존 링크가 계속 열리도록 tab id는 그대로다.
    renderApp('/admin/nodes?tab=trend')

    expect(await screen.findByRole('tab', { name: '할당 추이' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(await screen.findByRole('heading', { name: 'vCPU 할당' })).toBeInTheDocument()
    // 섹션 제목도 같은 용어를 쓴다.
    expect(screen.getByRole('heading', { name: '할당 추이', level: 2 })).toBeInTheDocument()
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

  test('SYS_MANAGER도 할당 추이에서 기관을 좁혀 볼 수 있다', async () => {
    // 기관 필터는 SYS 티어 전체가 가진 읽기 권한이다 — 상태 전환(SYS_ADMIN 전용)
    // 게이트를 그대로 돌려쓰면 SYS_MANAGER가 필터를 잃는다.
    server.use(refreshSuccessHandler('access-sys-manager', sysManagerUser))
    renderApp('/admin/nodes?tab=trend')

    expect(await screen.findByRole('heading', { name: 'vCPU 할당' })).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})

describe('노드/용량 — 잴 수 없는 상태', () => {
  test('오프라인 노드는 사용량을 조회하지 않고 사실만 알린다', async () => {
    let metricsCalls = 0
    server.use(
      onlyNode('OFFLINE'),
      http.get('*/api/v1/admin/nodes/:nodeId/metrics', () => {
        metricsCalls += 1
        return metricsUnavailableProblem('/api/v1/admin/nodes/1/metrics')
      }),
    )
    renderNodes()

    expect(
      await screen.findByText('오프라인으로 지정된 노드여서 사용량을 수집하지 않습니다.'),
    ).toBeInTheDocument()
    // 사용량 영역 자체를 띄우지 않으므로 조회 구간 스위처도, 조회도 없다.
    expect(
      screen.queryByRole('group', { name: 'pve1 조회 구간' }),
    ).not.toBeInTheDocument()
    expect(metricsCalls).toBe(0)
  })

  test('하이퍼바이저가 응답하지 않으면 경보 대신 차분한 안내로 멈춘다', async () => {
    let metricsCalls = 0
    server.use(
      onlyNode('ACTIVE'),
      http.get('*/api/v1/admin/nodes/:nodeId/metrics', () => {
        metricsCalls += 1
        return metricsUnavailableProblem('/api/v1/admin/nodes/1/metrics')
      }),
    )
    renderNodes()

    const notice = await screen.findByText(
      /하이퍼바이저가 응답하지 않아 사용량을 표시할 수 없습니다/,
    )
    expect(notice.closest('[role="alert"]')).toBeNull()
    // 안내는 차분하되 조회는 이어 간다 — 문구도 그렇게 말한다.
    expect(notice).toHaveTextContent('다시 시도하는 중입니다')
    // 다만 정상 주기(테스트 모드 250ms)보다 촘촘해지지는 않는다: 물러선 주기는
    // 500ms라 900ms 동안 서너 번을 넘지 않는다.
    await waitFor(() => expect(metricsCalls).toBeGreaterThan(1))
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(metricsCalls).toBeLessThan(5)
  })

  test('하이퍼바이저가 돌아오면 새로고침 없이 차트가 되살아난다', async () => {
    let failed = false
    server.use(
      onlyNode('ACTIVE'),
      http.get('*/api/v1/admin/nodes/:nodeId/metrics', ({ request }) => {
        // 첫 조회만 실패하고(pveproxy 재시작 같은 순간 장애) 이후에는 답한다.
        if (!failed) {
          failed = true
          return metricsUnavailableProblem('/api/v1/admin/nodes/1/metrics')
        }
        const timeframe = new URL(request.url).searchParams.get('timeframe') ?? 'HOUR'
        return HttpResponse.json(nodeMetricsFixture(timeframe), { status: 200 })
      }),
    )
    renderNodes()

    await screen.findByText(/하이퍼바이저가 응답하지 않아 사용량을 표시할 수 없습니다/)
    // 아무 조작 없이 다음 조회 주기에 스스로 되돌아온다.
    expect(await screen.findByRole('heading', { name: 'CPU' })).toBeInTheDocument()
    expect(screen.queryByText(/하이퍼바이저가 응답하지 않아/)).not.toBeInTheDocument()
  })
})
