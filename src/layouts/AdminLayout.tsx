import { AppShell, type NavItem } from './AppShell'

const items: NavItem[] = [
  { to: '/admin', label: '대시보드', end: true },
  // M2 후속 WP에서 추가 예정: 승인 대기, 신청 내역, 기관 자원
]

export function AdminLayout() {
  return <AppShell home="/admin" navLabel="관리자 메뉴" items={items} />
}
