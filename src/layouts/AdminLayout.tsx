import { useAuth } from '../auth/auth-context'
import { AppShell, type NavItem } from './AppShell'

export function AdminLayout() {
  const { user } = useAuth()

  const items: NavItem[] = [
    { to: '/admin', label: '대시보드', end: true },
    { to: '/admin/requests', label: '승인 대기' },
    { to: '/admin/vms', label: 'VM 관리' },
    { to: '/admin/expiry', label: '만료 관리' },
    { to: '/admin/domains', label: '도메인' },
    { to: '/admin/routes', label: '라우팅' },
    { to: '/admin/certificates', label: '인증서' },
    { to: '/admin/notifications', label: '알림함' },
    { to: '/admin/audit', label: '감사 로그' },
    // 노드/용량·기관 관리는 SYS_ADMIN 전용 (라우트에서도 한 번 더 가드)
    ...(user?.role === 'SYS_ADMIN'
      ? [
          { to: '/admin/nodes', label: '노드/용량' },
          { to: '/admin/ips', label: 'IP 할당' },
          { to: '/admin/orgs', label: '기관 관리' },
          { to: '/admin/tasks', label: '작업' },
          { to: '/admin/settings', label: '플랫폼 설정' },
          { to: '/admin/drift', label: '드리프트' },
        ]
      : []),
  ]

  return (
    <AppShell
      home="/admin"
      navLabel="관리자 메뉴"
      items={items}
      notificationsTo="/admin/notifications"
    />
  )
}
