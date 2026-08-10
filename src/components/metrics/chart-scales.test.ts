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
    expect(splits).toEqual([0, 20 * GiB, 40 * GiB, 60 * GiB, 80 * GiB])
    expect(splits.map(formatBytes)).toEqual([
      '0 B',
      '20.0 GiB',
      '40.0 GiB',
      '60.0 GiB',
      '80.0 GiB',
    ])
  })

  test('네트워크(~130 kB/s) 축은 1024 배수 눈금을 유지한다', () => {
    const [min, max] = scaleRange(130_000)
    const splits = splitsFor('binary', min, max)
    expect(splits).toEqual([0, 50 * 1024, 100 * 1024])
    expect(splits.map(formatByteRate)).toEqual(['0 B/s', '50.0 KiB/s', '100 KiB/s'])
  })

  test('vCPU처럼 작은 정수 축은 정수 눈금을 촘촘히 남긴다', () => {
    // 20 vCPU 구간: 예전에는 0·10·20 셋뿐이었다.
    expect(splitsFor('integer', ...scaleRange(20))).toEqual([0, 5, 10, 15, 20])
    // 3 vCPU처럼 아주 작은 값도 소수 눈금으로 쪼개지 않는다.
    expect(splitsFor('integer', ...scaleRange(3))).toEqual([0, 1, 2, 3])
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
