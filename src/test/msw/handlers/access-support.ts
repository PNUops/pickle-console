import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { canAdminManageAccess, canReadSupportMetadata } from '../../../auth/permissions'
import { ACCESS_TOKENS, problemResponse } from './auth'
import { vmAccessStore, vmStore } from './vms'
import { adminLlmKeyStore, llmKeyAccessStore, llmKeyStore } from './llm-keys'
import { dnsDomainAccessStore, dnsDomainStore } from './dns-domains'
import { gpuAllocationStore, grantsOf } from './gpu'
import { workspaceDetails } from './announcements'
import { knownUsers, workspaceMembersOf } from './workspaces'
import { adminUserStore } from './users'
import { uuid } from '../ids'

type Schemas = components['schemas']
type Role = Schemas['ResourceRole']
const grades: Role[] = ['OWNER', 'EDITOR', 'MEMBER', 'VIEWER']
export const accessSupportCalls: { action: string; type: string; resourceId: string; body: unknown }[] = []
const pendingInvitations = new Map<string, Schemas['WorkspaceInvitationResponse'][]>()
export function resetAccessSupportFixtures() { accessSupportCalls.splice(0); pendingInvitations.clear() }
function actorOf(request: Request) { return ACCESS_TOKENS[request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''] }
function refused(status = 403) { return problemResponse({ title: '접근 권한이 없습니다', status, code: 'ACCESS_DENIED', detail: '이 지원 작업을 수행할 권한이 없습니다.' }) }
function invalid(field: string, message: string) { return problemResponse({ title: '입력값을 확인해 주세요', status: 422, code: 'VALIDATION_FAILED', detail: message, errors: [{ field, message }] }) }
function target(type: string, id: string): { resource: Schemas['ResourceBrief']; grants: Schemas['ResourceAccessGrantView'][] } | null {
  if (type === 'VM') {
    const row = vmStore.find((item) => item.id === id)
    if (row?.workspaceId) return { resource: { id, type, name: row.name, displayName: row.displayName, status: row.status, workspaceId: row.workspaceId, workspaceName: row.workspaceName }, grants: vmAccessStore[id] ??= [] }
  } else if (type === 'LLM_API_KEY') {
    const row = llmKeyStore.find((item) => item.id === id) ?? adminLlmKeyStore.find((item) => item.id === id)
    if (row?.workspaceId) return { resource: { id, type, name: row.name, status: row.status, workspaceId: row.workspaceId, workspaceName: row.workspaceName }, grants: llmKeyAccessStore[id] ??= [] }
  } else if (type === 'DOMAIN') {
    const row = dnsDomainStore.rows.find((item) => item.domain.id === id)?.domain
    if (row?.workspaceId) return { resource: { id, type, name: row.fqdn, status: row.status, workspaceId: row.workspaceId, workspaceName: row.workspaceName }, grants: dnsDomainAccessStore[id] ??= [] }
  } else if (type === 'GPU') {
    const row = gpuAllocationStore.find((item) => item.id === id)
    if (row) return { resource: { id, type, name: row.name, status: row.status, workspaceId: row.workspaceId, workspaceName: row.workspaceName }, grants: grantsOf(row) }
  }
  return null
}
function members(workspaceId: string) {
  return workspaceDetails[workspaceId]?.members.map((member) => ({ ...member, eligible: member.userStatus === 'ACTIVE' }))
    ?? workspaceMembersOf(workspaceId).map((member) => ({ ...member, eligible: true }))
}

function fixtureImpact(row: NonNullable<ReturnType<typeof target>>, actorId: string, body: Schemas['ResourceAccessChangePreviewRequest']): Schemas['ActorAccessImpact'] {
  const member = members(row.resource.workspaceId).some((item) => item.userId === actorId)
  const visible = (grant: Schemas['ResourceAccessGrantView']) => member && (grant.user?.userId === actorId || grant.granteeType === 'WORKSPACE')
  const highest = (roles: Role[]) => roles.sort((a, b) => grades.indexOf(a) - grades.indexOf(b))[0]
  const before = highest(row.grants.filter(visible).map((grant) => grant.role))
  const changed = row.grants.find((grant) => grant.id === body.grantId)
  const remaining = row.grants.filter((grant) => grant.id !== body.grantId && visible(grant)).map((grant) => grant.role)
  const actorTarget = body.action === 'ADD' ? body.userId === actorId || body.granteeType === 'WORKSPACE' && member : changed?.user?.userId === actorId || changed?.granteeType === 'WORKSPACE' && member
  if (member && actorTarget && body.action !== 'REMOVE' && body.role) remaining.push(body.role)
  const after = highest(remaining)
  const increased = after != null && (!before || grades.indexOf(after) < grades.indexOf(before))
  return { fingerprint: `fixture-${row.resource.id}-${body.action}-${body.role}-${before ?? 'NONE'}`, increases: increased ? [{ resourceType: row.resource.type, targetId: row.resource.id, workspaceId: row.resource.workspaceId, beforeRole: before ?? null, afterRole: after }] : [], pendingResourceOwners: [] }
}

export const accessSupportHandlers: RequestHandler[] = [
  http.patch('*/api/v1/admin/workspaces/:workspaceId', async ({ params, request }) => {
    const actor = actorOf(request), workspace = workspaceDetails[String(params.workspaceId)]
    if (!actor || !canAdminManageAccess(actor.role)) return refused()
    if (!workspace) return refused(404)
    const body = await request.json() as Schemas['UpdateWorkspaceRequest']
    if (body.name) workspace.name = body.name
    if (body.description !== undefined) workspace.description = body.description
    if (body.kind && workspace.kind !== 'PERSONAL') workspace.kind = body.kind
    return HttpResponse.json(workspace)
  }),
  http.post('*/api/v1/admin/workspaces/:workspaceId/members/:userId/preview', async ({ params, request }) => {
    const actor = actorOf(request), workspace = workspaceDetails[String(params.workspaceId)]
    if (!actor || !canAdminManageAccess(actor.role)) return refused()
    if (!workspace) return refused(404)
    const member = workspace.members.find((item) => item.userId === params.userId)
    const body = await request.json() as Schemas['UpdateWorkspaceMemberRequest']
    if (!member) return refused(404)
    return HttpResponse.json({ fingerprint: `member-${member.userId}-${body.role}`, increases: actor.id === member.userId && member.workspaceRole === 'MEMBER' && body.role === 'OWNER' ? [{ resourceType: null, targetId: workspace.id, workspaceId: workspace.id, beforeRole: 'MEMBER', afterRole: 'OWNER' }] : [], pendingResourceOwners: [] } satisfies Schemas['ActorAccessImpact'])
  }),
  http.patch('*/api/v1/admin/workspaces/:workspaceId/members/:userId', async ({ params, request }) => {
    const actor = actorOf(request), workspace = workspaceDetails[String(params.workspaceId)]
    if (!actor || !canAdminManageAccess(actor.role)) return refused()
    if (!workspace || workspace.kind === 'PERSONAL') return refused(404)
    const member = workspace.members.find((item) => item.userId === params.userId)
    const body = await request.json() as Schemas['UpdateWorkspaceMemberRequest']
    if (!member) return refused(404)
    if (member.workspaceRole === 'OWNER' && body.role !== 'OWNER' && workspace.members.filter((item) => item.workspaceRole === 'OWNER').length === 1) return invalid('role', '마지막 소유자의 역할은 변경할 수 없습니다.')
    member.workspaceRole = body.role
    return HttpResponse.json({ userId: member.userId, name: member.name, email: member.email, role: member.workspaceRole })
  }),
  http.delete('*/api/v1/admin/workspaces/:workspaceId/members/:userId', ({ params, request }) => {
    const actor = actorOf(request), workspace = workspaceDetails[String(params.workspaceId)]
    if (!actor || !canAdminManageAccess(actor.role)) return refused()
    if (!workspace || workspace.kind === 'PERSONAL') return refused(404)
    const index = workspace.members.findIndex((item) => item.userId === params.userId)
    if (index < 0) return refused(404)
    if (workspace.members[index].workspaceRole === 'OWNER' && workspace.members.filter((item) => item.workspaceRole === 'OWNER').length === 1) return invalid('userId', '마지막 소유자는 제거할 수 없습니다.')
    workspace.members.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),
  http.post('*/api/v1/admin/workspaces/:workspaceId/invitations/preview', async ({ params, request }) => {
    const actor = actorOf(request), workspace = workspaceDetails[String(params.workspaceId)]
    if (!actor || !canAdminManageAccess(actor.role)) return refused()
    if (!workspace) return refused(404)
    const body = await request.json() as Schemas['InviteWorkspaceMembersRequest']
    const self = body.entries.some((entry) => entry.email?.toLowerCase() === actor.email.toLowerCase()) && !workspace.members.some((member) => member.userId === actor.id)
    return HttpResponse.json({ fingerprint: `invite-${workspace.id}-${JSON.stringify(body.entries)}`, increases: self ? [{ resourceType: null, targetId: workspace.id, workspaceId: workspace.id, beforeRole: null, afterRole: 'MEMBER' }] : [], pendingResourceOwners: [] } satisfies Schemas['ActorAccessImpact'])
  }),
  http.post('*/api/v1/admin/workspaces/:workspaceId/invitations', async ({ params, request }) => {
    const actor = actorOf(request), workspace = workspaceDetails[String(params.workspaceId)]
    if (!actor || !canAdminManageAccess(actor.role)) return refused()
    if (!workspace || workspace.kind === 'PERSONAL') return refused(404)
    const body = await request.json() as Schemas['InviteWorkspaceMembersRequest']
    const results: Schemas['WorkspaceInvitationResult'][] = body.entries.map((entry, index) => {
      const known = [{ userId: actor.id, name: actor.name, email: actor.email }, ...adminUserStore.map((item) => ({ userId: item.id, name: item.name, email: item.email })), ...knownUsers].find((item) => entry.email?.toLowerCase() === item.email.toLowerCase())
      const member = known && workspace.members.find((item) => item.userId === known.userId)
      if (member) return { ...entry, outcome: 'ALREADY_MEMBER', invitationId: null, userId: member.userId }
      if (known) {
        workspace.members.push({ ...known, workspaceRole: 'MEMBER', userStatus: 'ACTIVE', supportDetailVisible: true, joinedAt: '2026-10-13T00:00:00Z', canChangeRole: true, canRemove: true })
        return { ...entry, outcome: 'ADDED', invitationId: null, userId: known.userId }
      }
      const id = uuid(9960 + index)
      const invitations = pendingInvitations.get(workspace.id) ?? []
      invitations.push({ id, ...entry, role: 'MEMBER', invitedAt: '2026-10-13T00:00:00Z', invitedBy: { id: actor.id, name: actor.name } })
      pendingInvitations.set(workspace.id, invitations)
      return { ...entry, outcome: 'INVITED', invitationId: id, userId: null }
    })
    return HttpResponse.json({ results } satisfies Schemas['InviteWorkspaceMembersResponse'])
  }),
  http.get('*/api/v1/admin/workspaces/:workspaceId/invitations', ({ params }) => HttpResponse.json(pendingInvitations.get(String(params.workspaceId)) ?? [])),
  http.delete('*/api/v1/admin/workspaces/:workspaceId/invitations/:invitationId', ({ params, request }) => {
    const actor = actorOf(request)
    if (!actor || !canAdminManageAccess(actor.role)) return refused()
    const items = pendingInvitations.get(String(params.workspaceId)) ?? []
    const index = items.findIndex((item) => item.id === params.invitationId)
    if (index < 0) return refused(404)
    items.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),
  http.delete('*/api/v1/admin/workspaces/:workspaceId', ({ params, request }) => {
    const actor = actorOf(request), workspace = workspaceDetails[String(params.workspaceId)]
    if (!actor || !canAdminManageAccess(actor.role)) return refused()
    if (!workspace || workspace.kind === 'PERSONAL') return refused(404)
    if (workspace.vmCount > 0) return problemResponse({ title: '삭제할 수 없습니다', status: 409, code: 'WORKSPACE_HAS_ACTIVE_RESOURCES', detail: '남은 리소스를 먼저 정리해 주세요.' })
    delete workspaceDetails[workspace.id]
    return new HttpResponse(null, { status: 204 })
  }),
  ...([['vms/:id', 'VM'], ['dns-domains/:id', 'DOMAIN'], ['llm-keys/:id', 'LLM_API_KEY'], ['gpu-allocations/:id', 'GPU']] as const).map(([path, type]) => http.post(`*/api/v1/${path}/access/preview`, async ({ params, request }) => {
    const actor = actorOf(request)
    const row = target(type, String(params.id))
    if (!actor || !row) return refused(404)
    return HttpResponse.json(fixtureImpact(row, actor.id, await request.json() as Schemas['ResourceAccessChangePreviewRequest']))
  })),
  http.get('*/api/v1/admin/resource-access/:resourceType/:resourceId', ({ params, request }) => {
    const actor = actorOf(request)
    if (!actor || !canReadSupportMetadata(actor.role)) return refused()
    const row = target(String(params.resourceType), String(params.resourceId))
    return row ? HttpResponse.json({ ...row, canManageAccess: canAdminManageAccess(actor.role) } satisfies Schemas['ResourceAccessListResponse']) : refused(404)
  }),
  http.post('*/api/v1/admin/resource-access/:resourceType/:resourceId/preview', async ({ params, request }) => {
    const actor = actorOf(request)
    if (!actor || !canAdminManageAccess(actor.role)) return refused()
    const type = String(params.resourceType), resourceId = String(params.resourceId)
    const row = target(type, resourceId)
    if (!row) return refused(404)
    const body = await request.json() as Schemas['ResourceAccessChangePreviewRequest']
    return HttpResponse.json(fixtureImpact(row, actor.id, body))
  }),
  http.post('*/api/v1/admin/resource-access/:resourceType/:resourceId', async ({ params, request }) => {
    const actor = actorOf(request)
    if (!actor || !canAdminManageAccess(actor.role)) return refused()
    const type = String(params.resourceType), resourceId = String(params.resourceId)
    const row = target(type, resourceId)
    if (!row) return refused(404)
    const body = await request.json() as Schemas['AddResourceAccessGrantRequest']
    if (body.granteeType === 'WORKSPACE' && body.role !== 'MEMBER' && body.role !== 'VIEWER') return invalid('role', '워크스페이스 전체에는 참여자 또는 열람자만 부여할 수 있습니다.')
    const member = body.granteeType === 'USER' ? members(row.resource.workspaceId).find((item) => item.userId === body.userId && item.eligible) : null
    if (body.granteeType === 'USER' && !member) return invalid('userId', '활성 구성원에게만 부여할 수 있습니다.')
    const grant: Schemas['ResourceAccessGrantView'] = { id: uuid(9911 + accessSupportCalls.length), granteeType: body.granteeType, role: body.role, user: member ? { userId: member.userId, name: member.name, email: member.email } : null, createdAt: '2026-10-13T01:00:00Z' }
    row.grants.push(grant)
    accessSupportCalls.push({ action: 'ADD', type, resourceId, body })
    return HttpResponse.json(grant, { status: 201 })
  }),
  http.patch('*/api/v1/admin/resource-access/:resourceType/:resourceId/:grantId', async ({ params, request }) => {
    const actor = actorOf(request)
    if (!actor || !canAdminManageAccess(actor.role)) return refused()
    const type = String(params.resourceType), resourceId = String(params.resourceId)
    const grant = target(type, resourceId)?.grants.find((item) => item.id === params.grantId)
    if (!grant) return refused(404)
    const body = await request.json() as Schemas['UpdateResourceAccessGrantRequest']
    grant.role = body.role
    accessSupportCalls.push({ action: 'UPDATE', type, resourceId, body })
    return HttpResponse.json(grant)
  }),
  http.delete('*/api/v1/admin/resource-access/:resourceType/:resourceId/:grantId', ({ params, request }) => {
    const actor = actorOf(request)
    if (!actor || !canAdminManageAccess(actor.role)) return refused()
    const type = String(params.resourceType), resourceId = String(params.resourceId)
    const row = target(type, resourceId)
    const index = row?.grants.findIndex((item) => item.id === params.grantId) ?? -1
    if (!row || index < 0) return refused(404)
    row.grants.splice(index, 1)
    accessSupportCalls.push({ action: 'REMOVE', type, resourceId, body: null })
    return new HttpResponse(null, { status: 204 })
  }),
]
