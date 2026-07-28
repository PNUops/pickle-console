import { cn } from '../lib/cn'
import {
  EMAIL_DEPENDENT_RULES,
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
  /** 체크리스트 컨테이너의 id — 입력의 aria-describedby로 연결한다. */
  id?: string
  className?: string
}

const BAR_TONES = ['bg-danger-500', 'bg-warning-500', 'bg-primary-500', 'bg-success-500'] as const

/**
 * 비밀번호 입력 아래에 붙는 실시간 안내: 서버 구조 규칙 체크리스트 + 대략적인
 * 강도 표시. 유출 비밀번호 차단목록은 서버에만 있으므로 여기서는 판정하지 않고
 * 제출 시 서버가 추가로 확인한다는 사실만 알린다.
 */
export function PasswordGuidance({ password, email, id, className }: PasswordGuidanceProps) {
  const pristine = password.length === 0
  const status = passwordRuleStatus(password, email)
  // 이메일을 모르면(미전달·아직 입력 전) "이메일 주소 포함" 규칙은 클라이언트가
  // 판정할 수 없다 — 통과한 것처럼 ✓를 보여주지 않고 서버 확인 예정임을 알린다.
  const unverifiable = (rule: (typeof PASSWORD_RULE_ORDER)[number]) =>
    !email?.trim() && EMAIL_DEPENDENT_RULES.includes(rule)
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
          const unknown = unverifiable(rule)
          const neutral = pristine || unknown
          const ok = !neutral && status[rule]
          return (
            <li key={rule} className="flex items-start gap-1.5 text-xs text-neutral-500">
              <span
                aria-hidden="true"
                className={cn(
                  'leading-5',
                  neutral ? 'text-neutral-400' : ok ? 'text-success-600' : 'text-danger-600',
                )}
              >
                {neutral ? '·' : ok ? '✓' : '✕'}
              </span>
              <span>
                {PASSWORD_RULE_LABELS[rule]}
                {unknown && <span className="text-neutral-400"> (서버에서 확인)</span>}
              </span>
              <span className="sr-only">
                {unknown ? '서버에서 확인' : pristine ? '미입력' : ok ? '성공' : '미충족'}
              </span>
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
