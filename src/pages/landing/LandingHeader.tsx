import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { homePathFor, useAuth } from '../../auth/auth-context'
import { Logo } from '../../components/Logo'
import { cn } from '../../lib/cn'

const navItems = [
  { href: '#how-it-works', label: '이용 절차' },
  { href: '#access', label: '접속 방식' },
  { href: '#features', label: '주요 기능' },
]

/**
 * 랜딩 전용 헤더. 다크 히어로 위에서는 투명하게 떠 있다가, 스크롤이 시작되면
 * 다크 글래스 바로 바뀐다(라이트 본문 위에서도 다크 톤을 유지해 일관성 확보).
 */
export function LandingHeader() {
  const { status, user } = useAuth()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-colors duration-300',
        scrolled
          ? 'border-b border-white/10 bg-neutral-950/80 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Logo tone="inverse" />
        <nav aria-label="랜딩 섹션" className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <nav aria-label="주 메뉴" className="flex items-center gap-2">
          {status === 'loading' ? (
            // 세션 복원 중 — 로그인/회원가입이 잠깐 보였다 바뀌는 깜빡임 방지
            <div aria-hidden="true" className="h-9" />
          ) : status === 'authenticated' && user ? (
            <Link
              to={homePathFor(user.role)}
              className="inline-flex h-9 items-center rounded-lg bg-primary-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
            >
              콘솔로 이동
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-neutral-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
              >
                로그인
              </Link>
              <Link
                to="/signup"
                className="inline-flex h-9 items-center rounded-lg bg-primary-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
              >
                회원가입
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
