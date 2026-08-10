import uPlot from 'uplot'
import { describe, expect, test } from 'vitest'
import { formatByteRate, formatBytes, formatPercent } from '../../lib/format'
import { isolatedIndexes, splitsFor } from './chart-scales'

const MiB = 1024 * 1024
const GiB = 1024 * MiB

/** 차트가 y축 범위를 잡는 방식과 같게 — 자료 최대치에 여유를 둔 구간. */
function scaleRange(max: number): [number, number] {
  return uPlot.rangeNum(0, max, 0.1, true) as [number, number]
}

describe('splitsFor — 실제 화면에 뜨는 구간의 눈금', () => {
  test('노드 메모리(78 GiB) 축은 꼭대기까지 라벨이 붙는다', () => {
    // 예전에는 눈금 폭을 무조건 위로 올려 0 B와 50.0 GiB 둘만 남았다.
    const [min, max] = scaleRange(79_872 * MiB)
    expect([min, max]).toEqual([0, 93_000_000_000])
    const splits = splitsFor('binary', min, max)
    expect(splits).toEqual([0, 16 * GiB, 32 * GiB, 48 * GiB, 64 * GiB, 80 * GiB])
    expect(splits.map(formatBytes)).toEqual([
      '0 B',
      '16.0 GiB',
      '32.0 GiB',
      '48.0 GiB',
      '64.0 GiB',
      '80.0 GiB',
    ])
  })

  test('메모리 1 GiB짜리 VM 축도 1024 배수로만 끊긴다', () => {
    // 단위를 최대치에서 고르던 때는 폭이 단위의 0.2배로 잡혀 축이
    // '205 MiB / 410 MiB / 614 MiB'로 보였다.
    const [min, max] = scaleRange(1.02 * GiB)
    expect(splitsFor('binary', min, max).map(formatBytes)).toEqual([
      '0 B',
      '256 MiB',
      '512 MiB',
      '768 MiB',
      '1.00 GiB',
    ])
  })

  test('메모리 2 GiB짜리 VM 축은 1024 경계를 넘어도 딱 떨어진다', () => {
    const [min, max] = scaleRange(2 * GiB)
    expect(splitsFor('binary', min, max).map(formatBytes)).toEqual([
      '0 B',
      '512 MiB',
      '1.00 GiB',
      '1.50 GiB',
      '2.00 GiB',
    ])
  })

  test('값이 내내 0인 축은 같은 라벨을 여러 번 찍지 않는다', () => {
    // 할당이 아직 0인 기관의 추이 카드가 '1 B / 1 B / 1 B / 0 B / 0 B / 0 B'로
    // 보였다: 눈금 폭이 1바이트 밑으로 쪼개지고 라벨은 정수로 포맷되기 때문이다.
    const [min, max] = scaleRange(0)
    const labels = splitsFor('binary', min, max).map(formatBytes)
    expect(labels).toEqual(['0 B', '32 B', '64 B', '96 B'])
    expect(new Set(labels).size).toBe(labels.length)
  })

  test('네트워크(~130 kB/s) 축은 1024 배수 눈금을 유지한다', () => {
    const [min, max] = scaleRange(130_000)
    const splits = splitsFor('binary', min, max)
    expect(splits).toEqual([0, 32 * 1024, 64 * 1024, 96 * 1024, 128 * 1024])
    expect(splits.map(formatByteRate)).toEqual([
      '0 B/s',
      '32.0 KiB/s',
      '64.0 KiB/s',
      '96.0 KiB/s',
      '128 KiB/s',
    ])
  })

  test('네트워크(~1 MiB/s) 축도 단위가 바뀌는 자리에서 깨지지 않는다', () => {
    const [min, max] = scaleRange(1.05 * MiB)
    expect(splitsFor('binary', min, max).map(formatByteRate)).toEqual([
      '0 B/s',
      '256 KiB/s',
      '512 KiB/s',
      '768 KiB/s',
      '1.00 MiB/s',
    ])
  })

  test('vCPU처럼 작은 정수 축은 정수 눈금을 촘촘히 남긴다', () => {
    // 20 vCPU 구간: 예전에는 0·10·20 셋뿐이었다.
    expect(splitsFor('integer', ...scaleRange(20))).toEqual([0, 5, 10, 15, 20])
    // 3 vCPU처럼 아주 작은 값도 소수 눈금으로 쪼개지 않는다.
    expect(splitsFor('integer', ...scaleRange(3))).toEqual([0, 1, 2, 3])
    // 22 vCPU 구간도 꼭대기까지 라벨이 붙는다.
    expect(splitsFor('integer', ...scaleRange(22))).toEqual([0, 5, 10, 15, 20, 25])
  })

  test('12 vCPU처럼 애매한 구간에서도 꼭대기가 비지 않는다', () => {
    // 폭 5를 고르면 0·5·10에서 끝나 축 위쪽 29%에 라벨이 없다.
    expect(splitsFor('integer', ...scaleRange(12))).toEqual([
      0, 2, 4, 6, 8, 10, 12, 14,
    ])
  })

  test('0~100 백분율 구간은 20단위로 끊긴다', () => {
    // CPU 차트는 splitBase 없이 uPlot 기본 눈금(0·25·50·75·100)을 쓰지만,
    // 정수 축으로 다뤄도 꼭대기 라벨이 살아 있어야 한다.
    const splits = splitsFor('integer', 0, 100)
    expect(splits).toEqual([0, 20, 40, 60, 80, 100])
    expect(splits.map(formatPercent)).toEqual([
      '0.0%',
      '20.0%',
      '40.0%',
      '60.0%',
      '80.0%',
      '100%',
    ])
  })

  test('구간이 없거나 뒤집혀도 눈금을 만들다 멈추지 않는다', () => {
    expect(splitsFor('binary', 0, 0)).toEqual([0])
    expect(splitsFor('integer', 5, 5)).toEqual([5])
  })
})

describe('isolatedIndexes — 선으로 그려지지 않는 표본', () => {
  test('양옆이 비어 있는 표본만 고른다', () => {
    expect(isolatedIndexes([null, 3, null, 1, 2, null, null, 7])).toEqual([1, 7])
  })

  test('이어지는 표본은 선으로 그려지므로 고르지 않는다', () => {
    expect(isolatedIndexes([1, 2, 3])).toEqual([])
    expect(isolatedIndexes([null, null, null])).toEqual([])
  })

  test('표본이 하나뿐인 계열도 보이게 남긴다', () => {
    expect(isolatedIndexes([9])).toEqual([0])
  })
})
