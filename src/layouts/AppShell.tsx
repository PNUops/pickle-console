import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { Logo } from '../components/Logo'
import { NotificationBell } from '../components/NotificationBell'
import { cn } from '../lib/cn'
import { UserMenu } from './UserMenu'

export interface NavItem {
  to: string
  label: string
  end?: boolean
}

/** Shared authenticated shell: left sidebar nav + top bar with user menu. */
export function AppShell({
  home,
  navLabel,
  items,
  banner,
  notificationsTo,
}: {
  home: string
  navLabel: string
  items: NavItem[]
  banner?: ReactNode
  /** 알림함 경로 — 지정하면 상단 바에 알림 종을 노출한다. */
  notificationsTo?: string
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
        <div className="flex h-16 items-center border-b border-neutral-100 px-5">
          <Logo to={home} />
        </div>
        <nav aria-label={navLabel} className="flex-1 space-y-1 p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'block rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary-600',
                  isActive
                    ? 'bg-primary-50 text-primary-800'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 sm:px-6">
          <div className="md:hidden">
            <Logo to={home} />
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2">
            {notificationsTo && <NotificationBell to={notificationsTo} />}
            <UserMenu />
          </div>
        </header>
        {banner}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
