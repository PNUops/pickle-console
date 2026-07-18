import { useAuth } from '../auth/auth-context'
import { Logo } from './Logo'
import { ContactEmail } from './ContactEmail'

const DEFAULT_MESSAGE = '서비스 점검 중입니다. 잠시 후 다시 이용해 주세요.'

/**
 * 점검 모드 전체 화면 — 비관리자 사용자의 콘솔 사용을 차단한다. 점검이 해제되면
 * 셸의 상태 폴링이 갱신되어 자동으로 원래 화면으로 돌아온다.
 */
export function MaintenanceScreen({
  message,
  contactEmail,
}: {
  message: string | null | undefined
  contactEmail: string | null | undefined
}) {
  const { logout } = useAuth()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo to="/" />
      <div className="flex flex-col items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-full bg-warning-50 text-warning-600"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="size-6">
            <path
              fillRule="evenodd"
              d="M11.484 2.17a1.75 1.75 0 0 1 3.032 0l9 15.5A1.75 1.75 0 0 1 22 20.25H2a1.75 1.75 0 0 1-1.516-2.58l9-15.5ZM13 8.75a1 1 0 1 0-2 0v3.5a1 1 0 1 0 2 0v-3.5ZM12 15a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <h1 className="text-xl font-semibold text-neutral-900">서비스 점검 중</h1>
        <p className="max-w-md text-sm whitespace-pre-line text-neutral-600">
          {message?.trim() ? message : DEFAULT_MESSAGE}
        </p>
      </div>
      {contactEmail && (
        <p className="text-sm text-neutral-500">
          문의: <ContactEmail email={contactEmail} />
        </p>
      )}
      <button
        type="button"
        onClick={() => void logout()}
        className="text-sm font-medium text-neutral-500 hover:text-neutral-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      >
        로그아웃
      </button>
    </div>
  )
}
