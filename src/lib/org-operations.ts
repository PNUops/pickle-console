import type { OrgOperationsMember, UserRole } from '../api/queries'
import { listPage } from './list-url'

export const ORG_ROLES: UserRole[] = ['ORG_ADMIN', 'ORG_MANAGER', 'ORG_VIEWER']
export const MEMBER_PAGE_SIZE = 20

export function orgMemberList(members: OrgOperationsMember[], params: URLSearchParams) {
  const q = (params.get('q') ?? '').trim().toLocaleLowerCase()
  const role = ORG_ROLES.find((value) => value === params.get('role'))
  const status = ['ACTIVE', 'DISABLED', 'PENDING_VERIFICATION', 'WITHDRAWN'].find((value) => value === params.get('status'))
  const filtered = members.filter((member) =>
    (!q || `${member.name} ${member.email}`.toLocaleLowerCase().includes(q)) &&
    (!role || member.role === role) && (!status || member.status === status),
  ).sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.userId.localeCompare(b.userId))
  const totalPages = Math.max(1, Math.ceil(filtered.length / MEMBER_PAGE_SIZE))
  const page = Math.min(listPage(params.get('page')), totalPages - 1)
  return { q: params.get('q') ?? '', role, status, page, totalPages, total: filtered.length,
    rows: filtered.slice(page * MEMBER_PAGE_SIZE, (page + 1) * MEMBER_PAGE_SIZE) }
}

const REASONS: Record<string, string> = {
  INACTIVE_ACCOUNT: '계정 비활성', INACTIVE: '계정 비활성', REQUESTER: '신청자 본인',
  REQUESTER_EXCLUDED: '신청자 본인', NOT_APPROVER: '신청 승인권 없음',
  NOT_DESIGNATED: '메일 수신자로 지정되지 않음', DESIGNATED: '지정 수신자',
  ALL_APPROVERS: '전체 승인자', LEGACY_DESIGNATED: '기존 지정 수신자',
  LEGACY_FALLBACK: '기존 기관 관리자 대체 수신',
  LEGACY_ORG_ADMIN: '기존 기관 관리자 대체 수신', ACCOUNT_INACTIVE: '계정 비활성',
  ROLE_CANNOT_RECEIVE: '신청 승인권 없음', NOT_SELECTED: '메일 수신자로 지정되지 않음',
}
export function orgRecipientReason(reason?: string | null): string {
  return reason ? (REASONS[reason] ?? reason) : '—'
}
