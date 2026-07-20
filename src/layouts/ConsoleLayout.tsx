import { navIcons } from '../components/nav-icons'
import { AppShell, type NavItem } from './AppShell'

// 계정·알림함·내 활동은 상단 바(사용자 메뉴·알림 팝오버)로 이동 — 사이드바는
// 작업 공간(서버·신청·그룹) 중심으로 유지한다. 라우트 자체는 그대로 살아 있다.
const items: NavItem[] = [
  { to: '/console', label: '대시보드', end: true, icon: navIcons.dashboard },
  { to: '/console/vms', label: '내 VM', icon: navIcons.server },
  { to: '/console/requests/new', label: 'VM 신청', icon: navIcons.filePlus },
  { to: '/console/requests', label: '내 신청', end: true, icon: navIcons.fileList },
  { to: '/console/groups', label: '내 그룹', icon: navIcons.users },
  { to: '/console/ssh-keys', label: 'SSH 키', icon: navIcons.key },
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
