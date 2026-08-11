import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { ResourceSummary } from '../../api/queries'
import { resourceTypeEntry } from './registry'
import { uuid } from '../../test/msw/ids'

function resource(overrides: Partial<ResourceSummary> = {}): ResourceSummary {
  return {
    id: uuid(55),
    type: 'VM',
    name: 'capstone-team3-api',
    displayName: null,
    status: 'RUNNING',
    workspaceId: uuid(12),
    workspaceName: '캡스톤 3조',
    accessLimited: false,
    ownerNames: [],
    accessManageAllowed: false,
    createdAt: '2026-07-08T14:03:05+09:00',
    ...overrides,
  }
}

/** 서버가 먼저 내보낸, 이 빌드가 아직 모르는 종류. */
// A type the server might add next. It must not be a value this build knows:
// the point of the case is the row that arrives before the bundle does, and a
// registered type would test the opposite branch while still passing.
const UNKNOWN_TYPE = 'GPU_ALLOCATION' as ResourceSummary['type']

describe('리소스 종류 레지스트리', () => {
  test('아는 종류는 라벨·상세 경로·상태 배지를 준다', () => {
    const entry = resourceTypeEntry('VM')

    expect(entry.label).toBe('VM')
    expect(entry.detailPath?.(uuid(55))).toBe(`/console/vms/${uuid(55)}`)
    expect(entry.isActive(resource())).toBe(true)
    expect(entry.isActive(resource({ status: 'DELETED' }))).toBe(false)
  })

  test('모르는 종류는 화면을 비우지 않고 행 하나로 물러난다', () => {
    // api와 콘솔은 따로 배포된다 — 서버가 먼저 내보낸 종류가 옛 번들에 닿는다.
    const entry = resourceTypeEntry(UNKNOWN_TYPE)

    expect(entry.label).toBe('GPU_ALLOCATION')
    // 갈 수 있는 상세 화면이 없으므로 링크를 만들지 않는다.
    expect(entry.detailPath).toBeUndefined()
    expect(entry.rowAction).toBeUndefined()
    // 인벤토리가 준 행이니 가진 것으로 센다 — 어떤 상태가 "없어짐"인지는 그 종류만 안다.
    expect(entry.isActive(resource({ type: UNKNOWN_TYPE, status: 'ACTIVE' }))).toBe(true)

    render(<>{entry.statusBadge(resource({ type: UNKNOWN_TYPE, status: 'ACTIVE' }))}</>)
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
  })
})
