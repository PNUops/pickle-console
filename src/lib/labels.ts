import type { components } from '../api/schema'

export type GroupKind = components['schemas']['GroupKind']
export type GroupMemberRole = components['schemas']['GroupMemberRole']

export const GROUP_KIND_LABELS: Record<GroupKind, string> = {
  PERSONAL: '개인',
  TEAM: '팀',
  PROJECT: '프로젝트',
}

export const GROUP_ROLE_LABELS: Record<GroupMemberRole, string> = {
  OWNER: '소유자',
  MANAGER: '관리자',
  MEMBER: '멤버',
  VIEWER: '뷰어',
}
