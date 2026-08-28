import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router'
import { RequireRole } from './auth/RequireRole'
import { ErrorBoundary } from './components/ui'
import { AdminLayout } from './layouts/AdminLayout'
import { ResourcesPage } from './pages/ResourcesPage'
import { ScopeProvider } from './lib/scope'
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
import { AdminNoticesPage } from './pages/AdminNoticesPage'
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
import { LlmKeyAccessPage } from './pages/LlmKeyAccessPage'
import { LlmKeyDetailPage } from './pages/LlmKeyDetailPage'
import { LlmKeysPage } from './pages/LlmKeysPage'
import { WorkspaceDetailPage } from './pages/WorkspaceDetailPage'
import { WorkspacesPage } from './pages/WorkspacesPage'
import { LoginPage } from './pages/LoginPage'
import { MyActivityPage } from './pages/MyActivityPage'
import { NewRequestPage } from './pages/NewRequestPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { NoticeDetailPage } from './pages/NoticeDetailPage'
import { NoticesPage } from './pages/NoticesPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { RequestDetailPage } from './pages/RequestDetailPage'
import { RequestsPage } from './pages/RequestsPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { GoogleCallbackPage } from './pages/GoogleCallbackPage'
import { GoogleOnboardingPage } from './pages/GoogleOnboardingPage'
import { SignupPage } from './pages/SignupPage'
import { TermsPage } from './pages/TermsPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'
import { VmAccessPage } from './pages/VmAccessPage'
import { VmDetailPage } from './pages/VmDetailPage'
import { VmsPage } from './pages/VmsPage'

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
          // 청크 로드가 실패하면(배포 직후 낡은 탭) 첫 화면이 통째로 빈 페이지가
          // 된다 — 경계를 두어 안내와 새로고침 길을 남긴다.
          <ErrorBoundary label="소개">
            <Suspense fallback={<div className="min-h-svh bg-neutral-950" />}>
              <LandingPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      {/* 인증 화면은 랜딩과 톤을 잇는 다크 레이아웃 — 약관/404는 라이트 유지. */}
      <Route element={<AuthLayout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        {/* 구글이 돌아오는 자리. 등록한 redirect_uri 와 바이트 단위로 같아야 한다. */}
        <Route path="auth/google/callback" element={<GoogleCallbackPage />} />
        <Route path="google-onboarding" element={<GoogleOnboardingPage />} />
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
            <ScopeProvider>
              <ConsoleLayout />
            </ScopeProvider>
          </RequireRole>
        }
      >
        <Route index element={<ConsoleDashboardPage />} />
        <Route path="workspaces" element={<WorkspacesPage />} />
        <Route path="workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
        <Route path="resources" element={<ResourcesPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="requests/new" element={<NewRequestPage />} />
        <Route path="requests/:requestId" element={<RequestDetailPage />} />
        <Route path="vms" element={<VmsPage />} />
        <Route path="vms/:vmId" element={<VmDetailPage />} />
        {/* 상세와 별개 라우트 — 상세가 막힌 사람도 접근 권한은 관리할 수 있다. */}
        <Route path="vms/:vmId/access" element={<VmAccessPage />} />
        <Route path="llm-keys" element={<LlmKeysPage />} />
        <Route path="llm-keys/:keyId" element={<LlmKeyDetailPage />} />
        {/* 상세와 별개 라우트 — 상세가 막힌 사람도 접근 권한은 관리할 수 있다. */}
        <Route path="llm-keys/:keyId/access" element={<LlmKeyAccessPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="activity" element={<MyActivityPage />} />
        {/* 공지는 주소째로 공유되므로 라우트여야 한다. 그렇다고 콘솔 밖일 이유는
            없다 — 로그인한 사람이 읽는 자리이므로 콘솔 껍데기 안에 둔다.
            워크스페이스와 무관하므로 범위 붙은 짝은 만들지 않는다. */}
        <Route path="notices" element={<NoticesPage />} />
        <Route path="notices/:noticeId" element={<NoticeDetailPage />} />
        {/* Workspace-scoped views of the same lists. Declared after the fixed
            paths above so `/console/vms` is never read as a workspace id. */}
        <Route path=":workspaceId" element={<ConsoleDashboardPage />} />
        <Route path=":workspaceId/resources" element={<ResourcesPage />} />
        <Route path=":workspaceId/vms" element={<VmsPage />} />
        <Route path=":workspaceId/llm-keys" element={<LlmKeysPage />} />
        <Route path=":workspaceId/requests" element={<RequestsPage />} />
        <Route path=":workspaceId/requests/new" element={<NewRequestPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route
        path="admin"
        element={
          <RequireRole
            roles={[
              'ORG_VIEWER',
              'ORG_MANAGER',
              'ORG_ADMIN',
              'SYS_VIEWER',
              'SYS_MANAGER',
              'SYS_ADMIN',
            ]}
          >
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
        {/* 계정 설정은 사용자 콘솔과 같은 화면을 관리자 셸 안에서 띄운다 — 관리자는
            /console 에 닿지 못하므로(위 라우트가 USER 전용) 2FA 등록 등 계정 관리가
            여기로만 열린다. 부모 라우트가 이미 관리자 역할로 게이트한다. */}
        <Route path="account" element={<AccountPage />} />
        {/* 감사 로그는 조직에서 행위할 수 있는 역할만 — ORG_VIEWER는 유일하게 제외 (§3.14). */}
        <Route
          path="audit"
          element={
            <RequireRole
              roles={['ORG_MANAGER', 'ORG_ADMIN', 'SYS_VIEWER', 'SYS_MANAGER', 'SYS_ADMIN']}
            >
              <AdminAuditPage />
            </RequireRole>
          }
        />
        <Route path="announcements" element={<AdminAnnouncementsPage />} />
        <Route path="notices" element={<AdminNoticesPage />} />
        <Route path="domains" element={<AdminDomainsPage />} />
        <Route
          path="notification-log"
          element={
            <RequireRole roles={['SYS_VIEWER', 'SYS_MANAGER', 'SYS_ADMIN']}>
              <AdminNotificationLogPage />
            </RequireRole>
          }
        />
        <Route
          path="drift"
          element={
            <RequireRole roles={['SYS_VIEWER', 'SYS_MANAGER', 'SYS_ADMIN']}>
              <AdminDriftPage />
            </RequireRole>
          }
        />
        <Route
          path="settings"
          element={
            <RequireRole roles={['SYS_VIEWER', 'SYS_MANAGER', 'SYS_ADMIN']}>
              <AdminSettingsPage />
            </RequireRole>
          }
        />
        <Route
          path="tasks"
          element={
            <RequireRole roles={['SYS_VIEWER', 'SYS_MANAGER', 'SYS_ADMIN']}>
              <AdminTasksPage />
            </RequireRole>
          }
        />
        <Route
          path="nodes"
          element={
            <RequireRole roles={['SYS_VIEWER', 'SYS_MANAGER', 'SYS_ADMIN']}>
              <AdminNodesPage />
            </RequireRole>
          }
        />
        <Route
          path="network"
          element={
            <RequireRole roles={['SYS_VIEWER', 'SYS_MANAGER', 'SYS_ADMIN']}>
              <AdminNetworkPage />
            </RequireRole>
          }
        />
        <Route
          path="os-images"
          element={
            <RequireRole roles={['SYS_VIEWER', 'SYS_MANAGER', 'SYS_ADMIN']}>
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
