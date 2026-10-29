import { emptyTerminationImpact } from '../test/fixtures/termination'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { useAuth } from '../auth/auth-context'
import { ToastProvider } from '../components/ui'
import { ACCESS_TOKENS, orgAdminProfile, orgAdminUser, orgManagerUser, orgViewerUser, refreshSuccessHandler, sysAdminUser, sysManagerUser, sysViewerUser } from '../test/msw/handlers/auth'
import { AUTHORITY_OVERRIDES, mockInstitutionAuthority } from '../test/msw/institution-authority'
import { workspaceDetails } from '../test/msw/handlers/announcements'
import { vmAccessStore, vmStore } from '../test/msw/handlers/vms'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { renderApp } from '../test/render'

const noGain = { fingerprint: 'unchanged-access', increases: [], pendingResourceOwners: [] }
const previewPath = '*/api/v1/admin/resource-access/:resourceType/:resourceId/preview'
const grantPath = '*/api/v1/admin/resource-access/:resourceType/:resourceId'

function RefreshActor() {
  const { user, refreshProfile } = useAuth()
  return <><button onClick={() => void refreshProfile()}>Refresh support actor</button><output data-testid="support-role-union">{user?.managedOrgs.map((org) => `${org.orgId}:${org.role}`).join(';')}</output></>
}
function renderContext(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '*', element: <QueryClientProvider client={client}><AuthProvider><ToastProvider><App /><RefreshActor /></ToastProvider></AuthProvider></QueryClientProvider> }], { initialEntries: [route] })
  render(<RouterProvider router={router} />)
  return { client, router }
}
function accessRoute(org = 2, id = 57) { return `/admin/resource-access/VM/${uuid(id)}?org=${uuid(org)}` }
function workspaceRoute(tab = 'members', org = 2) { return `/admin/workspaces?workspaceId=${uuid(12)}&inspect=1&tab=${tab}&org=${uuid(org)}` }

function onlyWorkspaceWork(work: string) {
  const context = mockInstitutionAuthority(orgAdminProfile)
  context.accountRole = 'ORG_MANAGER'
  context.authorityFingerprint = `synthetic-workspace:${work}`
  context.assignments[0].permission = { mode: 'SELECTED', revision: 23, work: [work], scopes: {
    WORKSPACE: { mode: 'LISTED', workspaceIds: [uuid(12)] },
  } }
  AUTHORITY_OVERRIDES[orgAdminProfile.id] = context
  server.use(refreshSuccessHandler('access-org-admin'))
}

test('owner-only administration designates an existing member using minimal references and exact identity confirmation', async () => {
  onlyWorkspaceWork('workspace.owners.manage')
  renderApp(`/admin/workspaces?workspaceId=${uuid(12)}&inspect=1&tab=members`)
  const user = userEvent.setup()
  await user.selectOptions(await screen.findByLabelText('이시스템 역할 변경'), 'OWNER')
  const dialog = within(await screen.findByRole('dialog', { name: '소유자 지정' }))
  expect(dialog.getByRole('button', { name: '소유자로 지정' })).toBeDisabled()
  await user.type(dialog.getByLabelText('대상 사용자 ID 확인'), uuid(5))
  await user.click(dialog.getByRole('button', { name: '소유자로 지정' }))
  await waitFor(() => expect(workspaceDetails[uuid(12)].members.find((member) => member.userId === uuid(5))?.workspaceRole).toBe('OWNER'))
  const memberRow = (await screen.findByText('이시스템')).closest('tr')!
  await within(memberRow).findByRole('cell', { name: '소유자' })
  expect(screen.queryByRole('dialog', { name: '소유자 지정' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '이시스템' })).not.toBeInTheDocument()
  expect(screen.queryByText('sysadmin.lee@pusan.ac.kr')).not.toBeInTheDocument()
})

test('owner-only administration removes an owner while a different owner remains', async () => {
  onlyWorkspaceWork('workspace.owners.manage')
  workspaceDetails[uuid(12)].members.find((member) => member.userId === uuid(5))!.workspaceRole = 'OWNER'
  renderApp(`/admin/workspaces?workspaceId=${uuid(12)}&inspect=1&tab=members`)
  const row = (await screen.findByText('홍길동')).closest('tr')!
  const user = userEvent.setup()
  await user.click(within(row).getByRole('button', { name: '제거' }))
  const dialog = within(await screen.findByRole('dialog', { name: '구성원 제거' }))
  await user.click(dialog.getByRole('button', { name: '제거' }))
  await waitFor(() => expect(workspaceDetails[uuid(12)].members.some((member) => member.userId === uuid(42))).toBe(false))
  expect(workspaceDetails[uuid(12)].members.some((member) => member.workspaceRole === 'OWNER')).toBe(true)
})

test('member-only administration cannot remove an owner even if a row flag claims otherwise', async () => {
  onlyWorkspaceWork('workspace.members.manage')
  server.use(http.get('*/api/v1/admin/workspaces/:workspaceId', () => HttpResponse.json({
    ...workspaceDetails[uuid(12)], metadataVisible: false, allowedWorkIds: ['workspace.members.manage'],
    canManageMembers: true, canManageOwners: false, canUpdateInfo: false, canInviteMembers: false, canDelete: false,
    memberCount: null, vmCount: null, createdAt: null, description: null,
    members: workspaceDetails[uuid(12)].members.map((member) => ({ ...member, email: null, joinedAt: null,
      supportDetailVisible: false, canChangeRole: true, canRemove: true })),
  })))
  renderApp(`/admin/workspaces?workspaceId=${uuid(12)}&inspect=1&tab=members`)
  const owner = (await screen.findByText('홍길동')).closest('tr')!
  expect(within(owner).queryByRole('button', { name: '제거' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('이시스템 역할 변경')).not.toBeInTheDocument()
  const member = screen.getByText('이시스템').closest('tr')!
  expect(within(member).getByRole('button', { name: '제거' })).toBeInTheDocument()
})


test.each([
  ['ORG_MANAGER own', 'access-org-manager', orgManagerUser, 1],
  ['ORG_MANAGER foreign', 'access-org-manager', orgManagerUser, 2],
  ['ORG_ADMIN own', 'access-org-admin', orgAdminUser, 1],
  ['ORG_ADMIN foreign', 'access-org-admin', orgAdminUser, 2],
  ['SYS_ADMIN foreign', 'access-sys-admin', sysAdminUser, 2],
] as const)('workspace OWNER designation uses the exact shared email confirmation for %s', async (_label, token, actor, org) => {
  const user = userEvent.setup()
  const bodies: unknown[] = []
  server.use(refreshSuccessHandler(token, actor),
    http.post('*/api/v1/admin/workspaces/:workspaceId/members/:userId/preview', () => HttpResponse.json(noGain)),
    http.patch('*/api/v1/admin/workspaces/:workspaceId/members/:userId', async ({ request, params }) => {
      bodies.push(await request.json())
      return HttpResponse.json({ userId: params.userId, name: '이시스템', email: 'sysadmin.lee@pusan.ac.kr', role: 'OWNER' })
    }))
  renderApp(workspaceRoute('members', org))
  await user.selectOptions(await screen.findByLabelText('이시스템 역할 변경'), 'OWNER')
  const dialog = within(await screen.findByRole('dialog', { name: '소유자 지정' }))
  expect(bodies).toHaveLength(0)
  expect(dialog.getByRole('button', { name: '소유자로 지정' })).toBeDisabled()
  expect(dialog.getByText(/기존 소유자의 권한은 그대로 유지됩니다/)).toBeInTheDocument()
  await user.type(dialog.getByLabelText('확인 이메일'), 'sysadmin.lee@pusan.ac.kr')
  await user.click(dialog.getByRole('button', { name: '소유자로 지정' }))
  await waitFor(() => expect(bodies).toEqual([{ role: 'OWNER' }]))
  expect(within(within(screen.getByRole('dialog', { name: '워크스페이스 상세' })).getByText('홍길동').closest('tr')!).getByText('소유자')).toBeInTheDocument()
  if (token.startsWith('access-org')) expect(screen.queryByRole('link', { name: '이시스템' })).not.toBeInTheDocument()
})

test.each([
  ['access-org-viewer', orgViewerUser], ['access-sys-viewer', sysViewerUser], ['access-sys-manager', sysManagerUser],
] as const)('readonly support %s gets no workspace or ACL mutations', async (token, actor) => {
  const mutations: string[] = []
  server.use(refreshSuccessHandler(token, actor), http.post(previewPath, () => { mutations.push('preview'); return HttpResponse.json(noGain) }))
  const view = renderApp(workspaceRoute())
  await screen.findByText('박탈퇴')
  expect(screen.queryByLabelText('이시스템 역할 변경')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '구성원 초대' })).not.toBeInTheDocument()
  view.unmount()
  renderApp(accessRoute())
  await screen.findByRole('heading', { name: '접근 권한' })
  expect(screen.queryByRole('heading', { name: '접근 권한 부여' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '회수' })).not.toBeInTheDocument()
  expect(mutations).toHaveLength(0)
})

test('a server capability denial hides ACL controls even for a support writer', async () => {
  const vm = vmStore.find((row) => row.id === uuid(57))!
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser), http.get(grantPath, () => HttpResponse.json({ resource: { ...vm, type: 'VM' }, grants: vmAccessStore[vm.id], canManageAccess: false })))
  renderApp(accessRoute())
  await screen.findByRole('heading', { name: '접근 권한' })
  expect(screen.queryByLabelText('대상')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '회수' })).not.toBeInTheDocument()
})

test('the support ACL picker uses minimal members and keeps active SYS members selectable without profile reads', async () => {
  const user = userEvent.setup()
  let ordinaryWorkspaceReads = 0, profileReads = 0
  let submitted: unknown
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser),
    http.get('*/api/v1/workspaces/:workspaceId', () => { ordinaryWorkspaceReads++; return HttpResponse.json({}) }),
    http.get('*/api/v1/admin/users/:userId', () => { profileReads++; return HttpResponse.json({}) }),
    http.post(previewPath, () => HttpResponse.json(noGain)),
    http.post(grantPath, async ({ request }) => { submitted = await request.json(); return HttpResponse.json({ id: uuid(9899), granteeType: 'USER', role: 'EDITOR', user: { userId: uuid(5), name: '이시스템', email: 'sysadmin.lee@pusan.ac.kr' }, createdAt: '2026-10-13T00:00:00Z' }) }))
  renderApp(accessRoute())
  await screen.findByRole('option', { name: /이시스템/ })
  await user.selectOptions(screen.getByLabelText('대상'), uuid(5))
  expect(screen.queryByRole('option', { name: /박탈퇴/ })).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('등급'), 'EDITOR')
  await user.click(screen.getByRole('button', { name: '부여' }))
  await waitFor(() => expect(submitted).toEqual({ granteeType: 'USER', userId: uuid(5), role: 'EDITOR' }))
  expect(ordinaryWorkspaceReads).toBe(0)
  expect(profileReads).toBe(0)
  expect(screen.queryByRole('link', { name: '이시스템' })).not.toBeInTheDocument()
})

test.each(['EDITOR', 'OWNER'] as const)('an existing MEMBER increase to %s requires purpose and exact gained targets before any PATCH', async (role) => {
  const user = userEvent.setup()
  const patches: unknown[] = []
  const actor = orgManagerUser
  const grant = { id: uuid(9801), granteeType: 'USER', user: { userId: actor.id, name: actor.name, email: actor.email }, role: 'MEMBER', createdAt: '2026-10-13T00:00:00Z' }
  server.use(refreshSuccessHandler('access-org-manager', actor),
    http.get(grantPath, () => HttpResponse.json({ resource: { id: uuid(57), type: 'VM', name: '지원 VM', status: 'RUNNING', workspaceId: uuid(12), workspaceName: '캡스톤 3조' }, grants: [grant], canManageAccess: true })),
    http.post(previewPath, async ({ request }) => { expect(await request.json()).toEqual({ action: 'UPDATE', grantId: grant.id, role }); return HttpResponse.json({ fingerprint: 'current-member-gain', increases: [{ resourceType: 'VM', targetId: uuid(57), workspaceId: uuid(12), beforeRole: 'MEMBER', afterRole: role }], pendingResourceOwners: [] }) }),
    http.patch('*/api/v1/admin/resource-access/:resourceType/:resourceId/:grantId', async ({ request }) => { patches.push(await request.json()); return HttpResponse.json({ ...grant, role }) }))
  renderApp(accessRoute())
  const card = (await screen.findByRole('heading', { name: '접근 권한' })).closest('div')!.parentElement!
  await user.selectOptions(await within(card).findByRole('combobox'), role)
  const dialog = within(await screen.findByRole('dialog', { name: '회원님의 권한 증가 확인' }))
  expect(patches).toHaveLength(0)
  expect(dialog.getByText(uuid(57), { selector: 'code' })).toBeInTheDocument()
  expect(dialog.getByRole('button', { name: '권한 증가 확인하고 계속' })).toBeDisabled()
  await user.type(dialog.getByLabelText('권한을 얻는 목적'), '접수된 요청을 확인')
  await user.click(dialog.getByRole('button', { name: '권한 증가 확인하고 계속' }))
  await waitFor(() => expect(patches).toEqual([{ role, confirmation: { purpose: '접수된 요청을 확인', fingerprint: 'current-member-gain', confirmed: true } }]))
})

test('a workspace-wide indirect gain can be cancelled without submitting a grant', async () => {
  const user = userEvent.setup()
  let writes = 0
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser),
    http.post(previewPath, () => HttpResponse.json({ fingerprint: 'workspace-wide-gain', increases: [{ resourceType: 'VM', targetId: uuid(57), workspaceId: uuid(12), beforeRole: null, afterRole: 'MEMBER' }], pendingResourceOwners: [] })),
    http.post(grantPath, () => { writes++; return HttpResponse.json({}) }))
  renderApp(accessRoute())
  await user.selectOptions(await screen.findByLabelText('대상'), 'WORKSPACE')
  await user.click(screen.getByRole('button', { name: '부여' }))
  const dialog = within(await screen.findByRole('dialog', { name: '회원님의 권한 증가 확인' }))
  expect(dialog.getByText(/워크스페이스 전체/)).toBeInTheDocument()
  expect(dialog.getByText('없음 → 참여자')).toBeInTheDocument()
  await user.click(dialog.getByRole('button', { name: '취소' }))
  expect(writes).toBe(0)
})

test('a self MEMBER invitation reviews membership and indirect access before the exact entries are sent', async () => {
  const user = userEvent.setup()
  const bodies: unknown[] = []
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser),
    http.post('*/api/v1/admin/workspaces/:workspaceId/invitations/preview', () => HttpResponse.json({ fingerprint: 'self-invitation-gain', increases: [{ resourceType: null, targetId: uuid(12), workspaceId: uuid(12), beforeRole: null, afterRole: 'MEMBER' }, { resourceType: 'VM', targetId: uuid(57), workspaceId: uuid(12), beforeRole: null, afterRole: 'VIEWER' }], pendingResourceOwners: [] })),
    http.post('*/api/v1/admin/workspaces/:workspaceId/invitations', async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({ results: [{ email: orgManagerUser.email, studentNo: null, outcome: 'ADDED', invitationId: null, userId: orgManagerUser.id }] }) }))
  renderApp(workspaceRoute())
  const form = await screen.findByRole('heading', { name: '구성원 초대' })
  await user.type(within(form.parentElement!).getByRole('textbox'), orgManagerUser.email)
  await user.click(screen.getByRole('button', { name: '초대' }))
  const dialog = within(await screen.findByRole('dialog', { name: '회원님의 권한 증가 확인' }))
  expect(bodies).toHaveLength(0)
  expect(dialog.getByText(/워크스페이스 구성원/)).toBeInTheDocument()
  await user.type(dialog.getByLabelText('권한을 얻는 목적'), '공동 실습 지원')
  await user.click(dialog.getByRole('button', { name: '권한 증가 확인하고 계속' }))
  await waitFor(() => expect(bodies).toEqual([{ entries: [{ email: orgManagerUser.email }], confirmation: { purpose: '공동 실습 지원', fingerprint: 'self-invitation-gain', confirmed: true } }]))
})

test('a delayed grant result invalidates its source cache while a new target keeps its own draft', async () => {
  const user = userEvent.setup()
  let release: () => void = () => {}
  const pending = new Promise<void>((done) => { release = done })
  let started = false
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser), http.post(previewPath, () => HttpResponse.json(noGain)),
    http.post(grantPath, async () => { started = true; await pending; return HttpResponse.json({ id: uuid(9891), granteeType: 'USER', role: 'MEMBER', user: { userId: uuid(5), name: '이전 대상의 늦은 부여', email: 'synthetic@example.invalid' }, createdAt: '2026-10-13T00:00:00Z' }) }))
  server.use(http.get(grantPath, ({ params }) => HttpResponse.json({ resource: { id: params.resourceId, type: 'VM', name: 'Synthetic resource', status: 'RUNNING', workspaceId: uuid(12), workspaceName: 'Synthetic workspace' }, grants: [], canManageAccess: true, eligibleMembers: [{ userId: uuid(5), name: '이시스템', workspaceRole: 'MEMBER', userStatus: 'ACTIVE' }] })))
  const { client, router } = renderContext(accessRoute())
  const invalidations = vi.spyOn(client, 'invalidateQueries')
  try {
    await screen.findByRole('option', { name: /이시스템/ })
  await user.selectOptions(screen.getByLabelText('대상'), uuid(5))
    await user.click(screen.getByRole('button', { name: '부여' }))
    await waitFor(() => expect(started).toBe(true))
    await act(() => router.navigate(accessRoute(2, 56)))
    await screen.findByRole('option', { name: /이시스템/ })
  await user.selectOptions(screen.getByLabelText('대상'), uuid(5))
    await user.selectOptions(screen.getByLabelText('등급'), 'OWNER')
    await act(async () => { release(); await pending })
    await waitFor(() => expect(invalidations).toHaveBeenCalledWith({ queryKey: ['admin-resource-access', 'VM', uuid(57)] }))
    expect(screen.getByLabelText('대상')).toHaveValue(uuid(5))
    expect(screen.getByLabelText('등급')).toHaveValue('OWNER')
    expect(screen.queryByText('이전 대상의 늦은 부여')).not.toBeInTheDocument()
    expect(screen.queryByText(/9891.*부여했습니다/)).not.toBeInTheDocument()
  } finally { release(); invalidations.mockRestore() }
})

test('a partial role-union downgrade discards an ACL review even while another institution remains writable', async () => {
  const original = ACCESS_TOKENS['access-org-manager']
  ACCESS_TOKENS['access-org-manager'] = { ...original, managedOrgs: [...original.managedOrgs, { orgId: uuid(2), orgName: '테스트 기관', role: 'ORG_MANAGER', requestMail: false }] }
  const user = userEvent.setup()
  let writes = 0
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser), http.post(previewPath, () => HttpResponse.json({ fingerprint: 'role-union-gain', increases: [{ resourceType: 'VM', targetId: uuid(57), workspaceId: uuid(12), beforeRole: null, afterRole: 'MEMBER' }], pendingResourceOwners: [] })), http.post(grantPath, () => { writes++; return HttpResponse.json({}) }))
  try {
    renderContext(accessRoute())
    await user.selectOptions(await screen.findByLabelText('대상'), 'WORKSPACE')
    await user.click(screen.getByRole('button', { name: '부여' }))
    await screen.findByRole('dialog', { name: '회원님의 권한 증가 확인' })
    ACCESS_TOKENS['access-org-manager'] = { ...ACCESS_TOKENS['access-org-manager'], managedOrgs: ACCESS_TOKENS['access-org-manager'].managedOrgs.map((org) => org.orgId === uuid(1) ? { ...org, role: 'ORG_VIEWER' } : org) }
    fireEvent.click(screen.getByRole('button', { name: 'Refresh support actor', hidden: true }))
    await waitFor(() => expect(screen.getByTestId('support-role-union')).toHaveTextContent(`${uuid(1)}:ORG_VIEWER`))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '회원님의 권한 증가 확인' })).not.toBeInTheDocument())
    expect(writes).toBe(0)
  } finally { ACCESS_TOKENS['access-org-manager'] = original }
})

test('PERSONAL and final OWNER capabilities retain their server protections', async () => {
  const personal = { ...workspaceDetails[uuid(12)], kind: 'PERSONAL', canUpdateInfo: true, canInviteMembers: false, canManageMembers: false, canManageOwners: false, canDelete: false, deleteBlockedReason: 'PERSONAL' }
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser), http.get('*/api/v1/admin/workspaces/:workspaceId', () => HttpResponse.json(personal)))
  const first = renderApp(workspaceRoute())
  await screen.findByText('박탈퇴')
  expect(screen.queryByLabelText('이시스템 역할 변경')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '구성원 초대' })).not.toBeInTheDocument()
  first.unmount()
  server.resetHandlers()
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser))
  renderApp(workspaceRoute())
  await within(await screen.findByRole('dialog', { name: '워크스페이스 상세' })).findByText('홍길동')
  expect(screen.queryByLabelText('홍길동 역할 변경')).not.toBeInTheDocument()
  const row = within(screen.getByRole('dialog', { name: '워크스페이스 상세' })).getByText('홍길동').closest('tr')!
  expect(within(row).queryByRole('button', { name: '제거' })).not.toBeInTheDocument()
})

test('a queued self-profile resource owner is shown as a future effect and needs fresh purpose confirmation', async () => {
  const user = userEvent.setup()
  const patches: Record<string, unknown>[] = []
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser),
    http.post('*/api/v1/admin/users/:userId/profile-impact', () => HttpResponse.json({ action: 'PROFILE', userId: orgAdminUser.id, observedAt: '2026-10-13T00:00:00Z', candidateStatus: 'ACTIVE', claimsPossible: true, studentNoWillChange: true, invitations: [], actorAccessImpact: { fingerprint: 'queued-future-owner', increases: [], pendingResourceOwners: [{ requestId: uuid(201), workspaceId: uuid(12), resourceType: 'VM', projectedStatus: 'QUEUED', role: 'OWNER' }] } })),
    http.patch('*/api/v1/admin/users/:userId/profile', async ({ request }) => { const body = await request.json() as Record<string, unknown>; patches.push(body); return HttpResponse.json({ ...orgAdminUser, status: 'ACTIVE', memberships: [], activeVmCount: 0, statusChanges: [], supportCapabilities: { profileVisible: true, canCorrectProfile: true, canEnableAccount: false } }) }))
  renderApp(`/admin/users/${orgAdminUser.id}?org=${uuid(2)}`)
  await user.click(await screen.findByRole('button', { name: '정정' }))
  await user.selectOptions(screen.getByLabelText('직책'), 'STUDENT_UNDERGRAD')
  await user.type(screen.getByLabelText('학번'), '202088888')
  await user.type(screen.getByLabelText('사유'), '본인 확인')
  const section = within(await screen.findByRole('region', { name: '회원님의 권한 증가 확인' }))
  expect(section.getByText('생성 대기 중인 자원의 예상 권한')).toBeInTheDocument()
  expect(section.getByText(/아직 자원이 생성되거나 현재 접근 권한을 얻은 결과는 아닙니다/)).toBeInTheDocument()
  expect(patches).toHaveLength(0)
  expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  await user.type(section.getByLabelText('권한을 얻는 목적'), '내 실습 자원 수령')
  await user.click(section.getByRole('checkbox', { name: '목적과 정확한 대상, 얻는 권한을 확인했습니다' }))
  await user.click(screen.getByRole('button', { name: '저장' }))
  await waitFor(() => expect(patches).toHaveLength(1))
  expect(patches[0].confirmation).toEqual({ purpose: '내 실습 자원 수령', fingerprint: 'queued-future-owner', confirmed: true })
})

test('a delete accepted by the earlier capability still renders a new remaining-resource refusal', async () => {
  const user = userEvent.setup()
  let calls = 0
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser),
    http.get('*/api/v1/admin/workspaces/:workspaceId/termination-impact', () => HttpResponse.json(emptyTerminationImpact())),
    http.get('*/api/v1/admin/workspaces/:workspaceId', () => HttpResponse.json({ ...workspaceDetails[uuid(12)], allowedWorkIds: ['workspace.support.read', 'workspace.info.update', 'workspace.members.manage', 'workspace.owners.manage', 'workspace.invitations.manage', 'workspace.terminate'], canUpdateInfo: true, canManageOwners: true, canManageMembers: true, canInviteMembers: true, canDelete: true, deleteBlockedReason: null })),
    http.delete('*/api/v1/admin/workspaces/:workspaceId', () => { calls++; return HttpResponse.json({ title: '삭제할 수 없습니다', status: 409, code: 'WORKSPACE_HAS_ACTIVE_RESOURCES', detail: '남아 있는 리소스를 먼저 정리해 주세요.' }, { status: 409 }) }))
  renderApp(workspaceRoute('overview'))
  await user.click(await screen.findByRole('button', { name: '워크스페이스 삭제' }))
  const dialog = within(await screen.findByRole('dialog', { name: '워크스페이스 삭제' }))
  expect(calls).toBe(0)
  expect(dialog.getByRole('button', { name: '워크스페이스 삭제' })).toBeDisabled()
  await user.type(dialog.getByRole('textbox'), '캡스톤 3조')
  await user.click(await dialog.findByRole('checkbox', { name: '표시된 전체 종료 영향과 자동 정리 내용을 확인했습니다' }))
  await user.click(dialog.getByRole('button', { name: '워크스페이스 삭제' }))
  expect(await screen.findByText(/남아 있는 리소스를 먼저 정리해 주세요\./)).toBeInTheDocument()
  expect(calls).toBe(1)
  expect(screen.getAllByRole('heading', { name: '캡스톤 3조' }).length).toBeGreaterThan(0)
})

test('a late preview cannot reopen an access review after the support scope changes', async () => {
  const user = userEvent.setup()
  let release: () => void = () => {}
  const pending = new Promise<void>((done) => { release = done })
  let started = false, writes = 0
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser), http.post(previewPath, async () => { started = true; await pending; return HttpResponse.json({ fingerprint: 'late-preview', increases: [{ resourceType: 'VM', targetId: uuid(57), workspaceId: uuid(12), beforeRole: null, afterRole: 'MEMBER' }], pendingResourceOwners: [] }) }), http.post(grantPath, () => { writes++; return HttpResponse.json({}) }))
  const { router } = renderContext(accessRoute())
  try {
    await user.selectOptions(await screen.findByLabelText('대상'), 'WORKSPACE')
    await user.click(screen.getByRole('button', { name: '부여' }))
    await waitFor(() => expect(started).toBe(true))
    await act(() => router.navigate(accessRoute(1)))
    await screen.findByLabelText('대상')
    await act(async () => { release(); await pending })
    expect(screen.queryByRole('dialog', { name: '회원님의 권한 증가 확인' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('대상')).toHaveValue('')
    expect(writes).toBe(0)
  } finally { release() }
})
