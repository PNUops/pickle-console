import { describe, expect, test } from 'vitest'
import type { CapacityTrendPoint } from '../../api/queries'
import {
  allocationSummary,
  constantSeries,
  hasAllocation,
  formatVcpu,
  formatVmCount,
  trendTimes,
} from './capacity-series'

function point(day: string, vcpu: number, memoryMb: number): CapacityTrendPoint {
  return { day, vcpu, memoryMb, diskGb: 100, vmCount: 3 }
}

describe('allocationSummary', () => {
  test('내내 아무것도 할당돼 있지 않으면 그렇게 말한다', () => {
    // 자원을 아직 받지 않은 기관(신설 기관이 그렇다)에서는 '변화가 없습니다'가
    // 사실을 절반만 말한다 — 변화가 없는 것이 아니라 할당 자체가 없다.
    const empty = [
      { day: '2026-05-12', vcpu: 0, memoryMb: 0, diskGb: 0, vmCount: 0 },
      { day: '2026-08-10', vcpu: 0, memoryMb: 0, diskGb: 0, vmCount: 0 },
    ]
    expect(hasAllocation(empty)).toBe(false)
    expect(allocationSummary(empty)).toBe('최근 90일 동안 할당된 자원이 없습니다.')
  })

  test('한 지점에라도 할당이 있으면 비어 있다고 보지 않는다', () => {
    expect(
      hasAllocation([
        { day: '2026-05-12', vcpu: 0, memoryMb: 0, diskGb: 0, vmCount: 0 },
        { day: '2026-08-10', vcpu: 2, memoryMb: 0, diskGb: 0, vmCount: 1 },
      ]),
    ).toBe(true)
  })

  test('늘어난 자원을 평문 문장으로 알린다', () => {
    expect(
      allocationSummary([point('2026-05-12', 12, 32_768), point('2026-08-10', 20, 49_152)]),
    ).toBe(
      '최근 90일 동안 할당 vCPU가 12개에서 20개로 늘었습니다. 메모리는 32 GiB에서 48 GiB로 늘었습니다.',
    )
  })

  test('줄어든 vCPU만 바뀌었으면 그 문장만 만든다', () => {
    expect(
      allocationSummary([point('2026-05-12', 20, 32_768), point('2026-08-10', 12, 32_768)]),
    ).toBe('최근 90일 동안 할당 vCPU가 20개에서 12개로 줄었습니다.')
  })

  test('올랐다 되돌아온 구간을 변화 없음으로 말하지 않는다', () => {
    // 양 끝만 견주면 "변화가 없습니다"가 되지만, 실제로는 24개까지 올랐다 왔다.
    expect(
      allocationSummary([
        point('2026-05-12', 12, 32_768),
        point('2026-06-20', 24, 65_536),
        point('2026-08-10', 12, 32_768),
      ]),
    ).toBe(
      '최근 90일 동안 할당 vCPU가 12개에서 24개 사이를 오간 뒤 12개로 돌아왔습니다. 메모리는 32 GiB에서 64 GiB 사이를 오간 뒤 32 GiB로 돌아왔습니다.',
    )
  })

  test('양 끝이 달라도 구간 중 고점·저점을 함께 밝힌다', () => {
    expect(
      allocationSummary([
        point('2026-05-12', 12, 32_768),
        point('2026-06-20', 28, 32_768),
        point('2026-08-10', 20, 32_768),
      ]),
    ).toBe('최근 90일 동안 할당 vCPU가 12개에서 20개로 늘었습니다(기간 중 최대 28개).')

    expect(
      allocationSummary([
        point('2026-05-12', 20, 32_768),
        point('2026-06-20', 4, 32_768),
        point('2026-08-10', 12, 32_768),
      ]),
    ).toBe('최근 90일 동안 할당 vCPU가 20개에서 12개로 줄었습니다(기간 중 최소 4개).')
  })

  test('변화가 없으면 변화 없음을 알린다', () => {
    expect(
      allocationSummary([point('2026-05-12', 12, 32_768), point('2026-08-10', 12, 32_768)]),
    ).toBe('최근 90일 동안 할당량 변화가 없습니다.')
    expect(allocationSummary([])).toBe('최근 90일 동안 기록된 할당 변화가 없습니다.')
  })
})

describe('trendTimes', () => {
  test('KST 달력일을 그날 00시(KST)의 epoch 초로 옮긴다', () => {
    expect(trendTimes([point('2026-08-10', 1, 1024)])).toEqual([
      Date.parse('2026-08-10T00:00:00+09:00') / 1000,
    ])
  })

  test('점 수만큼 길이가 맞아야 축과 어긋나지 않는다', () => {
    expect(trendTimes([])).toEqual([])
    expect(
      trendTimes([point('2026-08-09', 1, 1024), point('2026-08-10', 1, 1024)]),
    ).toHaveLength(2)
  })
})

describe('기준선·값 표기', () => {
  test('현재 용량 기준선은 구간 내내 같은 값을 점 수만큼 채운다', () => {
    expect(constantSeries(3, 40)).toEqual([40, 40, 40])
    expect(constantSeries(0, 40)).toEqual([])
  })

  test('눈금이 정수가 아닐 수 있어 소수 한 자리까지 허용한다', () => {
    expect(formatVcpu(12)).toBe('12 vCPU')
    expect(formatVcpu(12.5)).toBe('12.5 vCPU')
    expect(formatVmCount(8)).toBe('8대')
    expect(formatVmCount(8.25)).toBe('8.3대')
  })
})
