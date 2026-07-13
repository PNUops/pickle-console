import { AppShell, type NavItem } from './AppShell'

const items: NavItem[] = [
  { to: '/console', label: '대시보드', end: true },
  { to: '/console/groups', label: '내 그룹' },
  { to: '/console/requests/new', label: 'VM 신청' },
  { to: '/console/requests', label: '내 신청', end: true },
  { to: '/console/vms', label: '내 VM' },
  { to: '/console/notifications', label: '알림함' },
  { to: '/console/activity', label: '내 활동' },
]

export function ConsoleLayout() {
  return (
    <AppShell
      home="/console"
      navLabel="콘솔 메뉴"
      items={items}
      notificationsTo="/console/notifications"
    />
  )
}
