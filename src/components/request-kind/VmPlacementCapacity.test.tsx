import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { VmPlacementCapacity } from './VmPlacementCapacity'
import { vmPlacementFixture } from '../../test/msw/handlers/vm-placement'
import { uuid } from '../../test/msw/ids'

test('shows partial placement and only the resource impact of the VMs that fit', () => {
  const preview = vmPlacementFixture({ count: 30, vcpu: 1 })
  preview.placeableCount = 24
  preview.shortfallCount = 6
  preview.fitsAllNow = false
  preview.totals.remaining.vcpu = 24
  preview.totals.after.vcpu = 0
  render(<VmPlacementCapacity preview={preview} />)
  const panel = screen.getByRole('region', { name: 'VM 배치 가능 자원' })
  expect(within(panel).getByText('30대 중 24대 배치 가능 · 6대 부족해요.')).toBeInTheDocument()
  expect(within(panel).getByText(/현재 잔여 → 24대 반영 후 예상/)).toBeInTheDocument()
  expect(within(panel).getAllByText(/24 vCPU/).length).toBeGreaterThan(0)
  expect(within(panel).getByText(/용량을 예약하지 않으며/)).toBeInTheDocument()
})

test('keeps management state distinct from failed live observation and excludes both nodes', () => {
  const preview = vmPlacementFixture()
  const sample = preview.candidates[0]
  preview.candidates.push(
    { ...sample, nodeId: uuid(3), nodeName: 'pve3', eligible: false, status: 'OFFLINE', exclusionReasons: ['INACTIVE_NODE'], remaining: { vcpu: 999, memoryMb: 999, diskGb: 999 } },
    { ...sample, nodeId: uuid(4), nodeName: 'pve4', eligible: false, liveStatus: 'UNKNOWN', exclusionReasons: ['LIVE_STATUS_UNKNOWN'] },
  )
  render(<VmPlacementCapacity preview={preview} />)
  expect(screen.getByText(/확인된 서버 1대 합계/)).toBeInTheDocument()
  const nodes = within(screen.getByRole('list', { name: '서버별 배치 자원' })).getAllByRole('listitem')
  expect(within(nodes[1]).getByText('관리 상태: 오프라인')).toBeInTheDocument()
  expect(within(nodes[1]).getByText('서버 응답 확인')).toBeInTheDocument()
  expect(within(nodes[1]).getByText('가용 합계에서 제외')).toBeInTheDocument()
  expect(within(nodes[1]).queryByText('999 vCPU')).not.toBeInTheDocument()
  expect(within(nodes[2]).getByText('관리 상태: 활성')).toBeInTheDocument()
  expect(within(nodes[2]).getByText('응답 미확인')).toBeInTheDocument()
  expect(within(nodes[2]).queryByText('오프라인')).not.toBeInTheDocument()
})

test('does not turn an unconfigured legacy CPU or disk limit into remaining zero', () => {
  const preview = vmPlacementFixture()
  preview.totals.remaining = { vcpu: null, memoryMb: 2048, diskGb: null }
  preview.totals.after = { vcpu: null, memoryMb: 1024, diskGb: null }
  preview.candidates[0].capacityMode = 'LEGACY'
  preview.candidates[0].budget = { vcpu: null, memoryMb: 4096, diskGb: null }
  preview.candidates[0].remaining = preview.totals.remaining
  preview.candidates[0].after = preview.totals.after
  render(<VmPlacementCapacity preview={preview} />)
  expect(screen.getAllByText('남은 CPU')[0].parentElement).toHaveTextContent('한도 미설정')
  expect(screen.queryByText('0 vCPU')).not.toBeInTheDocument()
})

test('unconfirmed nodes have no displayed aggregate resource totals', () => {
  const preview = vmPlacementFixture()
  preview.placeableCount = 0
  preview.shortfallCount = 1
  preview.fitsAllNow = false
  preview.candidates[0].eligible = false
  preview.candidates[0].liveStatus = 'UNKNOWN'
  preview.candidates[0].exclusionReasons = ['LIVE_STATUS_UNKNOWN']
  render(<VmPlacementCapacity preview={preview} />)
  expect(screen.getByText('응답과 배치 조건이 확인된 서버가 없어요.')).toBeInTheDocument()
  expect(screen.queryByText('남은 CPU')).not.toBeInTheDocument()
  expect(screen.getByText('서버 응답 확인 실패')).toBeInTheDocument()
})

test('a node-specific limiting resource does not report a shortage when the entire request fits', () => {
  const preview = vmPlacementFixture()
  preview.candidates[0].limitingResources = ['CPU']
  render(<VmPlacementCapacity preview={preview} />)
  expect(screen.getByText('1대 모두 배치 가능해요.')).toBeInTheDocument()
  expect(screen.getByText(/대수 제한: CPU/)).toBeInTheDocument()
  expect(screen.queryByText(/CPU 부족/)).not.toBeInTheDocument()
})

test('large memory numbers use readable GiB and keep exact MiB on the displayed values', () => {
  const preview = vmPlacementFixture()
  preview.totals.remaining.memoryMb = 183219
  preview.totals.after.memoryMb = 152499
  preview.candidates[0].remaining = { ...preview.candidates[0].remaining!, memoryMb: 512 }
  render(<VmPlacementCapacity preview={preview} />)
  expect(screen.getByTitle('183,219 MiB')).toHaveTextContent('178.92 GiB')
  expect(screen.getAllByTitle('152,499 MiB')[0]).toHaveTextContent('148.92 GiB')
  expect(screen.getByTitle('512 MiB')).toHaveTextContent('512 MiB')
})
