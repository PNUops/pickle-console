import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { Logo } from '../components/Logo'
import { NotificationBell } from '../components/NotificationBell'
import { cn } from '../lib/cn'
import { useFocusTrap } from '../lib/use-focus-trap'
import { UserMenu } from './UserMenu'

export interface NavItem {
  to: string
  label: string
  end?: boolean
}

/** 사이드바 내비게이션 섹션 — 소제목(선택) 아래 항목 묶음. */
export interface NavSection {
  heading?: string
  items: NavItem[]
}

/** 사이드바·모바일 드로어가 공유하는 내비게이션 본문. */
function ShellNav({
  navLabel,
  navSections,
  onNavigate,
}: {
  navLabel: string
  navSections: NavSection[]
  onNavigate?: () => void
}) {
  return (
    <nav aria-label={navLabel} className="flex-1 space-y-3 overflow-y-auto p-3">
      {navSections.map((section, index) => (
        <div key={section.heading ?? index} className="space-y-1">
          {section.heading && (
            <h3 className="px-3 pt-2 pb-0.5 text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">
              {section.heading}
            </h3>
          )}
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
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
        </div>
      ))}
    </nav>
  )
}

/** Shared authenticated shell: left sidebar nav + top bar with user menu. */
export function AppShell({
  home,
  navLabel,
  items,
  sections,
  banner,
  notificationsTo,
}: {
  home: string
  navLabel: string
  /** 평면 내비게이션 (sections 미지정 시 사용). */
  items?: NavItem[]
  /** 섹션 내비게이션 — 지정하면 items보다 우선한다. */
  sections?: NavSection[]
  banner?: ReactNode
  /** 알림함 경로 — 지정하면 상단 바에 알림 종을 노출한다. */
  notificationsTo?: string
}) {
  const navSections: NavSection[] = sections ?? [{ items: items ?? [] }]
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerId = useId()
  const drawerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(drawerRef, { active: drawerOpen, onEscape: () => setDrawerOpen(false) })

  // NavLink onClick이 기본 닫힘 경로지만, UserMenu 등 다른 경로 이동도 덮는 안전망.
  const { pathname } = useLocation()
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // md 이상으로 커지면 드로어는 CSS로만 숨겨지므로(md:hidden) 상태도 함께 닫는다 —
  // 안 닫으면 보이지 않는 드로어에 스크롤 락과 Tab 포커스 트랩이 남는다.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)')
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setDrawerOpen(false)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
        <div className="flex h-16 items-center border-b border-neutral-100 px-5">
          <Logo to={home} />
        </div>
        <ShellNav navLabel={navLabel} navSections={navSections} />
      </aside>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-neutral-950/50"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            ref={drawerRef}
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label={navLabel}
            tabIndex={-1}
            className="absolute inset-y-0 left-0 flex w-60 flex-col bg-white shadow-overlay outline-none"
          >
            <div className="flex h-16 items-center justify-between border-b border-neutral-100 px-5">
              <Logo to={home} />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="메뉴 닫기"
                className="cursor-pointer rounded p-1 text-neutral-400 hover:text-neutral-600 focus-visible:outline-2 focus-visible:outline-primary-600"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            <ShellNav
              navLabel={navLabel}
              navSections={navSections}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="메뉴 열기"
              aria-expanded={drawerOpen}
              /* 드로어는 열려 있을 때만 마운트 — 닫힌 상태에서 없는 id를 참조하지 않는다 */
              aria-controls={drawerOpen ? drawerId : undefined}
              className="cursor-pointer rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-2 focus-visible:outline-primary-600"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
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
