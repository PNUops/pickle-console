import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { onMaintenanceDetected } from '../api/maintenance'
import { isMfaEnrollmentRequired, onMfaEnrollmentRequired } from '../api/mfa-enrollment'
import { fetchSystemStatus } from '../api/queries'
import { useAuth } from '../auth/auth-context'
import { ContactEmail } from '../components/ContactEmail'
import { Logo } from '../components/Logo'
import { navIcons } from '../components/nav-icons'
import { MaintenanceScreen } from '../components/MaintenanceScreen'
import { NotificationBell } from '../components/NotificationBell'
import { Badge } from '../components/ui'
import { PostLoginOverlay } from '../components/PostLoginOverlay'
import { CONTACT_URL, DOCS_PATH, FEEDBACK_URL } from '../lib/brand'
import { cn } from '../lib/cn'
import { useFocusTrap } from '../lib/use-focus-trap'
import { UserMenu } from './UserMenu'

/**
 * 2FA 등록 화면의 경로. 관리자 셸 안에 있고, 서버의 2FA 강제 필터가 면제하는
 * `/me`와 `/me/mfa/**`만으로 동작하므로 강제가 켜진 상태에서도 열린다.
 */
const MFA_ENROLL_PATH = '/admin/account'

/** 공지 배너를 세션 동안 닫아둔 상태로 기억하는 sessionStorage 키. */
const BANNER_DISMISS_KEY = 'pickle_banner_dismissed'

export interface NavItem {
  /** 갈 곳. 준비 중 항목은 아직 화면이 없으므로 비운다. */
  to?: string
  label: string
  end?: boolean
  /** 항목 앞 스트로크 아이콘(선택) — src/components/nav-icons.tsx 참조. */
  icon?: ReactNode
  /**
   * 자리만 잡아 둔 항목 — 링크가 아니라 '준비 중' 배지를 단 회색 글자로 그린다.
   * 지금 되는 것만 세우면 이 플랫폼이 무엇을 주는 곳인지 사이드바에서 읽히지
   * 않아, 예정된 종류도 같은 목록에 세우되 누를 수 없다는 사실을 배지로 말한다.
   */
  disabled?: boolean
  /**
   * 라벨 오른쪽 배지 — 항목의 상태를 한 단어로 말한다(`Beta` 등). 준비 중 항목은
   * 적지 않아도 '준비 중'이 붙는다.
   */
  badge?: string
}

/** 사이드바 내비게이션 섹션 — 소제목(선택) 아래 항목 묶음. */
export interface NavSection {
  heading?: string
  items: NavItem[]
}

/**
 * 항목 오른쪽 배지가 놓이는 자리 — 폭을 고정하고 그 안에서 배지를 가운데 둔다.
 * '준비 중'과 'Beta'는 글자 수가 달라서, 오른쪽 끝만 맞추면 배지들이 한 열로
 * 읽히지 않는다. 폭을 갖는 것은 자리이고 배지는 제 크기 그대로다 — 배지 자체를
 * 늘리면 글자 옆 여백만 넓어진다.
 */
const NAV_BADGE_SLOT = 'ml-auto flex w-[4.5rem] justify-center'

const NAV_LINK_BASE =
  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary-600'

const FOOTER_LINK_IDLE = 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'

const externalMark = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="ml-auto size-3.5 shrink-0 text-neutral-400"
    aria-label="새 탭에서 열림"
    role="img"
  >
    <path d="M14 4h6v6" />
    <path d="M20 4 10 14" />
    <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  </svg>
)

/** 사이드바 하단 고정 링크 — 가이드·문의·의견. */
function ShellFooterNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="space-y-1 border-t border-neutral-100 p-3">
      <NavLink
        to={DOCS_PATH}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(NAV_LINK_BASE, isActive ? 'bg-primary-50 text-primary-800' : FOOTER_LINK_IDLE)
        }
      >
        {navIcons.book}
        사용 가이드
      </NavLink>
      <a
        href={CONTACT_URL}
        target="_blank"
        rel="noreferrer"
        className={cn(NAV_LINK_BASE, FOOTER_LINK_IDLE)}
      >
        {navIcons.chat}
        1:1 문의하기
        {externalMark}
      </a>
      <a
        href={FEEDBACK_URL}
        target="_blank"
        rel="noreferrer"
        className={cn(NAV_LINK_BASE, FOOTER_LINK_IDLE)}
      >
        {navIcons.megaphone}
        개선 의견 남기기
        {externalMark}
      </a>
    </div>
  )
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
          {section.items.map((item) =>
            item.disabled || item.to == null ? (
              <span
                key={item.label}
                aria-disabled="true"
                className={cn(NAV_LINK_BASE, 'cursor-not-allowed text-neutral-400')}
              >
                {item.icon}
                {item.label}
                <span className={NAV_BADGE_SLOT}>
                  <Badge variant="neutral">{item.badge ?? '준비 중'}</Badge>
                </span>
              </span>
            ) : (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    NAV_LINK_BASE,
                    isActive
                      ? 'bg-primary-50 text-primary-800'
                      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                  )
                }
              >
                {item.icon}
                {item.label}
                {item.badge && (
                  <span className={NAV_BADGE_SLOT}>
                    <Badge variant="info">{item.badge}</Badge>
                  </span>
                )}
              </NavLink>
            ),
          )}
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
  sidebarTop,
  notificationsTo,
  banner,
}: {
  home: string
  navLabel: string
  /** 평면 내비게이션 (sections 미지정 시 사용). */
  items?: NavItem[]
  /** 섹션 내비게이션 — 지정하면 items보다 우선한다. */
  sections?: NavSection[]
  /** 내비게이션 위에 놓이는 요소 (워크스페이스 선택기 등). */
  sidebarTop?: ReactNode
  /** 알림함 경로 — 지정하면 상단 바에 알림 종을 노출한다. */
  notificationsTo?: string
  /** 시스템 공지 배너 아래, 본문 위에 놓이는 셸 배너 (2FA 권유 등). */
  banner?: ReactNode
}) {
  const navSections: NavSection[] = sections ?? [{ items: items ?? [] }]
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerId = useId()
  const drawerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(drawerRef, { active: drawerOpen, onEscape: () => setDrawerOpen(false) })

  // 점검 모드·공지 배너·문의처: 공개 상태를 ~60초 폴링한다. 관리자 계층(USER
  // 외 전 역할 — 매니저 역할 포함)은 점검 중에도 콘솔을 계속 쓸 수 있고,
  // 비관리자는 전체 화면 점검 안내로 차단한다. 상태 조회 실패 시엔 셸을 막지
  // 않는다(fail-open) — 상태 API 장애가 로그인 사용자를 잠그면 안 된다.
  const { user } = useAuth()
  const isAdminTier = !!user && user.role !== 'USER'
  const queryClient = useQueryClient()
  const statusQuery = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  const status = statusQuery.data
  const maintenance = status?.maintenance ?? false
  const bannerMessage = status?.bannerMessage ?? null
  const contactEmail = status?.contactEmail ?? null

  // 요청 중 마주친 503 MAINTENANCE_MODE를 폴링과 별개로 즉시 반영한다.
  useEffect(
    () =>
      onMaintenanceDetected(() => {
        void queryClient.invalidateQueries({ queryKey: ['system-status'] })
      }),
    [queryClient],
  )

  // 관리자 2FA 강제가 켜져 있고 아직 등록하지 않은 시스템 계층 계정은, 서버가
  // 면제한 몇 개(/me, /me/mfa/**, /auth/**, /meta/**) 밖의 모든 요청에서 403
  // MFA_ENROLLMENT_REQUIRED를 받는다. 로그인이 막힌 것이 아니라 범위가 좁혀진
  // 것이고, 등록 화면은 그 면제 안에 있어 언제나 열려 있다. 없는 것은 거기로
  // 가라는 안내뿐이라, 화면마다 오류 상자를 띄우는 대신 여기서 한 번 받아
  // 등록 화면으로 데려다 놓는다.
  //
  // 이 신호는 계정이 등록을 마칠 때까지 계속 온다 — 알림 개수처럼 주기적으로
  // 도는 조회가 매번 같은 403을 받기 때문이다. 그래서 이미 그 화면에 있으면
  // 아무것도 하지 않는다. 이 검사가 없으면 등록 화면 위에서 같은 곳으로
  // 이동하는 내비게이션이 폴링 주기마다 반복된다.
  //
  // 현재 위치는 라우터에게 묻는다. `window.location` 은 이 앱에서 두 번 틀린다 —
  // 테스트가 MemoryRouter 로 돌아 주소창이 움직이지 않고, 실제로도 라우터가
  // 옮긴 위치가 반영되기 전 시점이 있다. 둘 다 가드가 조용히 열려 반복 이동이
  // 되살아나는 방향으로 틀린다.
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const atEnrollScreen = pathname === MFA_ENROLL_PATH
  useEffect(() => {
    const goEnroll = () => {
      if (atEnrollScreen) return
      void navigate(`${MFA_ENROLL_PATH}?enroll=2fa`, { replace: true })
    }
    // 이미 걸린 뒤에 이 셸이 붙었을 수 있다 — 첫 요청이 구독보다 먼저 답하는
    // 창이 있고, 거기서 신호만 기다리면 그 한 번을 통째로 놓친다. 걸려 있으면
    // 지금 옮기고, 이후 것은 구독이 받는다.
    if (isMfaEnrollmentRequired()) goEnroll()
    return onMfaEnrollmentRequired(goEnroll)
  }, [navigate, atEnrollScreen])

  const [dismissedBanner, setDismissedBanner] = useState<string | null>(() =>
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(BANNER_DISMISS_KEY) : null,
  )
  const showBanner = !maintenance && !!bannerMessage && dismissedBanner !== bannerMessage
  const dismissBanner = () => {
    setDismissedBanner(bannerMessage)
    if (bannerMessage) sessionStorage.setItem(BANNER_DISMISS_KEY, bannerMessage)
  }

  // NavLink onClick이 기본 닫힘 경로지만, UserMenu 등 다른 경로 이동도 덮는 안전망.
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

  // 비관리자는 점검 중 콘솔 전체를 차단한다(점검 해제 시 폴링이 자동 복구).
  if (maintenance && !isAdminTier) {
    return (
      <MaintenanceScreen message={status?.maintenanceMessage} contactEmail={contactEmail} />
    )
  }

  const bannerEl =
    maintenance && isAdminTier ? (
      <div
        role="status"
        className="border-b border-warning-200 bg-warning-50 px-4 py-2 text-center text-sm font-medium text-warning-800 sm:px-6"
      >
        점검 모드가 켜져 있습니다. 비관리자 사용자는 콘솔을 이용할 수 없습니다.
      </div>
    ) : showBanner ? (
      <div
        role="status"
        className="flex items-start gap-3 border-b border-info-200 bg-info-50 px-4 py-2 text-sm text-info-800 sm:px-6"
      >
        <span className="min-w-0 flex-1 whitespace-pre-line">{bannerMessage}</span>
        <button
          type="button"
          onClick={dismissBanner}
          aria-label="공지 닫기"
          className="shrink-0 cursor-pointer rounded p-0.5 text-info-600 hover:text-info-800 focus-visible:outline-2 focus-visible:outline-primary-600"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    ) : null

  return (
    <div className="flex min-h-screen">
      <PostLoginOverlay />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
        <div className="flex h-16 items-center border-b border-neutral-100 px-5">
          <Logo to={home} />
        </div>
        {sidebarTop && <div className="border-b border-neutral-100 p-3">{sidebarTop}</div>}
        <ShellNav navLabel={navLabel} navSections={navSections} />
        <ShellFooterNav />
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
            {sidebarTop && <div className="border-b border-neutral-100 p-3">{sidebarTop}</div>}
            <ShellNav
              navLabel={navLabel}
              navSections={navSections}
              onNavigate={() => setDrawerOpen(false)}
            />
            <ShellFooterNav onNavigate={() => setDrawerOpen(false)} />
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
        {bannerEl}
        {banner}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
        {contactEmail && (
          <footer className="border-t border-neutral-100 px-4 py-3 text-center text-xs text-neutral-400 sm:px-6">
            문의: <ContactEmail email={contactEmail} className="text-neutral-500" />
          </footer>
        )}
      </div>
    </div>
  )
}
