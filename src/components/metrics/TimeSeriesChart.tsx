import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { isolatedIndexes, splitsFor, type SplitBase } from './chart-scales'
import {
  CHART_AXIS_TEXT,
  CHART_GRID,
  CHART_REFERENCE,
  CHART_SERIES,
} from './chart-colors'

export interface ChartSeries {
  label: string
  /** 시각 배열과 길이가 같은 값 배열. null은 자료가 없는 구간(빈 구간)이다. */
  data: (number | null)[]
  /** 지정하지 않으면 계열 순서대로 슬롯 색을 쓴다. */
  color?: string
  /** 최대치·용량 기준선 — 중립색 파선으로 그린다. */
  reference?: boolean
}

export interface TimeSeriesChartProps {
  /** 차트 제목 — 접근 가능한 이름이자 표 보기의 캡션. */
  title: string
  /** x축 값 (epoch 초, 오름차순). */
  times: number[]
  series: ChartSeries[]
  /** y값 포맷터 — 축·툴팁·표가 공유한다. */
  format: (value: number) => string
  /** x축·툴팁의 시각 라벨 포맷터. */
  formatTime: (seconds: number) => string
  /** y축 상한 고정 (백분율 차트 등). 없으면 자료에 맞춰 0부터 잡는다. */
  yMax?: number
  /** y축 눈금을 끊는 방식 — 바이트·정수 값은 지정해야 눈금이 깔끔하다. */
  splitBase?: SplitBase
  height?: number
  /** 차트 아래 보조 설명. */
  caption?: ReactNode
}

/** 표 보기에 넣을 최대 행 수 — 값을 훑기 좋은 정도로만 솎아 낸다. */
const TABLE_ROWS = 12

/**
 * canvas 2d 컨텍스트를 쓸 수 있는 환경인지 (jsdom·구형 브라우저에서는 없다).
 * 한 번만 조사하고 결과를 재사용한다 — 없으면 차트는 그리지 않고 제목·범례·표
 * 보기만 남는다(값은 표로 여전히 읽을 수 있다).
 */
let canvasSupport: boolean | null = null
function supportsCanvas(): boolean {
  if (canvasSupport == null) {
    try {
      canvasSupport = document.createElement('canvas').getContext('2d') != null
    } catch {
      canvasSupport = false
    }
  }
  return canvasSupport
}

function seriesColor(series: ChartSeries, index: number): string {
  if (series.color) return series.color
  if (series.reference) return CHART_REFERENCE
  return CHART_SERIES[index % CHART_SERIES.length]
}

/**
 * 값이 실제로 달라졌는지 — 호출부는 렌더마다 새 배열을 만들므로 참조 비교로는
 * 알 수 없다. 점 수가 수십 개라 값 비교가 더 싸고, 이것으로 폴링 때가 아닌 렌더에
 * setData(축 초기화 포함)가 도는 것을 막는다.
 */
function sameData(a: uPlot.AlignedData, b: uPlot.AlignedData): boolean {
  if (a.length !== b.length) return false
  for (let series = 0; series < a.length; series += 1) {
    const left = a[series] as (number | null)[]
    const right = b[series] as (number | null)[]
    if (left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return false
    }
  }
  return true
}

/** 표 보기에 쓸 인덱스 — 처음과 끝을 포함해 고르게 솎는다. */
function sampledIndexes(length: number): number[] {
  if (length <= TABLE_ROWS) return Array.from({ length }, (_, i) => i)
  const step = (length - 1) / (TABLE_ROWS - 1)
  return Array.from({ length: TABLE_ROWS }, (_, i) => Math.round(i * step))
}

/**
 * uPlot 얇은 래퍼 — 시계열 하나를 그린다. 값이 null인 구간은 이어 붙이지 않고
 * 빈 구간으로 남긴다(VM이 중지된 동안 등). 축은 하나뿐이며, 단위가 다른 값은
 * 차트를 나눠 그린다.
 */
export function TimeSeriesChart({
  title,
  times,
  series,
  format,
  formatTime,
  yMax,
  splitBase,
  height = 200,
  caption,
}: TimeSeriesChartProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const [hover, setHover] = useState<{ index: number; left: number; top: number } | null>(
    null,
  )

  const colors = series.map(seriesColor)
  // 계열 구성이 바뀔 때만 플롯을 다시 만든다 — 폴링 갱신은 setData로 처리한다.
  const seriesKey = series
    .map((item, index) => `${item.label}|${colors[index]}|${item.reference ? 'ref' : ''}`)
    .join('¶')

  const data = useMemo(
    () => [times, ...series.map((item) => item.data)] as unknown as uPlot.AlignedData,
    [times, series],
  )

  // 콜백은 플롯 생성 시점의 값에 고정되므로 최신 포맷터를 ref로 넘긴다.
  // 자료도 마찬가지 — 생성 효과는 그 시점의 자료로 시작하고, 이후 갱신은 setData가 맡는다.
  const formatRef = useRef(format)
  const formatTimeRef = useRef(formatTime)
  const dataRef = useRef(data)
  /** 플롯에 이미 밀어 넣은 자료 — 값이 그대로면 다시 밀지 않는다. */
  const pushedRef = useRef<uPlot.AlignedData | null>(null)
  formatRef.current = format
  formatTimeRef.current = formatTime
  dataRef.current = data

  useEffect(() => {
    const host = hostRef.current
    if (!host || !supportsCanvas()) return

    const parsed = seriesKey ? seriesKey.split('¶') : []
    const options: uPlot.Options = {
      width: host.clientWidth || 600,
      height,
      legend: { show: false },
      cursor: { y: false, points: { size: 8 } },
      scales: {
        x: { time: true },
        y: {
          range: (_u, _min, max) => {
            if (yMax != null) return [0, yMax]
            if (max == null || !Number.isFinite(max) || max <= 0) return [0, 1]
            return uPlot.rangeNum(0, max, 0.1, true) as [number, number]
          },
        },
      },
      axes: [
        {
          stroke: CHART_AXIS_TEXT,
          grid: { stroke: CHART_GRID, width: 1 },
          ticks: { stroke: CHART_GRID, width: 1 },
          font: '11px system-ui, sans-serif',
          values: (_u, splits) => splits.map((value) => formatTimeRef.current(value)),
        },
        {
          stroke: CHART_AXIS_TEXT,
          grid: { stroke: CHART_GRID, width: 1 },
          ticks: { show: false },
          font: '11px system-ui, sans-serif',
          size: 60,
          splits: splitBase
            ? (_u, _axisIdx, scaleMin, scaleMax) =>
                splitsFor(splitBase, scaleMin, scaleMax)
            : undefined,
          values: (_u, splits) => splits.map((value) => formatRef.current(value)),
        },
      ],
      series: [
        {},
        ...parsed.map((key) => {
          const [, color, reference] = key.split('|')
          return {
            stroke: color,
            width: reference ? 1.5 : 2,
            dash: reference ? [4, 4] : undefined,
            spanGaps: false,
            // 선으로는 그려지지 않는 외톨이 표본만 점으로 남긴다 — 빈 구간은 그대로 빈 구간이다.
            points: {
              show: true,
              size: 5,
              filter: (plot, seriesIndex) =>
                isolatedIndexes(plot.data[seriesIndex] as (number | null)[]),
            },
          } satisfies uPlot.Series
        }),
      ],
      hooks: {
        setCursor: [
          (plot) => {
            const index = plot.cursor.idx
            const left = plot.cursor.left ?? -10
            if (index == null || left < 0) {
              setHover(null)
              return
            }
            // cursor 좌표는 플롯 영역(.u-over) 기준이고 툴팁은 래퍼 기준이라,
            // 좌측 y축 폭만큼 어긋난다 — 플롯 영역의 오프셋을 더해 맞춘다.
            setHover({
              index,
              left: left + plot.over.offsetLeft,
              top: (plot.cursor.top ?? 0) + plot.over.offsetTop,
            })
          },
        ],
      },
    }

    const plot = new uPlot(options, dataRef.current, host)
    plotRef.current = plot
    pushedRef.current = dataRef.current

    const observer = new ResizeObserver(() => {
      plot.setSize({ width: host.clientWidth || 600, height })
    })
    observer.observe(host)

    return () => {
      observer.disconnect()
      plot.destroy()
      plotRef.current = null
      pushedRef.current = null
      setHover(null)
    }
  }, [seriesKey, height, yMax, splitBase])

  // 값이 그대로면 setData를 호출하지 않는다 — setData는 축을 되돌리므로 폴링과
  // 무관한 리렌더마다 부르면 사용자가 잡아 둔 확대가 풀린다.
  useEffect(() => {
    const plot = plotRef.current
    if (!plot) return
    if (pushedRef.current != null && sameData(pushedRef.current, data)) return
    plot.setData(data)
    pushedRef.current = data
  }, [data])

  const hovered = hover != null && hover.index < times.length ? hover : null
  const rows = sampledIndexes(times.length)

  return (
    <figure className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
        {series.length > 1 && (
          <ul className="flex flex-wrap items-center gap-3">
            {series.map((item, index) => (
              <li
                key={item.label}
                className="flex items-center gap-1.5 text-xs text-neutral-600"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-0.5 w-4 rounded-full"
                  style={{
                    backgroundColor: colors[index],
                    opacity: item.reference ? 0.8 : 1,
                  }}
                />
                {item.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div ref={hostRef} className="relative w-full" style={{ height }}>
        {hovered && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-10 -translate-y-1/2 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs whitespace-nowrap shadow-card"
            style={{
              left: Math.min(hovered.left + 12, Math.max((hostRef.current?.clientWidth ?? 0) - 140, 0)),
              top: hovered.top,
            }}
          >
            <p className="font-medium text-neutral-700">{formatTime(times[hovered.index])}</p>
            <ul className="mt-0.5 space-y-0.5">
              {series.map((item, index) => (
                <li key={item.label} className="flex items-center gap-1.5 text-neutral-600">
                  <span
                    className="inline-block h-0.5 w-3 rounded-full"
                    style={{ backgroundColor: colors[index] }}
                  />
                  {item.label} {formatValue(item.data[hovered.index], format)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {caption && <figcaption className="text-xs text-neutral-500">{caption}</figcaption>}

      <details className="text-xs text-neutral-500">
        <summary className="cursor-pointer text-primary-700 hover:underline">
          표로 보기
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left tabular-nums">
            <caption className="sr-only">{title} 값 표</caption>
            <thead>
              <tr className="text-neutral-500">
                <th scope="col" className="py-1 pr-3 font-medium">
                  시각
                </th>
                {series.map((item) => (
                  <th key={item.label} scope="col" className="py-1 pr-3 font-medium">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {rows.map((index) => (
                <tr key={times[index]}>
                  <th scope="row" className="py-1 pr-3 font-normal whitespace-nowrap">
                    {formatTime(times[index])}
                  </th>
                  {series.map((item) => (
                    <td key={item.label} className="py-1 pr-3 whitespace-nowrap">
                      {formatValue(item.data[index], format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

/** 자료가 없는 구간은 대시로 — 0과 구별되어야 한다. */
function formatValue(
  value: number | null | undefined,
  format: (value: number) => string,
): string {
  return value == null ? '—' : format(value)
}
