import type { components } from '../api/schema'

export type GroupKind = components['schemas']['GroupKind']
export type GroupMemberRole = components['schemas']['GroupMemberRole']
export type UserRole = components['schemas']['UserRole']
export type OrgStatus = components['schemas']['OrgStatus']

export const GROUP_KIND_LABELS: Record<GroupKind, string> = {
  PERSONAL: '개인',
  TEAM: '팀',
  PROJECT: '프로젝트',
}

export const GROUP_ROLE_LABELS: Record<GroupMemberRole, string> = {
  OWNER: '소유자',
  EDITOR: '편집자',
  MEMBER: '참여자',
  VIEWER: '열람자',
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  USER: '사용자',
  ORG_ADMIN: '기관 관리자',
  SYS_ADMIN: '시스템 관리자',
}

export const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  ACTIVE: '활성',
  DISABLED: '비활성',
}
