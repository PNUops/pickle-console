import { Route, Routes } from 'react-router'
import { RequireRole } from './auth/RequireRole'
import { AdminLayout } from './layouts/AdminLayout'
import { ConsoleLayout } from './layouts/ConsoleLayout'
import { PublicLayout } from './layouts/PublicLayout'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import { ConsoleDashboardPage } from './pages/ConsoleDashboardPage'
import { GroupDetailPage } from './pages/GroupDetailPage'
import { GroupsPage } from './pages/GroupsPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SignupPage } from './pages/SignupPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'

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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
