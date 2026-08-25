/**
 * 예산 게이지 하나 — 쓴 만큼과 한도, 그리고 한도가 없거나 닫혀 있는 경우.
 *
 * 관리자 대시보드의 용량 막대와 같은 접근성 계약(`role="progressbar"` +
 * `aria-valuetext`)을 따르되 컴포넌트를 공유하지 않는다. 저쪽 분모는 물리 용량이라
 * 언제나 숫자지만 예산의 분모는 **없을 수도, 0일 수도, 아직 모를 수도** 있고,
 * 그 세 경우를 하나로 뭉개면 "한도 없음"과 "쓸 수 없음"이 같은 그림이 된다.
 */
export interface BudgetGaugeProps {
  label: string
  /** 쓴 만큼의 표기. 아직 알 수 없으면 null. */
  usedLabel: string | null
  /** 한도의 표기. 한도가 없으면 null. */
  limitLabel: string | null
  /** 채울 비율(0~1). 그릴 수 없으면 null — 막대 자체가 나오지 않는다. */
  ratio: number | null
  /** 막대 대신 보여 줄 문장. 한도가 없거나 축이 닫혀 있을 때. */
  note?: string
  /** 값이 실측이 아니라 주기적으로 읽어 온 것임을 밝히는 꼬리말. */
  freshness?: string
}

export function BudgetGauge({
  label,
  usedLabel,
  limitLabel,
  ratio,
  note,
  freshness,
}: BudgetGaugeProps) {
  const percent = ratio != null ? Math.round(ratio * 100) : null
  // 비율은 있는 그대로 적고 막대만 잘라 그린다 — 120%를 100%로 줄여 쓰면
  // 넘어섰다는 사실이 그림에서 사라진다.
  const barPercent = percent != null ? Math.min(percent, 100) : null
  const valueLabel =
    usedLabel == null
      ? '아직 보고된 사용량이 없습니다'
      : `${usedLabel}${limitLabel ? ` / ${limitLabel}` : ''}${percent != null ? ` (${percent}%)` : ''}`
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-neutral-700">{label}</span>
        <span className="text-neutral-500">{valueLabel}</span>
      </div>
      {barPercent != null && (
        <div
          role="progressbar"
          aria-label={`${label} 소진율`}
          aria-valuenow={percent ?? undefined}
          aria-valuemin={0}
          aria-valuemax={Math.max(100, percent ?? 0)}
          aria-valuetext={valueLabel}
          className="h-2 overflow-hidden rounded-full bg-neutral-100"
        >
          <div
            className={
              'h-full rounded-full ' +
              (ratio != null && ratio >= 0.85
                ? 'bg-danger-500'
                : ratio != null && ratio >= 0.7
                  ? 'bg-warning-500'
                  : 'bg-primary-500')
            }
            style={{ width: `${barPercent}%` }}
          />
        </div>
      )}
      {note && <p className="text-xs text-neutral-500">{note}</p>}
      {freshness && <p className="text-xs text-neutral-400">{freshness}</p>}
    </div>
  )
}
