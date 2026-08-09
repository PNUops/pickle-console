import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router'
import { RequireRole } from './auth/RequireRole'
import { Spinner } from './components/ui'
import { AdminLayout } from './layouts/AdminLayout'
import { ConsoleLayout } from './layouts/ConsoleLayout'
import { AuthLayout } from './layouts/AuthLayout'
import { PublicLayout } from './layouts/PublicLayout'
import { AdminAnnouncementsPage } from './pages/AdminAnnouncementsPage'
import { AdminAuditPage } from './pages/AdminAuditPage'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import { AdminDomainsPage } from './pages/AdminDomainsPage'
import { AdminDriftPage } from './pages/AdminDriftPage'
import { AdminExpiryPage } from './pages/AdminExpiryPage'
import { AdminNetworkPage } from './pages/AdminNetworkPage'
import { AdminNodesPage } from './pages/AdminNodesPage'
import { AdminNotificationLogPage } from './pages/AdminNotificationLogPage'
import { AdminOrgsPage } from './pages/AdminOrgsPage'
import { AdminSettingsPage } from './pages/AdminSettingsPage'
import { AdminTasksPage } from './pages/AdminTasksPage'
import { AdminTerminalSessionsPage } from './pages/AdminTerminalSessionsPage'
import { AdminRequestDetailPage } from './pages/AdminRequestDetailPage'
import { AdminRequestsPage } from './pages/AdminRequestsPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { AdminWorkspacesPage } from './pages/AdminWorkspacesPage'
import { AdminOsImagesPage } from './pages/AdminOsImagesPage'
import { AdminVmDetailPage } from './pages/AdminVmDetailPage'
import { AdminVmsPage } from './pages/AdminVmsPage'
import { AccountPage } from './pages/AccountPage'
import { ConsoleDashboardPage } from './pages/ConsoleDashboardPage'
import { DocsPage } from './pages/DocsPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { WorkspaceDetailPage } from './pages/WorkspaceDetailPage'
import { WorkspacesPage } from './pages/WorkspacesPage'
import { LoginPage } from './pages/LoginPage'
import { MyActivityPage } from './pages/MyActivityPage'
import { NewRequestPage } from './pages/NewRequestPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { RequestDetailPage } from './pages/RequestDetailPage'
import { RequestsPage } from './pages/RequestsPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { SignupPage } from './pages/SignupPage'
import { SshKeysPage } from './pages/SshKeysPage'
import { TermsPage } from './pages/TermsPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'
import { VmAccessPage } from './pages/VmAccessPage'
import { VmDetailPage } from './pages/VmDetailPage'
import { VmsPage } from './pages/VmsPage'

// 웹 터미널은 xterm.js(~250kB)를 끌어오므로, 터미널을 여는 사용자에게만
// 로드되도록 코드 분할한다(메인 번들 경량 유지).
const TerminalPage = lazy(() =>
  import('./pages/TerminalPage').then((m) => ({ default: m.TerminalPage })),
)

// 랜딩은 motion(+lazy 3D)을 끌어오므로 통째로 코드 분할한다 — 콘솔만 쓰는
// 사용자의 진입 번들을 키우지 않는다. 폴백은 히어로와 같은 다크 배경(플래시 방지).
const LandingPage = lazy(() =>
  import('./pages/landing/LandingPage').then((m) => ({ default: m.LandingPage })),
)

// SPA 내비게이션은 스크롤을 리셋하지 않는다 — 긴 랜딩 하단에서 회원가입/로그인으로
// 이동하면 이전 오프셋이 남으므로 경로 변경 시 최상단으로 복귀시킨다.
// (랜딩이 html에 scroll-smooth를 붙이므로 instant를 명시해 스르륵 효과를 배제.)
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      {/* 랜딩은 자체 다크 헤더/푸터를 가진 full-bleed 페이지 — PublicLayout 밖에서 렌더. */}
      <Route
        index
        element={
          <Suspense fallback={<div className="min-h-svh bg-neutral-950" />}>
            <LandingPage />
          </Suspense>
        }
      />
      {/* 인증 화면은 랜딩과 톤을 잇는 다크 레이아웃 — 약관/404는 라이트 유지. */}
      <Route element={<AuthLayout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
      </Route>
      <Route element={<PublicLayout />}>
        <Route path="terms/:docType" element={<TermsPage />} />
        {/* 사용자 문서 — 본문은 준비 중이고, 사이드바 링크가 가리킬 경로만 먼저 둔다. */}
        <Route path="docs" element={<DocsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route
        path="console"
        element={
          <RequireRole roles={['USER']}>
            <ConsoleLayout />
          </RequireRole>
        }
      >
        <Route index element={<ConsoleDashboardPage />} />
        <Route path="workspaces" element={<WorkspacesPage />} />
        <Route path="workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="requests/new" element={<NewRequestPage />} />
        <Route path="requests/:requestId" element={<RequestDetailPage />} />
        <Route path="vms" element={<VmsPage />} />
        <Route path="vms/:vmId" element={<VmDetailPage />} />
        {/* 상세와 별개 라우트 — 상세가 막힌 사람도 접근 권한은 관리할 수 있다. */}
        <Route path="vms/:vmId/access" element={<VmAccessPage />} />
        <Route
          path="vms/:vmId/terminal"
          element={
            <Suspense
              fallback={
                <div className="flex justify-center py-12">
                  <Spinner label="터미널 불러오는 중" />
                </div>
              }
            >
              <TerminalPage />
            </Suspense>
          }
        />
        <Route path="ssh-keys" element={<SshKeysPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="activity" element={<MyActivityPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route
        path="admin"
        element={
          <RequireRole roles={['ORG_MANAGER', 'ORG_ADMIN', 'SYS_MANAGER', 'SYS_ADMIN']}>
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="requests" element={<AdminRequestsPage />} />
        <Route path="requests/:requestId" element={<AdminRequestDetailPage />} />
        <Route path="vms" element={<AdminVmsPage />} />
        <Route path="vms/:vmId" element={<AdminVmDetailPage />} />
        <Route path="terminal-sessions" element={<AdminTerminalSessionsPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="workspaces" element={<AdminWorkspacesPage />} />
        <Route path="expiry" element={<AdminExpiryPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="audit" element={<AdminAuditPage />} />
        <Route path="announcements" element={<AdminAnnouncementsPage />} />
        <Route path="domains" element={<AdminDomainsPage />} />
        <Route
          path="notification-log"
          element={
            <RequireRole roles={['SYS_MANAGER', 'SYS_ADMIN']}>
              <AdminNotificationLogPage />
            </RequireRole>
          }
        />
        <Route
          path="drift"
          element={
            <RequireRole roles={['SYS_MANAGER', 'SYS_ADMIN']}>
              <AdminDriftPage />
            </RequireRole>
          }
        />
        <Route
          path="settings"
          element={
            <RequireRole roles={['SYS_MANAGER', 'SYS_ADMIN']}>
              <AdminSettingsPage />
            </RequireRole>
          }
        />
        <Route
          path="tasks"
          element={
            <RequireRole roles={['SYS_MANAGER', 'SYS_ADMIN']}>
              <AdminTasksPage />
            </RequireRole>
          }
        />
        <Route
          path="nodes"
          element={
            <RequireRole roles={['SYS_MANAGER', 'SYS_ADMIN']}>
              <AdminNodesPage />
            </RequireRole>
          }
        />
        <Route
          path="network"
          element={
            <RequireRole roles={['SYS_MANAGER', 'SYS_ADMIN']}>
              <AdminNetworkPage />
            </RequireRole>
          }
        />
        <Route
          path="os-images"
          element={
            <RequireRole roles={['SYS_MANAGER', 'SYS_ADMIN']}>
              <AdminOsImagesPage />
            </RequireRole>
          }
        />
        <Route
          path="orgs"
          element={
            <RequireRole roles={['SYS_ADMIN']}>
              <AdminOrgsPage />
            </RequireRole>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </>
  )
}

export default App
