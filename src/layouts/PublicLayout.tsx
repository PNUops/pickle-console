import { Link, Outlet } from 'react-router'
import { Logo } from '../components/Logo'
import { SERVICE_TAGLINE } from '../lib/brand'
import { homePathFor, useAuth } from '../auth/auth-context'

export function PublicLayout() {
  const { status, user } = useAuth()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo variant="brand" />
          <nav aria-label="주 메뉴" className="flex items-center gap-2">
            {status === 'authenticated' && user ? (
              <Link
                to={homePathFor(user.role)}
                className="inline-flex h-9 items-center rounded-lg bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                콘솔로 이동
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
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
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-neutral-500 sm:px-6">
          {SERVICE_TAGLINE}
        </div>
      </footer>
    </div>
  )
}
