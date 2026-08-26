import { useId } from 'react'
import { CHART_CATEGORICAL, CHART_RESIDUAL } from '../metrics/chart-colors'

/**
 * 비중을 보여 주는 도넛 하나.
 *
 * uPlot이 아니라 SVG다 — uPlot은 시계열 그리기 라이브러리이고 원형은 그 축이
 * 없다. 그려야 할 것이 호 몇 개뿐이라 라이브러리를 하나 더 들이는 값이 나오지
 * 않는다.
 *
 * **색만으로 구분하지 않는다.** 조각마다 범례에 이름과 값이 함께 나오고, 도넬
 * 자체는 `role="img"`에 전체를 읽어 주는 이름을 단다 — 화면 낭독기에는 호가 아니라
 * 그 문장이 전달된다.
 */
export interface DonutSlice {
  label: string
  value: number
  /** 나머지를 묶은 조각인가 — 색을 중립으로 쓴다. */
  residual?: boolean
}

export interface DonutChartProps {
  title: string
  slices: DonutSlice[]
  /** 값의 표기(요청 수·토큰 수 등). */
  format: (value: number) => string
  size?: number
}

/** 조각 사이의 틈(도) — 인접한 두 색이 서로 번지지 않도록. */
const GAP_DEGREES = 1.5
const STROKE = 22

export function DonutChart({ title, slices, format, size = 176 }: DonutChartProps) {
  const titleId = useId()
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  if (total <= 0) {
    return (
      <p className="text-sm text-neutral-500">{title}을(를) 그릴 자료가 아직 없습니다.</p>
    )
  }

  const radius = (size - STROKE) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0
  const arcs = slices.map((slice, index) => {
    const share = slice.value / total
    const gap = (GAP_DEGREES / 360) * circumference
    // 한 조각이 전부일 때는 틈을 내지 않는다 — 원 하나에 틈을 내면 자기 자신과
    // 벌어진 것처럼 보인다.
    const length = Math.max(share * circumference - (slices.length > 1 ? gap : 0), 0)
    const arc = {
      // 팔레트를 넘어서면 순환시키지 않는다 — 검증된 색이 네 개뿐이라 다섯째
      // 조각이 첫째 색을 다시 쓰면 원 위에서 두 조각이 같은 색으로 붙는다.
      // 부르는 쪽이 상위 넷 + 기타로 잘라 주지만, 그 규칙이 여기서도 지켜진다.
      color:
        slice.residual || index >= CHART_CATEGORICAL.length
          ? CHART_RESIDUAL
          : CHART_CATEGORICAL[index],
      dash: `${length} ${circumference - length}`,
      rotation: (offset / circumference) * 360 - 90,
      share,
      slice,
    }
    offset += share * circumference
    return arc
  })

  const summary = arcs
    .map((arc) => `${arc.slice.label} ${Math.round(arc.share * 100)}%`)
    .join(', ')

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        role="img"
        aria-labelledby={titleId}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
      >
        <title id={titleId}>{`${title}: ${summary}`}</title>
        {arcs.map((arc) => (
          <circle
            key={arc.slice.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={STROKE}
            strokeDasharray={arc.dash}
            transform={`rotate(${arc.rotation} ${size / 2} ${size / 2})`}
          />
        ))}
      </svg>
      <ul className="min-w-[12rem] flex-1 space-y-1 text-sm">
        {arcs.map((arc) => (
          <li key={arc.slice.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: arc.color }}
            />
            <span className="flex-1 truncate text-neutral-700" title={arc.slice.label}>
              {arc.slice.label}
            </span>
            <span className="text-neutral-500">
              {format(arc.slice.value)} · {Math.round(arc.share * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
