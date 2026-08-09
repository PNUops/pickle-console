import { navIcons } from '../components/nav-icons'
import { WorkspaceScopeSelector } from '../components/WorkspaceScopeSelector'
import { consolePaths } from '../lib/paths'
import { useScope } from '../lib/use-scope'
import { AppShell, type NavSection } from './AppShell'

/**
 * 계정·알림함·내 활동은 상단 바(사용자 메뉴·알림 팝오버)로 이동 — 사이드바는
 * 작업 공간(리소스·신청·워크스페이스) 중심으로 유지한다. 라우트 자체는 그대로 살아 있다.
 *
 * 리소스 섹션의 항목은 선택한 워크스페이스를 따라간다. 종류가 늘면 이 섹션에
 * 항목이 하나 늘 뿐, 구조는 그대로다.
 */
export function ConsoleLayout() {
  const scope = useScope()
  const sections: NavSection[] = [
    {
      items: [
        { to: consolePaths.dashboard(scope), label: '대시보드', end: true, icon: navIcons.dashboard },
      ],
    },
    {
      heading: '리소스',
      items: [
        { to: consolePaths.resources(scope), label: '전체 리소스', icon: navIcons.dashboard },
        { to: consolePaths.vms(scope), label: 'VM', icon: navIcons.server },
      ],
    },
    {
      heading: '신청',
      items: [
        { to: consolePaths.newRequest(scope), label: '리소스 신청', icon: navIcons.filePlus },
        { to: consolePaths.requests(scope), label: '내 신청', end: true, icon: navIcons.fileList },
      ],
    },
    {
      items: [
        { to: consolePaths.workspaces, label: '내 워크스페이스', icon: navIcons.users },
        { to: consolePaths.sshKeys, label: 'SSH 키', icon: navIcons.key },
      ],
    },
  ]

  return (
    <AppShell
      home="/console"
      navLabel="콘솔 메뉴"
      sections={sections}
      sidebarTop={<WorkspaceScopeSelector />}
      notificationsTo={consolePaths.notifications}
    />
  )
}
