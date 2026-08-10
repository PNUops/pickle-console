/**
 * y축 눈금을 읽기 좋은 수로 끊는 방식.
 *  - binary: 1024 단위(512 MiB·1 GiB…) — 바이트 값에 쓴다. 기본 선형 눈금은
 *    '1.86 GiB' 같은 값을 만든다.
 *  - integer: 정수 — vCPU·대수처럼 소수가 의미 없는 값에 쓴다.
 */
export type SplitBase = 'binary' | 'integer'

/**
 * 눈금 폭 후보. binary는 1024의 거듭제곱(KiB·MiB·GiB…)을 단위로 삼고 그 단위의
 * 2의 거듭제곱 배수만 쓴다 — 라벨이 어느 단위로 떨어지든 '512 MiB / 1.00 GiB'처럼
 * 딱 떨어진다. 1·2·5 배수는 두 가지로 어긋난다: 단위를 최대치에서 고르면 0.2배
 * 폭이 잡혀 '205 MiB / 410 MiB'가 되고, 단위를 눈금 폭에서 골라도 눈금이 다음
 * 1024 경계를 넘는 순간 '1.46 GiB' 같은 라벨이 된다.
 * integer는 소수가 뜻이 없는 값(vCPU·대수)이라 익숙한 1·2·5 계단을 쓴다.
 */
const BINARY_MULTIPLIERS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]
const DECIMAL_MULTIPLIERS = [1, 2, 5, 10]

/** 목표 폭 언저리의 눈금 폭 후보들 — 작은 것부터. */
function stepCandidates(base: SplitBase, target: number): number[] {
  if (base === 'binary') {
    // 단위는 최대치가 아니라 목표 폭에서 고른다 — 최대치에서 고르면 폭이 단위의
    // 0.2배까지 쪼개져 '205 MiB'가 나온다.
    const power = Math.min(4, Math.max(0, Math.floor(Math.log(target) / Math.log(1024))))
    const unit = 1024 ** power
    return BINARY_MULTIPLIERS.map((multiplier) => multiplier * unit)
  }
  const power = 10 ** Math.floor(Math.log10(target))
  return DECIMAL_MULTIPLIERS.map((multiplier) => multiplier * power)
}

/**
 * 대략 네 칸으로 나뉘는 눈금 배열 — 축이 붐비지 않으면서 꼭대기까지 라벨이 붙는
 * 정도. binary는 1024의 거듭제곱을 단위로 삼아 눈금이 '16.0 GiB'처럼 떨어지게 한다.
 */
export function splitsFor(base: SplitBase, min: number, max: number): number[] {
  const span = max - min
  if (!(span > 0) || !Number.isFinite(span)) return [min]
  const target = span / 4
  // 두 축 모두 1이 하한이다: 바이트도 대수도 1 미만 눈금은 뜻이 없고, 소수 눈금은
  // 정수로 포맷되면서 '0 B / 0 B / 1 B / 1 B'처럼 같은 라벨을 여러 번 찍는다
  // (할당이 아직 0인 기관의 추이 카드가 그렇게 보였다).
  const candidates = stepCandidates(base, target).map((step) => Math.max(step, 1))
  // 목표 폭에 가장 가까운 후보 (비율로 재므로 위아래를 공평하게 본다). 위로만
  // 올리면 목표의 두 배가 넘는 폭이 잡혀 축 꼭대기에 라벨이 없다 — 78 GiB 메모리
  // 축이 '0 B'와 '50.0 GiB' 둘로 끝나던 원인이다.
  let chosen = 0
  let bestDistance = Infinity
  for (let index = 0; index < candidates.length; index += 1) {
    const distance = Math.abs(Math.log(candidates[index] / target))
    if (distance < bestDistance) {
      bestDistance = distance
      chosen = index
    }
  }
  // 가장 가까운 후보라도 축 꼭대기를 한참 비워 둘 수 있다(12 vCPU 축이 0·5·10에서
  // 끝나 위쪽 29%에 라벨이 없던 경우). 마지막 눈금이 축의 3/4에도 못 미치면 한
  // 단계 촘촘한 폭으로 내려온다.
  while (chosen > 0 && Math.floor(max / candidates[chosen]) * candidates[chosen] < min + span * 0.75) {
    chosen -= 1
  }
  const step = candidates[chosen]
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
