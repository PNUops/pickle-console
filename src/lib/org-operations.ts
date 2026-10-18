import type { UserRole } from '../api/queries'
import type { OrgOperations, OrgOperationsMember, PermissionInput, SaveOrgOperations, RequestMailTarget } from '../api/org-operations'
import type { InstitutionPermission, InstitutionWorkView, WorkGroup } from '../auth/institution-authority'
import { listPage } from './list-url'
import { RESOURCE_TYPES } from '../components/resource/registry'

export function requestMailTargetLabel(target?: RequestMailTarget | null): string {
  return target ? `${RESOURCE_TYPES[target.requestType].label} · ${target.workspaceId}` : '일반 자격 (종류·공간 미지정)'
}

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
  PERMISSION_CANNOT_RECEIVE: '현재 범위에서 신청 결정 업무 없음',
  DECISION_WORK_MISSING: '이 종류의 신청 결정 업무 없음', TARGET_SCOPE_EXCLUDED: '이 워크스페이스가 담당 범위 밖임',
}

export const WORK_GROUPS: WorkGroup[] = ['VM', 'LLM', 'DOMAIN', 'GPU', 'WORKSPACE']
export const WORK_GROUP_LABELS: Record<WorkGroup, string> = { VM: '가상머신', LLM: 'LLM', DOMAIN: '외부 도메인', GPU: 'GPU', WORKSPACE: '워크스페이스 지원' }
export interface PermissionMember extends Omit<OrgOperationsMember, 'permission'> { permission: PermissionInput }

export function permissionInput(permission: InstitutionPermission): PermissionInput {
  return { mode: permission.mode, work: [...permission.work], scopes: structuredClone(permission.scopes), expectedRevision: permission.revision }
}

/** A mode change snapshots only today's explicitly registered FULL choices. */
export function selectedFromFull(catalogue: readonly InstitutionWorkView[], expectedRevision: number): PermissionInput {
  const selected = catalogue.filter((work) => work.includedInFull && work.selectable)
  const scopes: PermissionInput['scopes'] = {}
  for (const work of selected) if (work.group) scopes[work.group] = { mode: 'ALL', workspaceIds: [] }
  return { mode: 'SELECTED', work: selected.map((work) => work.id).sort(), scopes, expectedRevision }
}

export function permissionProblem(permission: PermissionInput, catalogue: readonly InstitutionWorkView[]): string | null {
  if (permission.mode === 'FULL') return permission.work.length || Object.keys(permission.scopes).length ? '전체 관리자 모드의 업무와 범위는 비워야 합니다.' : null
  if (permission.work.length === 0) return '선택 업무를 하나 이상 지정하세요. 담당 자격 회수는 별도 버튼을 사용하세요.'
  if (new Set(permission.work).size !== permission.work.length) return '중복된 업무를 확인하세요.'
  for (const id of permission.work) {
    const work = catalogue.find((item) => item.id === id && item.selectable)
    if (!work) return '현재 등록된 선택 업무가 아닌 값이 있습니다. 최신 권한 정보를 확인하세요.'
    if (work.group && !['ALL', 'LISTED'].includes(permission.scopes[work.group]?.mode ?? '')) return `${WORK_GROUP_LABELS[work.group]}의 범위를 명시적으로 선택하세요.`
  }
  for (const [group, scope] of Object.entries(permission.scopes)) {
    if (!WORK_GROUPS.includes(group as WorkGroup) || !catalogue.some((work) => work.group === group && permission.work.includes(work.id))) return '선택한 업무의 고정 그룹 범위만 지정하세요.'
    if (scope.mode === 'ALL' && scope.workspaceIds.length) return '모든 워크스페이스 범위에는 지정 ID를 함께 보낼 수 없습니다.'
  }
  return null
}

export function permissionRole(permission: PermissionInput | InstitutionPermission, catalogue: readonly InstitutionWorkView[]): string {
  if (permission.mode === 'FULL') return '기관 관리자'
  if (!permission.work.length) return '업무 미선택'
  return permission.work.some((id) => catalogue.some((work) => work.id === id && work.write)) ? '기관 운영자' : '기관 열람자'
}

export function permissionSummary(permission: InstitutionPermission | PermissionInput | null | undefined, catalogue: readonly InstitutionWorkView[]): string {
  if (!permission) return '권한 정보 조회 불가'
  if (permission.mode === 'FULL') return '전체 관리자 · 모든 워크스페이스 · 기관 위임 가능'
  const names = permission.work.map((id) => catalogue.find((work) => work.id === id)?.name ?? id)
  const scopes = WORK_GROUPS.flatMap((group) => {
    const scope = permission.scopes[group]
    return scope ? [`${WORK_GROUP_LABELS[group]}: ${scope.mode === 'ALL' ? '모든 워크스페이스' : `지정 ${scope.workspaceIds.length}곳`}`] : []
  })
  return `선택 업무 ${names.length}개: ${names.join(', ')}${scopes.length ? ` · ${scopes.join(' / ')}` : ''}`
}

/** Every original source revision is required, including a removed row. */
export function permissionSaveBody(baseline: OrgOperations, members: PermissionMember[], reason: string): SaveOrgOperations {
  const expectedPermissionRevisions: Record<string, number> = {}
  for (const member of baseline.members) {
    if (!member.permission || member.permission.revision < 1) throw new Error('기관 권한 원천 버전을 확인할 수 없습니다. 최신 명단을 다시 불러와 주세요.')
    expectedPermissionRevisions[member.userId] = member.permission.revision
  }
  return { expectedRevision: baseline.revision, expectedPermissionRevisions,
    members: members.map(({ userId, permission, requestMail }) => ({ userId, permission: structuredClone(permission), requestMail: requestMail === true })),
    mailMode: baseline.mailMode ?? null, reason: reason.trim() || null, allowVacancy: false, confirmedOrgId: null }
}
export function orgRecipientReason(reason?: string | null): string {
  return reason ? (REASONS[reason] ?? reason) : '—'
}
