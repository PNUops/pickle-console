import { Link, Outlet, useLocation } from 'react-router'
import { Logo } from '../components/Logo'
import { SERVICE_TAGLINE } from '../lib/brand'
import { homePathFor, useAuth } from '../auth/auth-context'
import { guidePathFor, parseGuidePath } from '../lib/docs-paths'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Drawer, ErrorBoundary } from '../components/ui'
import { cn } from '../lib/cn'

const GuideNavigation = lazy(() => import('../docs/GuideNavigation').then((module) => ({ default: module.GuideNavigation })))

export function PublicLayout() {
  const { status, user } = useAuth()
  const location = useLocation()
  const guide = parseGuidePath(location.pathname)
  const consoleTo = user ? homePathFor(user.role) : '/console'
  const destination = guide ? guidePathFor({ pathname: consoleTo }, guide.slug) + location.hash : consoleTo
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const resized = (event: MediaQueryListEvent) => { if (event.matches) closeMenu() }
    media.addEventListener('change', resized)
    return () => media.removeEventListener('change', resized)
  }, [closeMenu])

  return (
    <div className="flex min-h-screen flex-col">
      <header className={cn('border-b border-neutral-200 bg-white', guide && 'sticky top-0 z-40')}>
        <div className={cn('mx-auto flex w-full items-center justify-between gap-2 px-4 sm:px-6', guide ? 'h-14' : 'h-16 max-w-6xl')}>
          <div className="flex min-w-0 items-center gap-2">
            {guide && <button type="button" aria-label="메뉴 열기" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}
              className="rounded-control p-1 text-neutral-600 focus-visible:outline-2 focus-visible:outline-primary-600 md:hidden">
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden="true"><path d="M2 4h16v1.5H2zm0 5h16v1.5H2zm0 5h16v1.5H2z" /></svg>
            </button>}
            <Logo variant="brand" />
          </div>
          <nav aria-label="주 메뉴" className="flex items-center gap-2">
            {status === 'authenticated' && user ? (
              <Link
                to={destination}
                className="inline-flex h-9 items-center rounded-lg bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                {guide ? '콘솔에서 읽기' : '콘솔로 이동'}
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  state={guide ? { from: location.pathname + location.hash } : undefined}
                  className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                >
                  로그인
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex h-9 items-center rounded-lg bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                >
                  회원가입
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      {guide ? (
        <div className="flex min-w-0 flex-1">
          <aside className="sticky top-14 hidden h-[calc(100svh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-3 md:block">
            <ErrorBoundary label="문서 목차"><Suspense fallback={<p className="text-sm">문서 목차 불러오는 중</p>}><GuideNavigation slug={guide.slug} /></Suspense></ErrorBoundary>
          </aside>
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6"><Outlet /></main>
          <Drawer open={menuOpen} onClose={closeMenu} title="문서 목차" className="sm:max-w-sm">
            <ErrorBoundary label="문서 목차"><Suspense fallback={<p className="text-sm">문서 목차 불러오는 중</p>}><GuideNavigation slug={guide.slug} onNavigate={closeMenu} /></Suspense></ErrorBoundary>
          </Drawer>
        </div>
      ) : <main className="flex-1"><Outlet /></main>}
      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-neutral-500 sm:px-6">
          {SERVICE_TAGLINE}
        </div>
      </footer>
    </div>
  )
}
