import type { components } from '../api/schema'

export type WorkspaceKind = components['schemas']['WorkspaceKind']
export type CreatableWorkspaceKind = components['schemas']['CreatableWorkspaceKind']
export type WorkspaceMemberRole = components['schemas']['WorkspaceMemberRole']
export type ResourceRole = components['schemas']['ResourceRole']
export type UserRole = components['schemas']['UserRole']
export type UserStatus = components['schemas']['UserStatus']
export type OrgStatus = components['schemas']['OrgStatus']
export type CreditLimitReset = components['schemas']['CreditLimitReset']

export const WORKSPACE_KIND_LABELS: Record<WorkspaceKind, string> = {
  PERSONAL: '개인',
  COURSE: '교과',
  PROGRAM: '비교과',
  LAB: '연구실',
  CLUB: '동아리',
  COMPETITION: '대회',
  STUDY: '스터디',
  PROJECT: '프로젝트',
  TEAM: '팀',
}

/**
 * The order kinds appear in, and the only place that order is decided. Personal
 * comes first because everyone has one and it is the only kind that behaves
 * differently; project comes last because it takes whatever fits nowhere else;
 * in between runs from what the university operates to what people form on
 * their own. The contract's enum order is not this and must not be relied on.
 *
 * Retired TEAM is absent. A row that still carries it reads its label from the
 * table above, which is why that table has an entry the order does not.
 */
const WORKSPACE_KIND_ORDER: WorkspaceKind[] = [
  'PERSONAL',
  'COURSE',
  'PROGRAM',
  'LAB',
  'CLUB',
  'COMPETITION',
  'STUDY',
  'PROJECT',
]

/**
 * What a request may name, derived so the order above is the single source
 * rather than a second list that can drift from it. Personal is created at
 * signup and TEAM is retired, so neither can be asked for.
 */
export const CREATABLE_WORKSPACE_KINDS = WORKSPACE_KIND_ORDER.filter(
  (kind): kind is CreatableWorkspaceKind => kind !== 'PERSONAL' && kind !== 'TEAM',
)

/** One line telling the reader what a kind means where they pick one. */
export const WORKSPACE_KIND_HINTS: Record<CreatableWorkspaceKind, string> = {
  COURSE: '학점이 부여되는 정규 교과목',
  PROGRAM: '학점이 없는 교육 프로그램',
  LAB: '연구실과 연구 그룹',
  CLUB: '학생 자치 단체',
  COMPETITION: '공모전과 해커톤에 나가는 팀',
  STUDY: '자발적으로 모인 학습 모임',
  PROJECT: '그 밖에 무언가를 만드는 모임',
}

/**
 * The server ships before the console does, so a kind this build has no label
 * for will arrive. Show the raw value rather than an empty space: the resource
 * type registry does the same thing for the same reason.
 */
export function labelForWorkspaceKind(kind: string): string {
  return WORKSPACE_KIND_LABELS[kind as WorkspaceKind] ?? kind
}

/** 워크스페이스 축 — 워크스페이스 자체에 대한 권한. 2단이다. */
export const WORKSPACE_ROLE_LABELS: Record<WorkspaceMemberRole, string> = {
  OWNER: '소유자',
  MEMBER: '구성원',
}

/** 리소스 축 — 리소스 하나에 대한 권한. 접근 목록의 등급이다. */
export const RESOURCE_ROLE_LABELS: Record<ResourceRole, string> = {
  OWNER: '소유자',
  EDITOR: '편집자',
  MEMBER: '참여자',
  VIEWER: '열람자',
}

/**
 * 등급을 고를 때 옆에 붙이는 한 줄 설명 — VM 기준.
 *
 * 등급 이름은 종류를 가리지 않지만 그 등급이 사는 능력은 종류마다 다르다
 * (VM의 참여자는 접속하고, 키의 참여자는 읽기만 한다). 그래서 설명은 종류별로
 * 따로 두고, 화면은 자기 종류의 것을 쓴다.
 */
export const RESOURCE_ROLE_HINTS: Record<ResourceRole, string> = {
  OWNER: '접근 권한 관리, 보호 설정, 삭제까지',
  EDITOR: '설정·도메인·포트 변경까지',
  MEMBER: 'SSH·웹 터미널 접속과 전원 제어까지',
  VIEWER: '상태 조회만',
}

/** 같은 등급을 LLM API 키에 붙였을 때 실제로 열리는 것. */
export const LLM_KEY_RESOURCE_ROLE_HINTS: Record<ResourceRole, string> = {
  OWNER: '발급·재발급, 접근 권한 관리, 폐기까지',
  EDITOR: '이름과 본문 기록 설정 변경까지',
  MEMBER: '키 상세 조회 — 평문은 발급한 사람만 봅니다',
  VIEWER: '키 상세 조회',
}

/** What each grade actually opens on a domain. */
export const DNS_DOMAIN_RESOURCE_ROLE_HINTS: Record<ResourceRole, string> = {
  OWNER: '접근 권한 관리와 해제까지',
  EDITOR: '레코드 편집과 사용 연장까지',
  MEMBER: '이름과 레코드 조회',
  VIEWER: '이름과 레코드 조회',
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  USER: '사용자',
  ORG_VIEWER: '기관 열람자',
  ORG_MANAGER: '기관 운영자',
  ORG_ADMIN: '기관 관리자',
  SYS_VIEWER: '시스템 열람자',
  SYS_MANAGER: '시스템 운영자',
  SYS_ADMIN: '시스템 관리자',
}

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  PENDING_VERIFICATION: '인증 대기',
  ACTIVE: '활성',
  DISABLED: '비활성',
  WITHDRAWN: '탈퇴',
}

export const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  ACTIVE: '활성',
  DISABLED: '비활성',
}

export const CREDIT_LIMIT_RESET_LABELS: Record<CreditLimitReset, string> = {
  DAILY: '일일 (UTC 자정)',
  WEEKLY: '주간 (UTC 자정)',
  MONTHLY: '월간 (UTC 자정)',
}
