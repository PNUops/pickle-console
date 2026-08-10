/**
 * 시계열 응답의 점 배열에서 계열 하나를 뽑아 낸다. 값이 없는 점(null·미보고)은
 * 그대로 null로 통과시켜 빈 구간으로 남긴다 — 0으로 메우면 "쓰지 않았다"와
 * "알 수 없다"가 같은 그림이 된다.
 *
 * scale은 계약의 단위를 화면 단위로 옮기는 데 쓴다 (0~1 사용률 → 백분율 등).
 */
export function pickSeries<T extends object>(
  points: readonly T[],
  key: keyof T,
  scale = 1,
): (number | null)[] {
  return points.map((point) => {
    const value = point[key]
    return typeof value === 'number' ? value * scale : null
  })
}
