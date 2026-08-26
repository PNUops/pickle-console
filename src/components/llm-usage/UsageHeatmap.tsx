import type { LlmKeyHourlyUsage } from '../../api/queries'

/**
 * 요일 x 시각(KST) 요청 분포.
 *
 * 서버는 요청이 있는 칸만 보내므로 격자는 여기서 채운다 — 빈 칸이 빠진 채로
 * 그리면 격자가 무너져 요일과 시각을 못 읽는다.
 *
 * 색은 단일 색조의 명암 단계다. 크기는 양이지 정체성이 아니므로 범주 색을 쓰면
 * 안 된다. **색만으로 읽히지 않도록** 칸마다 `title`과 화면 낭독기용 문장이 붙고,
 * 아래 눈금이 색과 숫자를 잇는다.
 */
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]
const WEEKDAY_LABELS: Record<number, string> = {
  1: '월',
  2: '화',
  3: '수',
  4: '목',
  5: '금',
  6: '토',
  7: '일',
}

/** 0(빈 칸) 포함 다섯 단계. primary 램프의 연한 쪽부터. */
const STEPS = ['bg-neutral-100', 'bg-primary-100', 'bg-primary-300', 'bg-primary-500', 'bg-primary-700']

function step(requests: number, max: number): number {
  if (requests <= 0) return 0
  // 최댓값을 4단계로 나눈다. 1건도 반드시 첫 단계 이상으로 보이게 해서
  // "한 번 썼다"가 "안 썼다"와 같은 색이 되지 않게 한다.
  return Math.min(4, Math.max(1, Math.ceil((requests / max) * 4)))
}

export function UsageHeatmap({ cells }: { cells: LlmKeyHourlyUsage[] }) {
  const byCell = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell.requests]))
  const max = cells.reduce((top, cell) => Math.max(top, cell.requests), 0)
  if (max === 0) {
    return <p className="text-sm text-neutral-500">이 기간에는 요청이 없습니다.</p>
  }
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-xs">
          <caption className="sr-only">요일과 시각별 요청 수 (KST)</caption>
          <thead>
            <tr>
              <th scope="col" className="sr-only">
                요일
              </th>
              {HOURS.map((hour) => (
                <th
                  key={hour}
                  scope="col"
                  className="w-4 pb-1 font-normal text-neutral-400"
                  aria-label={`${hour}시`}
                >
                  {hour % 6 === 0 ? hour : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((weekday) => (
              <tr key={weekday}>
                <th
                  scope="row"
                  className="pr-2 text-right font-normal text-neutral-500"
                >
                  {WEEKDAY_LABELS[weekday]}
                </th>
                {HOURS.map((hour) => {
                  const requests = byCell.get(`${weekday}-${hour}`) ?? 0
                  const label = `${WEEKDAY_LABELS[weekday]}요일 ${hour}시 ${requests.toLocaleString('ko-KR')}회`
                  return (
                    <td
                      key={hour}
                      title={label}
                      className={`h-4 w-4 rounded-sm ${STEPS[step(requests, max)]}`}
                    >
                      <span className="sr-only">{label}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span>적음</span>
        {STEPS.slice(1).map((tone) => (
          <span key={tone} className={`h-3 w-3 rounded-sm ${tone}`} aria-hidden="true" />
        ))}
        <span>많음 (최대 {max.toLocaleString('ko-KR')}회)</span>
      </div>
    </div>
  )
}
