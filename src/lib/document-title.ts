import { useEffect } from 'react'
import { useLocation } from 'react-router'

const ROOT_TITLE = 'PNU Cloud, Pickle'

const ADMIN_TITLES: Record<string, string> = {
  requests: '신청',
  vms: '가상머신',
  'terminal-sessions': '터미널 세션',
  users: '사용자',
  workspaces: '워크스페이스',
  expiry: '만료 관리',
  notifications: '알림',
  account: '계정 설정',
  audit: '감사 로그',
  announcements: '공지 발송',
  notices: '공지사항',
  domains: '도메인',
  'notification-log': '알림 이력',
  drift: '구성 드리프트',
  settings: '플랫폼 설정',
  tasks: '운영 작업',
  nodes: '노드',
  network: '네트워크',
  'os-images': '이미지와 사양',
  orgs: '기관',
}

const CONSOLE_TITLES: Record<string, string> = {
  resources: '리소스',
  requests: '신청',
  vms: '가상머신',
  'llm-keys': 'LLM API 키',
  workspaces: '워크스페이스',
  account: '계정 설정',
  notifications: '알림',
  activity: '내 활동',
  notices: '공지사항',
}

const PUBLIC_TITLES: Record<string, string> = {
  login: '로그인',
  signup: '회원가입',
  'verify-email': '이메일 인증',
  'forgot-password': '비밀번호 찾기',
  'reset-password': '비밀번호 재설정',
  'google-onboarding': '가입 정보 입력',
  docs: '사용 가이드',
  terms: '정책 문서',
}

const withBrand = (page: string) => `${page} · Pickle`

/** URL만으로 새 문서와 deep link의 browser title을 같은 규칙으로 결정한다. */
export function documentTitleForPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return ROOT_TITLE

  const [surface, section] = segments
  if (surface === 'admin') {
    if (section === 'llm') {
      if (segments[2] === 'keys') return withBrand('LLM API 키')
      if (segments[2] === 'status') return withBrand('LLM 서비스')
    }
    return withBrand(section ? (ADMIN_TITLES[section] ?? '관리자 콘솔') : '관리자 개요')
  }

  if (surface === 'console') {
    if (!section) return withBrand('개요')

    // Workspace-scoped routes add the UUID before the same resource section.
    const scopedSection = CONSOLE_TITLES[section] ? section : segments[2]
    return withBrand(scopedSection ? (CONSOLE_TITLES[scopedSection] ?? '개요') : '개요')
  }

  if (surface === 'auth' && section === 'google' && segments[2] === 'callback') {
    return withBrand('Google 로그인')
  }

  return withBrand(PUBLIC_TITLES[surface] ?? '페이지를 찾을 수 없음')
}

/** SPA 경로 전환 때 대표 identity title을 현재 화면 title로 교체한다. */
export function DocumentTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    document.title = documentTitleForPath(pathname)
  }, [pathname])

  return null
}
