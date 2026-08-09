import type { components } from '../api/schema'

export type GroupKind = components['schemas']['GroupKind']
export type GroupMemberRole = components['schemas']['GroupMemberRole']
export type ResourceRole = components['schemas']['ResourceRole']
export type UserRole = components['schemas']['UserRole']
export type UserStatus = components['schemas']['UserStatus']
export type OrgStatus = components['schemas']['OrgStatus']

export const GROUP_KIND_LABELS: Record<GroupKind, string> = {
  PERSONAL: '개인',
  TEAM: '팀',
  PROJECT: '프로젝트',
}

/** 그룹 축 — 그룹 자체에 대한 권한. 2단이다. */
export const GROUP_ROLE_LABELS: Record<GroupMemberRole, string> = {
  OWNER: '소유자',
  MEMBER: '구성원',
}

/** 자원 축 — 자원 하나에 대한 권한. 접근 목록의 등급이다. */
export const RESOURCE_ROLE_LABELS: Record<ResourceRole, string> = {
  OWNER: '소유자',
  EDITOR: '편집자',
  MEMBER: '참여자',
  VIEWER: '열람자',
}

/** 등급을 고를 때 옆에 붙이는 한 줄 설명. */
export const RESOURCE_ROLE_HINTS: Record<ResourceRole, string> = {
  OWNER: '접근 권한 관리, 보호 설정, 삭제까지',
  EDITOR: '설정·도메인·포트 변경까지',
  MEMBER: 'SSH·웹 터미널 접속과 전원 제어까지',
  VIEWER: '상태 조회만',
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  USER: '사용자',
  ORG_MANAGER: '기관 운영자',
  ORG_ADMIN: '기관 관리자',
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
