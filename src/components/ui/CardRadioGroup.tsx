import { useId, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface CardRadioOption<T extends string> {
  value: T
  /** 카드의 첫 줄. */
  title: ReactNode
  /** 제목 아래 한 줄 설명. */
  description?: ReactNode
  /** 설명 아래 보조 줄(사양 수치처럼 값 자체를 보여 줄 때). */
  meta?: ReactNode
  disabled?: boolean
}

export interface CardRadioGroupProps<T extends string> {
  /** 무엇을 고르는지. fieldset의 legend가 된다. */
  legend: string
  value: T | null
  onChange: (value: T) => void
  options: CardRadioOption<T>[]
  required?: boolean
  error?: string
  /** legend 아래 안내. */
  description?: string
  /** 넓은 화면에서의 열 수. 좁은 화면은 언제나 한 열이다. */
  columns?: 1 | 2 | 3
  className?: string
}

const COLUMN_CLASS = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
} as const

/**
 * 카드 모양의 단일 선택.
 *
 * 네이티브 라디오를 카드 안에 그대로 두는 것은 의도다. 화살표 키 이동과 그룹
 * 안에서의 위치 안내("n 중 m"), 폼 참여를 브라우저가 이미 해 준다. 같은 것을
 * `aria-pressed` 버튼 나열로 흉내 내면 roving tabindex와 키 처리를 직접 써야 하고,
 * 이 레포는 그 방식으로 세 곳에서 화살표 이동을 잃고 있었다.
 *
 * 선택 상태의 표시는 `has-checked:`가 라디오의 상태에서 직접 끌어온다. 별도의
 * `selected` 계산이 없으므로 화면과 값이 어긋날 자리가 없다.
 */
export function CardRadioGroup<T extends string>({
  legend,
  value,
  onChange,
  options,
  required,
  error,
  description,
  columns = 2,
  className,
}: CardRadioGroupProps<T>) {
  const id = useId()
  const name = `${id}-radio`
  const errorId = error ? `${id}-error` : undefined
  const descriptionId = description ? `${id}-description` : undefined

  return (
    <fieldset
      className={cn('flex flex-col gap-2', className)}
      aria-required={required || undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={[errorId, descriptionId].filter(Boolean).join(' ') || undefined}
    >
      <legend className="flex items-center gap-0.5 text-sm font-medium text-foreground-secondary">
        {legend}
        {required && (
          <span aria-hidden="true" className="text-danger-600">
            *
          </span>
        )}
      </legend>
      {description && (
        <p id={descriptionId} className="text-xs text-foreground-muted">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
      <div className={cn('mt-1 grid grid-cols-1 gap-3', COLUMN_CLASS[columns])}>
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-card border border-stroke-subtle bg-surface-card px-4 py-3',
              'has-checked:border-primary-300 has-checked:bg-brand-subtle',
              'has-disabled:cursor-not-allowed has-disabled:bg-surface-subtle',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand-fill disabled:cursor-not-allowed"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground-primary">{option.title}</span>
              {option.description && (
                <span className="text-xs text-foreground-muted">{option.description}</span>
              )}
              {option.meta && (
                <span className="text-xs text-foreground-secondary">{option.meta}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
