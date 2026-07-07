import { AppShell, type NavItem } from './AppShell'

const items: NavItem[] = [
  { to: '/console', label: '대시보드', end: true },
  { to: '/console/groups', label: '내 그룹' },
  { to: '/console/requests/new', label: 'VM 신청' },
  { to: '/console/requests', label: '내 신청', end: true },
]

export function ConsoleLayout() {
  return <AppShell home="/console" navLabel="콘솔 메뉴" items={items} />
}
