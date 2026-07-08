import { Route, Routes } from 'react-router'
import { RequireRole } from './auth/RequireRole'
import { AdminLayout } from './layouts/AdminLayout'
import { ConsoleLayout } from './layouts/ConsoleLayout'
import { PublicLayout } from './layouts/PublicLayout'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import { AdminNodesPage } from './pages/AdminNodesPage'
import { AdminOrgsPage } from './pages/AdminOrgsPage'
import { AdminRequestDetailPage } from './pages/AdminRequestDetailPage'
import { AdminRequestsPage } from './pages/AdminRequestsPage'
import { AdminVmsPage } from './pages/AdminVmsPage'
import { ConsoleDashboardPage } from './pages/ConsoleDashboardPage'
import { GroupDetailPage } from './pages/GroupDetailPage'
import { GroupsPage } from './pages/GroupsPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { NewRequestPage } from './pages/NewRequestPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RequestDetailPage } from './pages/RequestDetailPage'
import { RequestsPage } from './pages/RequestsPage'
import { SignupPage } from './pages/SignupPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'
import { VmDetailPage } from './pages/VmDetailPage'
import { VmsPage } from './pages/VmsPage'

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route
        path="console"
        element={
          <RequireRole roles={['STUDENT']}>
            <ConsoleLayout />
          </RequireRole>
        }
      >
        <Route index element={<ConsoleDashboardPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="groups/:groupId" element={<GroupDetailPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="requests/new" element={<NewRequestPage />} />
        <Route path="requests/:requestId" element={<RequestDetailPage />} />
        <Route path="vms" element={<VmsPage />} />
        <Route path="vms/:vmId" element={<VmDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route
        path="admin"
        element={
          <RequireRole roles={['ORG_ADMIN', 'SYS_ADMIN']}>
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="requests" element={<AdminRequestsPage />} />
        <Route path="requests/:requestId" element={<AdminRequestDetailPage />} />
        <Route path="vms" element={<AdminVmsPage />} />
        <Route
          path="nodes"
          element={
            <RequireRole roles={['SYS_ADMIN']}>
              <AdminNodesPage />
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
  )
}

export default App
