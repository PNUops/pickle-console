import { useEffect, useState } from 'react'
import { useAuth } from '../auth/auth-context'
import { POST_LOGIN_OVERLAY_KEY } from '../lib/storage-keys'
import { Logo } from './Logo'

/**
 * 로그인 직후 1회 표시되는 환영 오버레이 — 다크 인증 화면에서 라이트 콘솔로
 * 넘어올 때의 급격한 톤 전환을 부드럽게 잇는다. 잠깐 유지 후 페이드아웃하며,
 * 장식이므로 포인터·접근성 트리에서 제외한다(reduced-motion이면 표시하지 않음).
 */
export function PostLoginOverlay() {
  const { user } = useAuth()
  // 초기화 함수는 순수하게 판정만 한다 — StrictMode는 초기화를 2회 호출하므로
  // 여기서 removeItem(부수효과)을 하면 dev에서 오버레이가 절대 뜨지 않는다.
  const [visible, setVisible] = useState(() => {
    if (sessionStorage.getItem(POST_LOGIN_OVERLAY_KEY) == null) return false
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  // 플래그 소거는 mount 이후(부수효과 자리)에서 수행한다.
  useEffect(() => {
    sessionStorage.removeItem(POST_LOGIN_OVERLAY_KEY)
  }, [])

  // animationend가 오지 않는 환경(jsdom 등) 대비 타이머 폴백.
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => setVisible(false), 1200)
    return () => clearTimeout(timer)
  }, [visible])

  if (!visible) return null

  return (
    <div
      aria-hidden="true"
      onAnimationEnd={() => setVisible(false)}
      className="post-login-overlay pointer-events-none fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-neutral-950"
    >
      <Logo tone="inverse" className="pointer-events-none" />
      <p className="text-lg font-semibold text-white">
        환영합니다{user ? `, ${user.name}님` : ''}
      </p>
    </div>
  )
}
