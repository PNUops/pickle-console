import type { PublicationView } from '../../api/queries'
import { cn } from '../../lib/cn'
import { formatDateTime } from '../../lib/format'

type StepState = 'done' | 'active' | 'failed' | 'pending'

interface JourneyStep {
  title: string
  state: StepState
  caption: string
}

/**
 * 커스텀 도메인의 연결 진행 체크리스트 — 소유 확인 → 인증서 발급 → 라우트
 * 적용의 3단 세로 파이프라인. 4축 원자 상태를 "여정의 현재 위치"로 번역하는
 * 이 화면의 시그니처 장치라, 원자 배지 나열 대신 이 표현을 쓴다.
 */
export function ConnectionJourney({ pub }: { pub: PublicationView }) {
  const steps = deriveSteps(pub)
  return (
    <section aria-label="연결 진행" className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-800">연결 진행</h3>
      <ol className="space-y-0">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <div className="flex flex-col items-center">
              <StepIcon state={step.state} />
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'w-px flex-1',
                    step.state === 'done' ? 'bg-success-300' : 'bg-neutral-200',
                  )}
                />
              )}
            </div>
            <div className="pb-4">
              <p
                className={cn(
                  'text-sm font-medium',
                  step.state === 'pending' ? 'text-neutral-400' : 'text-neutral-800',
                )}
              >
                {step.title}
              </p>
              <p
                className={cn(
                  'text-xs',
                  step.state === 'failed' ? 'text-danger-700' : 'text-neutral-500',
                )}
              >
                {step.caption}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function deriveSteps(pub: PublicationView): JourneyStep[] {
  const domain = pub.domain
  const certificate = pub.certificate ?? null
  const route = pub.route ?? null

  const ownership: JourneyStep = {
    title: '소유 확인',
    ...(domain.status === 'ACTIVE'
      ? {
          state: 'done',
          caption: domain.verifiedAt
            ? `확인 완료 · ${formatDateTime(domain.verifiedAt)}`
            : '확인 완료',
        }
      : domain.status === 'FAILED'
        ? { state: 'failed', caption: '확인 실패 — DNS 레코드를 확인해 주세요' }
        : domain.status === 'VERIFYING'
          ? { state: 'active', caption: '확인 진행 중' }
          : { state: 'active', caption: 'DNS 레코드 대기' }),
  }

  const certificateStep: JourneyStep = {
    title: '인증서 발급',
    ...(certificate?.status === 'ACTIVE'
      ? { state: 'done', caption: '발급 완료' }
      : certificate?.status === 'FAILED'
        ? { state: 'failed', caption: certificate.lastError ?? '발급 실패' }
        : ownership.state === 'done'
          ? { state: 'active', caption: '발급 중' }
          : { state: 'pending', caption: '소유 확인 후 자동 진행' }),
  }

  const routeStep: JourneyStep = {
    title: '라우트 적용',
    ...(route?.status === 'APPLIED'
      ? { state: 'done', caption: '적용됨' }
      : route?.status === 'FAILED'
        ? { state: 'failed', caption: route.lastError ?? '적용 실패' }
        : certificateStep.state === 'done'
          ? { state: 'active', caption: '적용 중' }
          : { state: 'pending', caption: '인증서 발급 후 자동 진행' }),
  }

  return [ownership, certificateStep, routeStep]
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span
        aria-hidden="true"
        className="flex size-5 items-center justify-center rounded-full bg-success-100 text-success-700"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
          <path
            fillRule="evenodd"
            d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    )
  }
  if (state === 'failed') {
    return (
      <span
        aria-hidden="true"
        className="flex size-5 items-center justify-center rounded-full bg-danger-100 text-danger-700"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-5 items-center justify-center rounded-full border-2 bg-white',
        state === 'active' ? 'border-info-500' : 'border-neutral-300',
      )}
    >
      {state === 'active' && <span className="size-2 rounded-full bg-info-500" />}
    </span>
  )
}
