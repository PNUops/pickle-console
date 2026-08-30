import {
  AppsListDetail24Regular,
  ClipboardTaskListLtr24Regular,
  Clock24Regular,
  Desktop24Regular,
  DocumentCheckmark24Regular,
  Globe24Regular,
  Home24Regular,
  Megaphone24Regular,
  Organization24Regular,
  People24Regular,
  Server24Regular,
  Settings24Regular,
  Shield24Regular,
  Wrench24Regular,
} from '@fluentui/react-icons'
import { useAuth } from '../auth/auth-context'
import { canViewAudit, isSysAdminOnly, isSysTier } from '../auth/permissions'
import { AdminScopeSelector } from '../components/AdminScopeSelector'
import { MfaNudgeBanner } from '../components/MfaNudgeBanner'
import { EmptyState, LoadingBlock } from '../components/ui'
import { useAdminScope } from '../lib/use-admin-scope'
import { AppShell, type NavSection } from './AppShell'

const iconClass = 'size-4 shrink-0'

export function AdminLayout() {
  const { user } = useAuth()
  const scope = useAdminScope()
  const sysTier = !!user && isSysTier(user.role)
  const sysAdmin = !!user && isSysAdminOnly(user.role)
  const effectiveRole = scope.tier === 'org' ? scope.activeOrgRole : user?.role
  const auditAllowed = !!effectiveRole && canViewAudit(effectiveRole)
  const path = scope.path

  const sections: NavSection[] = [
    {
      heading: '개요',
      items: [
        { to: path('/admin'), label: '대시보드', end: true, icon: <Home24Regular className={iconClass} /> },
      ],
    },
    {
      heading: '신청',
      items: [
        {
          to: path('/admin/requests'),
          label: '신청 검토',
          icon: <DocumentCheckmark24Regular className={iconClass} />,
        },
      ],
    },
    {
      heading: '리소스',
      items: [
        {
          to: path('/admin/vms'),
          label: '가상머신',
          icon: <Server24Regular className={iconClass} />,
        },
      ],
    },
    {
      heading: '사용자·워크스페이스',
      items: [
        { to: path('/admin/users'), label: '사용자', icon: <People24Regular className={iconClass} /> },
        {
          to: path('/admin/workspaces'),
          label: '워크스페이스',
          icon: <AppsListDetail24Regular className={iconClass} />,
        },
      ],
    },
    {
      heading: '운영',
      items: [
        { to: path('/admin/expiry'), label: '만료 관리', icon: <Clock24Regular className={iconClass} /> },
        {
          to: path('/admin/terminal-sessions'),
          label: '웹 터미널 세션',
          icon: <Desktop24Regular className={iconClass} />,
        },
        {
          to: path('/admin/domains'),
          label: '도메인·인증서',
          icon: <Globe24Regular className={iconClass} />,
        },
        ...(sysTier
          ? [
              { to: path('/admin/nodes'), label: '노드·IP', icon: <Server24Regular className={iconClass} /> },
              { to: path('/admin/network'), label: '네트워크', icon: <Globe24Regular className={iconClass} /> },
              {
                to: path('/admin/os-images'),
                label: 'OS 이미지',
                icon: <Desktop24Regular className={iconClass} />,
              },
              {
                to: path('/admin/tasks'),
                label: '작업',
                icon: <ClipboardTaskListLtr24Regular className={iconClass} />,
              },
              {
                to: path('/admin/settings'),
                label: '플랫폼 설정',
                icon: <Settings24Regular className={iconClass} />,
              },
              { to: path('/admin/drift'), label: '드리프트', icon: <Wrench24Regular className={iconClass} /> },
              {
                to: path('/admin/notification-log'),
                label: '알림 발송 이력',
                icon: <Megaphone24Regular className={iconClass} />,
              },
            ]
          : []),
      ],
    },
    {
      heading: '소통',
      items: [
        {
          to: path('/admin/announcements'),
          label: '알림 보내기',
          icon: <Megaphone24Regular className={iconClass} />,
        },
        { to: path('/admin/notices'), label: '공지사항', icon: <ClipboardTaskListLtr24Regular className={iconClass} /> },
      ],
    },
    {
      heading: '거버넌스',
      items: [
        ...(auditAllowed
          ? [{ to: path('/admin/audit'), label: '감사 로그', icon: <Shield24Regular className={iconClass} /> }]
          : []),
        ...(sysAdmin
          ? [{ to: path('/admin/orgs'), label: '기관 관리', icon: <Organization24Regular className={iconClass} /> }]
          : []),
      ],
    },
  ].filter((section) => section.items.length > 0)

  const scopeBlock = !scope.ready
    ? scope.resolving
      ? <LoadingBlock label="관리 범위 확인 중" />
      : (
          <EmptyState
            title={scope.options.length === 0 ? '관리할 기관이 없습니다' : '관리 기관을 선택하세요'}
            description="왼쪽 관리 범위에서 기관을 선택하면 해당 기관의 운영 화면을 엽니다."
          />
        )
    : undefined

  return (
    <AppShell
      home={path('/admin')}
      navLabel="관리자 메뉴"
      density="compact"
      sections={sections}
      sidebarTop={<AdminScopeSelector />}
      notificationsTo={path('/admin/notifications')}
      banner={<MfaNudgeBanner />}
      content={scopeBlock}
    />
  )
}
