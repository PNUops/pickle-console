/**
 * y축 눈금을 읽기 좋은 수로 끊는 방식.
 *  - binary: 1024 단위(512 MiB·1 GiB…) — 바이트 값에 쓴다. 기본 선형 눈금은
 *    '1.86 GiB' 같은 값을 만든다.
 *  - integer: 정수 — vCPU·대수처럼 소수가 의미 없는 값에 쓴다.
 */
export type SplitBase = 'binary' | 'integer'

/**
 * 1·2·5 계단에서 목표 폭에 가장 가까운 값 (비율로 재므로 위아래를 공평하게 본다).
 * 위로만 올리면 목표의 두 배가 넘는 폭이 잡혀 축 꼭대기에 라벨이 없는 눈금이
 * 만들어진다 — 78 GiB 메모리 축이 '0 B'와 '50.0 GiB' 둘로 끝나던 원인이다.
 */
function niceStepNear(target: number): number {
  if (!(target > 0) || !Number.isFinite(target)) return 1
  const power = 10 ** Math.floor(Math.log10(target))
  let best = power
  let bestDistance = Infinity
  for (const multiplier of [1, 2, 5, 10]) {
    const candidate = multiplier * power
    const distance = Math.abs(Math.log(candidate / target))
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return best
}

/**
 * 대략 네 칸으로 나뉘는 눈금 배열 — 축이 붐비지 않으면서 꼭대기까지 라벨이 붙는
 * 정도. binary는 1024의 거듭제곱을 단위로 삼아 눈금이 '20.0 GiB'처럼 떨어지게 한다.
 */
export function splitsFor(base: SplitBase, min: number, max: number): number[] {
  const span = max - min
  if (span <= 0) return [min]
  const unit =
    base === 'binary'
      ? 1024 ** Math.min(4, Math.max(0, Math.floor(Math.log(max) / Math.log(1024))))
      : 1
  const step = Math.max(niceStepNear(span / 4 / unit) * unit, base === 'integer' ? 1 : 0)
  if (!(step > 0)) return [min]
  const ticks: number[] = []
  for (let tick = Math.ceil(min / step) * step; tick <= max + step / 1000; tick += step) {
    ticks.push(tick)
  }
  return ticks
}

/**
 * 양옆이 모두 빈 값이라 선이 그려지지 않는 표본의 인덱스. 빈 구간을 이어 붙이지
 * 않는 대신 이런 표본에는 점을 찍어 준다 — 그러지 않으면 값이 있는데도 화면이
 * 비어 "사용량이 고장 났다"로 읽힌다(대부분 멈춰 있던 VM).
 */
export function isolatedIndexes(
  values: readonly (number | null | undefined)[],
): number[] {
  const indexes: number[] = []
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] == null) continue
    const before = index > 0 ? values[index - 1] : null
    const after = index + 1 < values.length ? values[index + 1] : null
    if (before == null && after == null) indexes.push(index)
  }
  return indexes
}
