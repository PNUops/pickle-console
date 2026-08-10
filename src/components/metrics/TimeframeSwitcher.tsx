import type { MetricsTimeframe } from '../../api/queries'
import { TIMEFRAMES } from './timeframe'

/**
 * 조회 구간 선택 — 목록 필터 바(FilterBar)와 같은 누름 버튼 방식이다.
 * ARIA tabs 패턴(로빙 탭인덱스·화살표 이동)을 구현하지 않으므로 tab 롤을 쓰지 않고
 * aria-pressed로 선택 상태를 알린다.
 */
export function TimeframeSwitcher({
  value,
  onChange,
  label = '조회 구간',
}: {
  value: MetricsTimeframe
  onChange: (value: MetricsTimeframe) => void
  label?: string
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {TIMEFRAMES.map((timeframe) => {
        const selected = timeframe.value === value
        return (
          <button
            key={timeframe.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(timeframe.value)}
            className={
              'cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary-600 ' +
              (selected
                ? 'bg-primary-600 text-white'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900')
            }
          >
            {timeframe.label}
          </button>
        )
      })}
    </div>
  )
}
