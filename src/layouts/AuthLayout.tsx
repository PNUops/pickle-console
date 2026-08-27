import { TransitionLink } from '../components/TransitionLink'
import type { ReactNode } from 'react'
import {Outlet} from 'react-router'
import { homePathFor, useAuth } from '../auth/auth-context'
import { Logo } from '../components/Logo'
import { NoticeStrip } from '../pages/landing/NoticeStrip'
import { SERVICE_TAGLINE } from '../lib/brand'
import { cn } from '../lib/cn'

/**
 * 인증 화면(로그인/회원가입/메일 인증/비밀번호 재설정) 전용 다크 레이아웃.
 * 랜딩의 다크 비주얼 언어(그리드 패턴+틸 글로우)를 이어받아 랜딩→인증 전환이
 * 자연스럽다. 전역 다크 모드가 아니라 이 레이아웃 스코프(.auth-dark)에서만
 * 폼 컨트롤을 다크화한다(index.css 참조).
 */
export function AuthLayout() {
  const { status, user } = useAuth()

  return (
    <div className="auth-dark relative flex min-h-svh flex-col overflow-hidden break-keep bg-neutral-950">
      {/* 배경: 랜딩 히어로와 같은 문법의 그리드 + 틸 글로우(절제) */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgb(255 255 255 / 0.03) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.03) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 30%, black 30%, transparent 75%)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(560px circle at 50% -10%, rgb(46 139 158 / 0.22), transparent 65%)',
        }}
      />

      <header className="relative z-10">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <Logo tone="inverse" />
          <nav aria-label="주 메뉴" className="flex items-center gap-2">
            {status === 'authenticated' && user ? (
              <TransitionLink
                to={homePathFor(user.role)}
                className="inline-flex h-9 items-center rounded-lg bg-primary-500 px-4 text-sm font-semibold text-white hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
              >
                콘솔로 이동
              </TransitionLink>
            ) : (
              <>
                <TransitionLink
                  to="/login"
                  className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-neutral-300 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
                >
                  로그인
                </TransitionLink>
                <TransitionLink
                  to="/signup"
                  className="inline-flex h-9 items-center rounded-lg bg-primary-500 px-4 text-sm font-semibold text-white hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
                >
                  회원가입
                </TransitionLink>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* 장애 공지가 가장 필요한 자리는 로그인 문 앞이다. */}
      <NoticeStrip />

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Outlet />
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-7xl px-4 py-6 text-sm text-neutral-400 sm:px-6">
        {SERVICE_TAGLINE}
      </footer>
    </div>
  )
}

/** 인증 화면 전용 글래스 카드 — 공용 Card(bg-white 고정) 대신 사용한다. */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-card border border-white/10 bg-white/5 shadow-overlay backdrop-blur-md',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function AuthCardContent({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('p-6', className)}>{children}</div>
}
