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
 * 항목이 하나 늘 뿐, 구조는 그대로다. 아직 없는 종류도 회색 '준비 중' 항목으로
 * 같은 목록에 세운다 — 지금 되는 것만 세우면 이 플랫폼이 무엇을 주는 곳인지
 * 사이드바에서 읽히지 않는다. 서비스 중인 것이 위, 준비 중이 아래다.
 *
 * 이름은 랜딩과 같은 정식 명칭을 쓴다. 준비 중 배지가 흐름에서 빠져 라벨이 사이드바
 * 폭을 그대로 쓰므로(AppShell.tsx NAV_PLANNED_BADGE) 줄여 쓸 이유가 없다.
 *
 * 리소스 라인업은 랜딩의 쇼케이스(pages/landing/landing-data.tsx resourceTypes)와
 * 같게 유지한다 — 항목이 열리거나 늘면 그쪽도 같이 고친다(테스트가 9종을 고정 단언).
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
        { to: consolePaths.vms(scope), label: '가상머신', icon: navIcons.server },
        { to: consolePaths.llmKeys(scope), label: 'LLM API', icon: navIcons.chip, badge: 'Beta' },
        { label: '컨테이너', icon: navIcons.container, disabled: true },
        { label: '컨테이너 레지스트리', icon: navIcons.registry, disabled: true },
        { label: '데이터베이스', icon: navIcons.database, disabled: true },
        { label: '오브젝트 스토리지', icon: navIcons.storage, disabled: true },
        { label: 'GPU', icon: navIcons.gpu, disabled: true },
        { label: '도메인', icon: navIcons.globe, disabled: true },
        { label: '단축 링크', icon: navIcons.link, disabled: true },
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
      // 범위를 좁혀 둔 사람에게 '내 워크스페이스' 목록은 지금 보고 있는 곳이 아니다
      // — 그 상태에서 이 자리는 그 워크스페이스를 관리하러 가는 문이 된다.
      items: [{ to: '/notices', label: '공지사항', icon: navIcons.megaphone }],
    },
    {
      items: [
        scope == null
          ? { to: consolePaths.workspaces, label: '내 워크스페이스', icon: navIcons.users }
          : {
              to: consolePaths.workspaceDetail(scope),
              label: '워크스페이스 관리',
              icon: navIcons.users,
            },
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
