import { AppShell, type NavItem } from './AppShell'

const items: NavItem[] = [
  { to: '/console', label: '대시보드', end: true },
  // M2 후속 WP에서 추가 예정: VM 신청, 내 VM, 그룹, 알림함
]

export function ConsoleLayout() {
  return <AppShell home="/console" navLabel="콘솔 메뉴" items={items} />
}
