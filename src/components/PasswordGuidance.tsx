import { cn } from '../lib/cn'
import {
  PASSWORD_RULE_LABELS,
  PASSWORD_RULE_ORDER,
  PASSWORD_STRENGTH_LABELS,
  passwordRuleStatus,
  passwordStrength,
} from '../lib/validation'

interface PasswordGuidanceProps {
  password: string
  /** 있으면 "이메일 주소 포함" 규칙까지 함께 검사한다. */
  email?: string
  className?: string
}

const BAR_TONES = ['bg-danger-500', 'bg-warning-500', 'bg-primary-500', 'bg-success-500'] as const

/**
 * 비밀번호 입력 아래에 붙는 실시간 안내: 서버 구조 규칙 체크리스트 + 대략적인
 * 강도 표시. 유출 비밀번호 차단목록은 서버에만 있으므로 여기서는 판정하지 않고
 * 제출 시 서버가 추가로 확인한다는 사실만 알린다.
 */
export function PasswordGuidance({ password, email, className }: PasswordGuidanceProps) {
  const pristine = password.length === 0
  const status = passwordRuleStatus(password, email)
  const score = passwordStrength(password)
  const strengthLabel = pristine ? '미입력' : PASSWORD_STRENGTH_LABELS[score]

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-label="비밀번호 강도"
          aria-valuemin={0}
          aria-valuemax={3}
          aria-valuenow={pristine ? 0 : score}
          aria-valuetext={strengthLabel}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-300/40"
        >
          <div
            className={cn('h-full rounded-full transition-all', BAR_TONES[score])}
            style={{ width: pristine ? '0%' : `${((score + 1) / 4) * 100}%` }}
          />
        </div>
        <span className="text-xs text-neutral-500">강도 {strengthLabel}</span>
      </div>
      <ul className="space-y-0.5">
        {PASSWORD_RULE_ORDER.map((rule) => {
          const ok = !pristine && status[rule]
          return (
            <li key={rule} className="flex items-start gap-1.5 text-xs text-neutral-500">
              <span
                aria-hidden="true"
                className={cn(
                  'leading-5',
                  pristine ? 'text-neutral-400' : ok ? 'text-success-600' : 'text-danger-600',
                )}
              >
                {pristine ? '·' : ok ? '✓' : '✕'}
              </span>
              <span>{PASSWORD_RULE_LABELS[rule]}</span>
              <span className="sr-only">{pristine ? '미입력' : ok ? '성공' : '미충족'}</span>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-neutral-500">
        흔한 비밀번호는 제출 시 서버에서 추가로 확인됩니다.
      </p>
    </div>
  )
}
