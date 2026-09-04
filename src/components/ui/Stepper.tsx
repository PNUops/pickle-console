import { cn } from '../../lib/cn'

export interface StepperProps {
  /** Step labels in order. */
  steps: string[]
  /** Zero-based index of the current step. Steps before it render as complete. */
  current: number
  /**
   * 라벨을 어디까지 보여 줄지.
   *
   * `always`는 언제나, `sm`은 좁은 화면에서만 감추고, `never`는 늘 감춘다.
   * 감춘 라벨도 DOM에는 남으므로 보조 기술은 언제나 읽는다. 좁은 화면에서
   * 감출 때는 스테퍼 아래에 지금 단계를 말하는 문장을 따로 둔다.
   */
  labels?: 'always' | 'sm' | 'never'
  className?: string
}

export function Stepper({ steps, current, labels = 'always', className }: StepperProps) {
  return (
    <ol className={cn('flex items-start gap-2', className)}>
      {steps.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo'
        return (
          <li
            key={step}
            aria-current={state === 'current' ? 'step' : undefined}
            // 마지막 항목은 늘리지 않는다. 연결선이 없는데 같은 몫을 받으면 그만큼이
            // 오른쪽 빈자리로 남는다.
            className={cn(
              'flex items-start gap-2',
              index < steps.length - 1 ? 'flex-1' : 'flex-none',
            )}
          >
            {/* 라벨이 원 아래에 선다. 옆에 두면 좁은 화면에서 자리가 없어 감춰야 하고,
                그러면 어느 단계인지 말하는 문장을 스테퍼 밖에 따로 두게 된다. */}
            <div className="flex flex-col items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  state === 'done' && 'bg-primary-600 text-white',
                  state === 'current' && 'bg-primary-100 text-primary-800 ring-2 ring-primary-600',
                  state === 'todo' && 'bg-neutral-100 text-neutral-500',
                )}
              >
                {state === 'done' ? (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  'text-center text-xs whitespace-nowrap',
                  labels === 'never' && 'sr-only',
                  state === 'current'
                    ? 'font-semibold text-primary-800'
                    : 'text-neutral-500',
                )}
              >
                {step}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                // 원의 세로 중앙(28px의 절반)에 맞춘다.
                className={cn(
                  'mt-3.5 h-px min-w-4 flex-1',
                  index < current ? 'bg-primary-600' : 'bg-neutral-200',
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
