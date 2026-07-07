import { useAuth } from '../auth/auth-context'
import { AppShell, type NavItem } from './AppShell'

export function AdminLayout() {
  const { user } = useAuth()

  const items: NavItem[] = [
    { to: '/admin', label: '대시보드', end: true },
    { to: '/admin/requests', label: '승인 대기' },
    // 기관 관리는 SYS_ADMIN 전용 (라우트에서도 한 번 더 가드)
    ...(user?.role === 'SYS_ADMIN' ? [{ to: '/admin/orgs', label: '기관 관리' }] : []),
  ]

  return <AppShell home="/admin" navLabel="관리자 메뉴" items={items} />
}
