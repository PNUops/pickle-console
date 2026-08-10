import { useAuth } from '../auth/auth-context'
import { isSysAdminOnly, isSysTier } from '../auth/permissions'
import { AppShell, type NavSection } from './AppShell'

export function AdminLayout() {
  const { user } = useAuth()
  const sysTier = !!user && isSysTier(user.role)
  const sysAdmin = !!user && isSysAdminOnly(user.role)

  const sections: NavSection[] = [
    {
      heading: '운영',
      items: [
        { to: '/admin', label: '대시보드', end: true },
        { to: '/admin/requests', label: '승인 대기' },
        { to: '/admin/vms', label: 'VM 관리' },
        { to: '/admin/terminal-sessions', label: '웹 터미널 세션' },
        { to: '/admin/users', label: '사용자 관리' },
        { to: '/admin/workspaces', label: '워크스페이스 관리' },
        { to: '/admin/expiry', label: '만료 관리' },
      ],
    },
    {
      heading: '공개 서비스',
      // 도메인 중심 1화면(라우팅 흡수) + 인증서 탭 — 3메뉴 통합 (2026-07-27).
      items: [{ to: '/admin/domains', label: '도메인·인증서' }],
    },
    {
      heading: '소통',
      items: [
        { to: '/admin/announcements', label: '공지 보내기' },
        { to: '/admin/audit', label: '감사 로그' },
        // 알림함은 상단 바 알림 팝오버("전체 보기")로 진입 — 사이드바에서 제외.
      ],
    },
    // 시스템 섹션은 시스템 계층(SYS_MANAGER·SYS_ADMIN) 전용 — 각 라우트에서도
    // 한 번 더 가드한다. 기관 관리(org 생성/수정)만 SYS_ADMIN 전용(§4).
    ...(sysTier
      ? [
          {
            heading: '시스템',
            items: [
              { to: '/admin/nodes', label: '노드/IP' },
              { to: '/admin/network', label: '네트워크' },
              { to: '/admin/os-images', label: 'OS 이미지 관리' },
              ...(sysAdmin ? [{ to: '/admin/orgs', label: '기관 관리' }] : []),
              { to: '/admin/tasks', label: '작업' },
              { to: '/admin/settings', label: '플랫폼 설정' },
              { to: '/admin/drift', label: '드리프트' },
              { to: '/admin/notification-log', label: '알림 발송 이력' },
            ],
          } satisfies NavSection,
        ]
      : []),
  ]

  return (
    <AppShell
      home="/admin"
      navLabel="관리자 메뉴"
      sections={sections}
      notificationsTo="/admin/notifications"
    />
  )
}
