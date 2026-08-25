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
  /** 체크리스트 컨테이너의 id — 입력의 aria-describedby로 연결한다. */
  id?: string
  className?: string
}

const BAR_TONES = ['bg-danger-500', 'bg-warning-500', 'bg-primary-500', 'bg-success-500'] as const

/**
 * 비밀번호 입력 아래에 붙는 실시간 안내: 서버 규칙 체크리스트 + 대략적인 강도
 * 표시. 서버가 검사하는 규칙이 여기 나열된 것뿐이므로 체크리스트가 전부 ✓면
 * 제출이 정책으로 막히는 일은 없다.
 */
export function PasswordGuidance({ password, id, className }: PasswordGuidanceProps) {
  const pristine = password.length === 0
  const status = passwordRuleStatus(password)
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
      <ul id={id} aria-live="polite" className="space-y-0.5">
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
        다른 사이트와 같은 비밀번호는 사용하지 마세요. 기억하기 쉬운 세 단어 이상의 문장을
        권장합니다.
      </p>
    </div>
  )
}
