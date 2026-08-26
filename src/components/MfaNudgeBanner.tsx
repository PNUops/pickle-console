import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/auth-context'
import { isOrgTier } from '../auth/permissions'
import { MFA_NUDGE_DISMISS_KEY } from '../lib/storage-keys'

/**
 * 기관 계층 2FA 권유 배너 — 관리자 셸 상단에 서서 계정 설정(/admin/account)으로
 * 보낸다. 시스템 계층은 로그인 필터가 2FA를 강제하므로 배너의 대상이 아니고,
 * 기관 계층에는 강제 대신 권유만 한다. 그래서 닫을 수 있어야 하며, 닫음은 세션
 * 동안 유지되고 로그아웃 시 지워진다 (AppShell 공지 배너와 같은 방식).
 */
export function MfaNudgeBanner() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(
    () =>
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem(MFA_NUDGE_DISMISS_KEY) != null,
  )

  if (!user || !isOrgTier(user.role) || user.mfaEnabled || dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    sessionStorage.setItem(MFA_NUDGE_DISMISS_KEY, '1')
  }

  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-info-200 bg-info-50 px-4 py-2 text-sm text-info-800 sm:px-6"
    >
      <span className="min-w-0 flex-1">
        관리자 계정에는 2단계 인증(2FA) 등록을 권장합니다.{' '}
        <Link to="/admin/account" className="font-medium underline hover:text-info-900">
          계정 설정에서 등록하기
        </Link>
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="2단계 인증 권유 닫기"
        className="shrink-0 cursor-pointer rounded p-0.5 text-info-600 hover:text-info-800 focus-visible:outline-2 focus-visible:outline-primary-600"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  )
}
