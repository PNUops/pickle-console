import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, test, vi } from 'vitest'
import { setAccessToken } from '../api/token'
import { AuthContext, type UserProfile } from '../auth/auth-context'
import type { InstitutionAuthority, InstitutionPermission } from '../auth/institution-authority'
import { hasWork } from '../auth/institution-authority'
import { AdminScopeContext, type AdminScopeValue } from '../lib/admin-scope-context'
import { AdminOrgOperationsPage } from './AdminOrgOperationsPage'
import { ACCESS_TOKENS, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { adminUserStore } from '../test/msw/handlers/users'
import { evaluateOrgOperations, orgMailPreviews, orgMailSaves, orgOperationPermissions, orgOperationPreviews, orgOperationRevisions, orgOperationSaves } from '../test/msw/handlers/org-operations'
import { AUTHORITY_OVERRIDES, MOCK_WORK_CATALOGUE, mockAuthorityActor } from '../test/msw/institution-authority'
import { orgs } from '../test/msw/handlers/reference'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'
import { requestStore } from '../test/msw/handlers/requests'
import { workspaceStore } from '../test/msw/handlers/workspaces'

function profileWith(work: string[], mode: 'SELECTED' | 'FULL' = 'SELECTED'): UserProfile {
  const role = mode === 'FULL' ? 'ORG_ADMIN' : work.some((id) => MOCK_WORK_CATALOGUE.some((item) => item.id === id && item.write)) ? 'ORG_MANAGER' : 'ORG_VIEWER'
  const permission: InstitutionPermission = mode === 'FULL' ? { mode, work: [], scopes: {}, revision: 5 } : { mode, work, scopes: {}, revision: 5 }
  const authority: InstitutionAuthority = { state: 'VALID_SOURCES', failure: null, accountRole: role, catalogueRevision: '4', authorityFingerprint: JSON.stringify(permission), catalogue: MOCK_WORK_CATALOGUE,
    assignments: [{ institutionId: uuid(1), institutionName: orgs[0].name, permission }] }
  return { ...ACCESS_TOKENS['access-org-manager'], role, institutionAuthority: authority }
}
function setup(profile = mockAuthorityActor(ACCESS_TOKENS['access-sys-admin'])) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const token = 'access-editor-synthetic'
  ACCESS_TOKENS[token] = profile
  if (profile.institutionAuthority) AUTHORITY_OVERRIDES[profile.id] = profile.institutionAuthority
  setAccessToken(token)
  const scope: AdminScopeValue = { tier: profile.role.startsWith('SYS_') ? 'system' : 'org', globalSupport: false, activeOrgId: uuid(1), activeOrg: orgs[0], activeOrgRole: 'ORG_ADMIN', options: orgs, requiresSelection: false, resolving: false, catalogPending: false, error: false, ready: true, retry: vi.fn(), setActiveOrgId: vi.fn(), path: (path) => path }
  const frame = (current: UserProfile) => <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/admin/org-operations?org=${uuid(1)}`]}><AuthContext.Provider value={{ user: current, status: 'authenticated', login: vi.fn(), completeMfa: vi.fn(), refreshProfile: vi.fn(), beginCredentialExchange: vi.fn(), logout: vi.fn() }}><AdminScopeContext.Provider value={scope}><AdminOrgOperationsPage /></AdminScopeContext.Provider></AuthContext.Provider></MemoryRouter></QueryClientProvider>
  const result = render(frame(profile))
  return { ...result, update: (current: UserProfile) => { ACCESS_TOKENS[token] = current; if (current.institutionAuthority) AUTHORITY_OVERRIDES[current.id] = current.institutionAuthority; result.rerender(frame(current)) } }
}
function addMember(id: number, permission: InstitutionPermission) {
  const member = adminUserStore.find((account) => account.id === uuid(id))!
  member.managedOrgs = [{ orgId: uuid(1), orgName: orgs[0].name, role: permission.mode === 'FULL' ? 'ORG_ADMIN' : 'ORG_MANAGER', requestMail: false }]
  orgOperationPermissions[`${member.id}:${uuid(1)}`] = permission
  return member
}
async function openPermission() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '기관 권한 편집' }))
  return { user, dialog: screen.getByRole('dialog', { name: '기관 권한 편집' }) }
}

describe('Explicit institution authority and independent mail settings', () => {
  test('the actual restored AuthProvider profile opens the explicit editor through the full app', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp(`/admin/org-operations?org=${uuid(1)}`)
    const { dialog } = await openPermission()
    expect(within(dialog).getByLabelText('김관리 부여 방식')).toHaveValue('FULL')
    expect(within(dialog).getByRole('button', { name: '권한 변경안 미리보기' })).toBeEnabled()
  })

  test('the full app keeps disabled institution catalogue and direct selected URLs distinct', async () => {
    orgs[1].status = 'DISABLED'
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/org-operations')
    const user = userEvent.setup()
    const row = (await screen.findByText('테스트 기관')).closest('tr')!
    expect(within(row).getByText('비활성')).toBeInTheDocument()
    await user.click(within(row).getByRole('link', { name: '명단과 수신 설정 보기' }))
    await screen.findByRole('heading', { name: '기관 담당자 명단' })
    expect(currentPath()).toBe(`/admin/org-operations?org=${uuid(2)}`)
  })
  test.each(['access-sys-admin', 'access-sys-manager', 'access-sys-viewer'])('%s preserves the server role subset', async (token) => {
    setup(mockAuthorityActor(ACCESS_TOKENS[token]))
    await screen.findByRole('heading', { name: '기관 담당자 명단' })
    expect(!!screen.queryByRole('button', { name: '기관 권한 편집' })).toBe(token === 'access-sys-admin')
    expect(!!screen.queryByRole('button', { name: '신청 메일 수신 설정' })).toBe(token === 'access-sys-admin')
  })

  test('a role label without authority never recreates institution access', async () => {
    let reads = 0
    server.use(http.get('*/api/v1/admin/orgs/:orgId/operations', () => { reads += 1; return HttpResponse.json(evaluateOrgOperations(uuid(1))) }))
    setup({ ...ACCESS_TOKENS['access-org-admin'], institutionAuthority: null })
    expect(await screen.findByText('이 기관의 담당자 정보나 수신 설정을 조회할 권한이 없습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '기관 권한 편집' })).not.toBeInTheDocument()
    expect(reads).toBe(0)
  })

  test('invalid institution context does not become a FULL display-role fallback', async () => {
    const profile = profileWith([], 'FULL')
    profile.institutionAuthority = { ...profile.institutionAuthority!, state: 'INVALID', assignments: [], failure: 'INCONSISTENT' }
    setup(profile)
    await screen.findByText('이 기관의 담당자 정보나 수신 설정을 조회할 권한이 없습니다.')
    expect(screen.queryByRole('button', { name: '기관 권한 편집' })).not.toBeInTheDocument()
  })

  test('staff read is permission read-only and does not expose mail fields or profile links', async () => {
    setup(profileWith(['institution.staff.read']))
    await screen.findByRole('heading', { name: '기관 담당자 명단' })
    expect(screen.getByText('수신 설정 조회 권한이 없습니다. 담당자 권한 정보만 확인할 수 있습니다.')).toBeInTheDocument()
    expect(screen.getByText('전체 관리자 · 모든 워크스페이스 · 기관 위임 가능')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '기관 권한 편집' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '신청 메일 수신 설정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '김관리' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('미리보기 신청 종류')).not.toBeInTheDocument()
  })

  test('mail configure-only posts the exact receipt-only body while permission remains hidden', async () => {
    const user = userEvent.setup()
    setup(profileWith(['institution.request-mail.configure']))
    await user.click(await screen.findByRole('button', { name: '신청 메일 수신 설정' }))
    expect(screen.queryByRole('button', { name: '기관 권한 편집' })).not.toBeInTheDocument()
    expect(screen.getByText('권한 정보 조회 불가')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: '신청 메일 수신 설정' })
    expect(within(dialog).queryByLabelText('김관리 부여 방식')).not.toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText('신청 이메일 수신 방식'), 'DESIGNATED')
    await user.click(within(dialog).getByLabelText('김관리 메일 수신자 지정'))
    await user.click(within(dialog).getByRole('button', { name: '수신 변경안 미리보기' }))
    await user.click(await within(dialog).findByRole('button', { name: '검토한 수신 설정 저장' }))
    await screen.findByText(/신청 메일 수신 설정을 버전 1로 저장했습니다/)
    expect(orgMailSaves[0].body).toEqual({ expectedRevision: 0, mailMode: 'DESIGNATED', recipientIds: [uuid(7)], reason: null })
    expect(orgOperationSaves).toHaveLength(0)
    expect(evaluateOrgOperations(uuid(1))!.members[0].permission?.mode).toBe('FULL')
  })

  test('mail eligibility comes from the server rather than a MANAGER role or roster job', async () => {
    const member = addMember(42, { mode: 'SELECTED', work: ['vm.roster.issue'], scopes: { VM: { mode: 'ALL', workspaceIds: [] } }, revision: 21 })
    setup(profileWith(['institution.request-mail.configure']))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '신청 메일 수신 설정' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('신청 이메일 수신 방식'), 'DESIGNATED')
    expect(within(dialog).getByLabelText(`${member.name} 메일 수신자 지정`)).toBeDisabled()
    expect(within(dialog).getByText('현재 범위에서 신청 결정 업무 없음')).toBeInTheDocument()
  })

  test('explicit all-selected remains non-delegating although mail configure is selected', async () => {
    const profile = profileWith(MOCK_WORK_CATALOGUE.filter((work) => work.selectable).map((work) => work.id))
    for (const group of ['VM', 'LLM', 'DOMAIN', 'GPU', 'WORKSPACE'] as const) profile.institutionAuthority!.assignments[0].permission.scopes[group] = { mode: 'ALL', workspaceIds: [] }
    setup(profile)
    await screen.findByRole('heading', { name: '기관 담당자 명단' })
    expect(screen.queryByRole('button', { name: '기관 권한 편집' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '신청 메일 수신 설정' })).toBeEnabled()
  })

  test('FULL conversion snapshots 85 current selectable works without delegation or role input', async () => {
    setup()
    const { user, dialog } = await openPermission()
    await user.selectOptions(within(dialog).getByLabelText('김관리 부여 방식'), 'SELECTED')
    expect(within(dialog).getByText(/표시 역할: 기관 운영자/)).toBeInTheDocument()
    expect(within(dialog).getAllByRole('checkbox', { checked: true })).toHaveLength(85)
    expect(within(dialog).queryByLabelText(/업무: 기관 권한 위임/)).not.toBeInTheDocument()
    expect(within(dialog).getByText(/다른 FULL 출처의 영향/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '권한 변경안 미리보기' }))
    await within(dialog).findByRole('heading', { name: '저장 전 권한 변경 확인' })
    const body = orgOperationPreviews[0].body
    expect(body.members[0].permission.mode).toBe('SELECTED')
    expect(body.members[0].permission.work).toHaveLength(85)
    expect(body.members[0]).not.toHaveProperty('role')
    expect(body.expectedPermissionRevisions).toEqual({ [uuid(7)]: 1 })
    expect(within(dialog).getByText(/마지막 FULL 출처가 사라져/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '검토한 기관 권한 저장' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText('권한 변경 사유'), '담당 범위 조정')
    expect(within(dialog).queryByRole('button', { name: '검토한 기관 권한 저장' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '권한 변경안 미리보기' }))
    await within(dialog).findByRole('button', { name: '검토한 기관 권한 저장' })
    await user.click(within(dialog).getByLabelText('FULL 담당자 또는 신청 결정 담당자 공백 예외를 적용합니다'))
    await user.type(within(dialog).getByLabelText('예외 대상 기관 이름 확인'), orgs[0].name)
    await user.click(within(dialog).getByRole('button', { name: '검토한 기관 권한 저장' }))
    await screen.findByText(/기관 권한을 버전 1로 저장했습니다/)
    expect(orgOperationSaves[0].body).toMatchObject({ allowVacancy: true, confirmedOrgId: uuid(1), reason: '담당 범위 조정' })
    const nextActor = mockAuthorityActor(ACCESS_TOKENS['access-org-admin'])
    expect(nextActor.role).toBe('ORG_MANAGER')
    expect(nextActor.institutionAuthority!.assignments[0].permission.mode).toBe('SELECTED')
    expect(hasWork(nextActor, 'institution.delegate', { orgId: uuid(1) })).toBe(false)
  })

  test('same-group work shares one scope while deleted IDs and another group stay independent', async () => {
    const member = addMember(42, { mode: 'SELECTED', work: ['vm.period', 'llm.state.operate'], scopes: { VM: { mode: 'LISTED', workspaceIds: [uuid(9900)] }, LLM: { mode: 'ALL', workspaceIds: [] } }, revision: 42 })
    setup()
    const { user, dialog } = await openPermission()
    expect(within(dialog).getByLabelText(`${member.name} 가상머신 보관된 공간: ${uuid(9900)}`)).toBeChecked()
    await user.click(within(dialog).getByLabelText(`${member.name} 업무: VM 전원 제어`))
    expect(within(dialog).getAllByLabelText(`${member.name} 가상머신 범위`)).toHaveLength(1)
    await user.click(within(dialog).getByRole('button', { name: '권한 변경안 미리보기' }))
    await within(dialog).findByRole('heading', { name: '저장 전 권한 변경 확인' })
    let permission = orgOperationPreviews.at(-1)!.body.members.find((row) => row.userId === member.id)!.permission
    expect(permission.scopes.VM).toEqual({ mode: 'LISTED', workspaceIds: [uuid(9900)] })
    expect(permission.scopes.LLM).toEqual({ mode: 'ALL', workspaceIds: [] })
    await user.click(within(dialog).getByLabelText(`${member.name} 가상머신 보관된 공간: ${uuid(9900)}`))
    await user.click(within(dialog).getByRole('button', { name: '권한 변경안 미리보기' }))
    await within(dialog).findByRole('heading', { name: '저장 전 권한 변경 확인' })
    permission = orgOperationPreviews.at(-1)!.body.members.find((row) => row.userId === member.id)!.permission
    expect(permission.scopes.VM).toEqual({ mode: 'LISTED', workspaceIds: [] })
    expect(permission.scopes.LLM.mode).toBe('ALL')
  })

  test('removing a source retains that original revision in the complete CAS map', async () => {
    const member = addMember(42, { mode: 'SELECTED', work: ['institution.staff.read'], scopes: {}, revision: 39 })
    setup()
    const { user, dialog } = await openPermission()
    await user.click(within(dialog).getByRole('button', { name: `이 기관 담당 자격 회수: ${member.name}` }))
    await user.click(within(dialog).getByRole('button', { name: '권한 변경안 미리보기' }))
    await within(dialog).findByRole('heading', { name: '저장 전 권한 변경 확인' })
    expect(orgOperationPreviews[0].body.expectedPermissionRevisions).toEqual({ [uuid(7)]: 1, [member.id]: 39 })
    expect(orgOperationPreviews[0].body.members.map((row) => row.userId)).toEqual([uuid(7)])
  })

  test('a new selected assignee starts empty and sends a notice-only source with revision zero', async () => {
    setup()
    const { user, dialog } = await openPermission()
    await user.type(within(dialog).getByLabelText('명단에 추가할 사용자 검색'), '홍길동')
    await user.click(await within(dialog).findByRole('button', { name: '추가: 홍길동' }))
    expect(within(dialog).getByLabelText('홍길동 부여 방식')).toHaveValue('SELECTED')
    expect(within(dialog).getByRole('button', { name: '권한 변경안 미리보기' })).toBeDisabled()
    await user.click(within(dialog).getByLabelText('홍길동 업무: 공지 작성·변경'))
    await user.click(within(dialog).getByRole('button', { name: '권한 변경안 미리보기' }))
    await within(dialog).findByRole('heading', { name: '저장 전 권한 변경 확인' })
    expect(orgOperationPreviews[0].body.members.find((row) => row.userId === uuid(42))).toEqual({
      userId: uuid(42), permission: { mode: 'SELECTED', work: ['notice.manage'], scopes: {}, expectedRevision: 0 }, requestMail: false,
    })
  })

  test('switching a listed scope to ALL clears listed identifiers in the submitted payload', async () => {
    const member = addMember(42, { mode: 'SELECTED', work: ['vm.period'], scopes: { VM: { mode: 'LISTED', workspaceIds: [uuid(9900)] } }, revision: 42 })
    setup()
    const { user, dialog } = await openPermission()
    await user.selectOptions(within(dialog).getByLabelText(`${member.name} 가상머신 범위`), 'ALL')
    await user.click(within(dialog).getByRole('button', { name: '권한 변경안 미리보기' }))
    await within(dialog).findByRole('heading', { name: '저장 전 권한 변경 확인' })
    expect(orgOperationPreviews[0].body.members.find((row) => row.userId === member.id)!.permission.scopes.VM)
      .toEqual({ mode: 'ALL', workspaceIds: [] })
  })

  test('an unchanged role with a new authority fingerprint blocks an already reviewed save', async () => {
    const frame = setup(profileWith([], 'FULL'))
    const { user, dialog } = await openPermission()
    await user.click(within(dialog).getByRole('button', { name: '권한 변경안 미리보기' }))
    const save = await within(dialog).findByRole('button', { name: '검토한 기관 권한 저장' })
    expect(save).toBeEnabled()
    const next = profileWith([], 'FULL')
    next.institutionAuthority!.authorityFingerprint = 'new-revision-with-identical-role'
    frame.update(next)
    await within(dialog).findByText(/본인의 권한 문맥이 변경됐습니다/)
    expect(save).toBeDisabled()
    await user.click(save)
    expect(orgOperationSaves).toHaveLength(0)
  })

  test('a lost delegation source cannot be revived by the old editor or display role', async () => {
    const frame = setup(profileWith([], 'FULL'))
    const { dialog } = await openPermission()
    const next = profileWith(['institution.staff.read'])
    next.role = 'ORG_ADMIN'
    next.institutionAuthority!.accountRole = 'ORG_ADMIN'
    frame.update(next)
    await within(dialog).findByText(/편집 중 본인의 권한 문맥이 변경됐습니다/)
    expect(within(dialog).getByRole('button', { name: '권한 변경안 미리보기' })).toBeDisabled()
  })

  test('409 reload preserves a comparison draft and starts from the latest whole roster', async () => {
    const member = addMember(42, { mode: 'SELECTED', work: ['institution.staff.read'], scopes: {}, revision: 40 })
    setup()
    const { user, dialog } = await openPermission()
    await user.click(within(dialog).getByRole('button', { name: `이 기관 담당 자격 회수: ${member.name}` }))
    await user.click(within(dialog).getByRole('button', { name: '권한 변경안 미리보기' }))
    await within(dialog).findByRole('button', { name: '검토한 기관 권한 저장' })
    addMember(58, { mode: 'SELECTED', work: ['institution.staff.read'], scopes: {}, revision: 50 })
    orgOperationRevisions[uuid(1)] = 1
    await user.click(within(dialog).getByRole('button', { name: '검토한 기관 권한 저장' }))
    await within(dialog).findByText('기관 설정이 다른 화면에서 변경됐습니다')
    expect(orgOperationSaves).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: '최신 현재값으로 다시 검토' }))
    await within(dialog).findByText('충돌 전에 작성한 초안 (비교용 · 자동 적용 안 함)')
    expect(within(dialog).getByRole('button', { name: `이 기관 담당 자격 회수: ${member.name}` })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '권한 변경안 미리보기' }))
    await within(dialog).findByRole('button', { name: '검토한 기관 권한 저장' })
    const body = orgOperationPreviews.at(-1)!.body
    expect(body.expectedRevision).toBe(1)
    expect(body.members.map((row) => row.userId).sort()).toEqual([uuid(7), uuid(42), uuid(58)].sort())
    expect(body.expectedPermissionRevisions).toEqual({ [uuid(7)]: 1, [uuid(42)]: 40, [uuid(58)]: 50 })
    expect(orgOperationSaves).toHaveLength(0)
  })

  test('mail-only conflict never retries the old receipt body automatically', async () => {
    setup(profileWith(['institution.request-mail.configure']))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '신청 메일 수신 설정' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('신청 이메일 수신 방식'), 'DESIGNATED')
    await user.click(within(dialog).getByRole('button', { name: '수신 변경안 미리보기' }))
    await within(dialog).findByRole('button', { name: '검토한 수신 설정 저장' })
    orgOperationRevisions[uuid(1)] = 1
    await user.click(within(dialog).getByRole('button', { name: '검토한 수신 설정 저장' }))
    await within(dialog).findByRole('button', { name: '최신 수신 설정 다시 조회' })
    expect(orgMailSaves).toHaveLength(0)
    expect(within(dialog).getByRole('button', { name: '수신 변경안 미리보기' })).toBeDisabled()
  })

  test('mail configuration revocation blocks an already reviewed receipt-only save', async () => {
    const frame = setup(profileWith(['institution.request-mail.configure']))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '신청 메일 수신 설정' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('신청 이메일 수신 방식'), 'DESIGNATED')
    await user.click(within(dialog).getByRole('button', { name: '수신 변경안 미리보기' }))
    const save = await within(dialog).findByRole('button', { name: '검토한 수신 설정 저장' })
    expect(save).toBeEnabled()
    const next = profileWith(['institution.staff.read'])
    next.role = 'ORG_MANAGER'; next.institutionAuthority!.accountRole = 'ORG_MANAGER'
    frame.update(next)
    await within(dialog).findByText(/수신 설정 권한이 없어졌습니다/)
    expect(save).toBeDisabled()
    expect(orgMailSaves).toHaveLength(0)
  })

  test('designated zero saves with a warning and never creates a fallback recipient', async () => {
    setup(profileWith(['institution.request-mail.configure']))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '신청 메일 수신 설정' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('신청 이메일 수신 방식'), 'DESIGNATED')
    await user.click(within(dialog).getByRole('button', { name: '수신 변경안 미리보기' }))
    expect(await within(dialog).findByText('신청 메일을 받을 기관 수신자가 0명입니다.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '검토한 수신 설정 저장' }))
    await screen.findByText(/신청 메일 수신 설정을 버전 1로 저장했습니다/)
    expect(orgMailSaves[0].body.recipientIds).toEqual([])
    expect(evaluateOrgOperations(uuid(1))!.currentMailRecipientCount).toBe(0)
    expect(evaluateOrgOperations(uuid(1))!.legacyFallback).toBe(false)
  })

  test('self permission controls remain locked while the separate mail editor is available', async () => {
    setup(mockAuthorityActor(ACCESS_TOKENS['access-org-admin']))
    const { dialog } = await openPermission()
    expect(within(dialog).getByLabelText('김관리 부여 방식')).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '이 기관 담당 자격 회수: 김관리' })).toBeDisabled()
  })

  test('keyboard opens the editor and Escape restores focus to its trigger', async () => {
    setup()
    const user = userEvent.setup()
    const trigger = await screen.findByRole('button', { name: '기관 권한 편집' })
    trigger.focus(); await user.keyboard('{Enter}')
    await screen.findByRole('dialog', { name: '기관 권한 편집' })
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  test('source revision changes conflict even if the organization revision is unchanged', async () => {
    setup()
    const { user, dialog } = await openPermission()
    await user.click(within(dialog).getByRole('button', { name: '권한 변경안 미리보기' }))
    await within(dialog).findByRole('button', { name: '검토한 기관 권한 저장' })
    orgOperationPermissions[`${uuid(7)}:${uuid(1)}`] = { mode: 'FULL', work: [], scopes: {}, revision: 200 }
    await user.click(within(dialog).getByRole('button', { name: '검토한 기관 권한 저장' }))
    await within(dialog).findByText('기관 설정이 다른 화면에서 변경됐습니다')
    expect(orgOperationSaves).toHaveLength(0)
  })

  test('read failures preserve an explicit retry without claiming a stored result', async () => {
    let calls = 0
    server.use(http.get('*/api/v1/admin/orgs/:orgId/operations', () => { calls += 1; return HttpResponse.json({ status: 503, code: 'UPSTREAM_ERROR', detail: '조회 실패' }, { status: 503 }) }))
    setup()
    const user = userEvent.setup()
    await screen.findByText('조회 실패')
    await user.click(screen.getByRole('button', { name: '다시 조회' }))
    await waitFor(() => expect(calls).toBe(2))
    expect(screen.queryByText(/버전 .*저장했습니다/)).not.toBeInTheDocument()
  })

  test('typed recipient reads distinguish kind, workspace scope and known unlisted workspace IDs', async () => {
    addMember(42, { mode: 'SELECTED', work: ['llm.request.decide'], scopes: { LLM: { mode: 'LISTED', workspaceIds: [uuid(14)] } }, revision: 17 })
    requestStore.push({ ...requestStore[0], id: uuid(8000), orgId: uuid(2), workspaceId: uuid(14), type: 'GPU' })
    setup(profileWith(['institution.request-mail.read']))
    const user = userEvent.setup()
    const kind = await screen.findByLabelText('미리보기 신청 종류')
    await user.selectOptions(kind, 'GPU')
    expect(within(screen.getByLabelText('신청에 연결된 워크스페이스')).queryByRole('option', { name: workspaceStore.find((workspace) => workspace.detail.id === uuid(14))!.detail.name })).not.toBeInTheDocument()
    await user.selectOptions(kind, 'VM')
    await user.selectOptions(screen.getByLabelText('신청에 연결된 워크스페이스'), uuid(12))
    await user.click(screen.getByRole('button', { name: '선택 대상 수신자 조회' }))
    await screen.findByText(`표시 결과 기준: 가상머신 · ${uuid(12)}`)
    expect(screen.getByText('이 종류의 신청 결정 업무 없음')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('미리보기 신청 종류'), 'LLM_API_KEY')
    await user.type(screen.getByLabelText('수신 대상 워크스페이스 ID'), uuid(12))
    await user.click(screen.getByRole('button', { name: '선택 대상 수신자 조회' }))
    expect(await screen.findByText('이 워크스페이스가 담당 범위 밖임')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('수신 대상 워크스페이스 ID'))
    await user.type(screen.getByLabelText('수신 대상 워크스페이스 ID'), uuid(14))
    await user.click(screen.getByRole('button', { name: '선택 대상 수신자 조회' }))
    await waitFor(() => expect(screen.queryByText('이 워크스페이스가 담당 범위 밖임')).not.toBeInTheDocument())
    await screen.findByText(new RegExp(`표시 결과 기준: .*${uuid(14)}`))
    expect(screen.getByText('홍길동')).toBeInTheDocument()
  })

  test('typed mail preview preserves recipients for other kinds and never puts context into the save body', async () => {
    const member = addMember(42, { mode: 'SELECTED', work: ['llm.request.decide'], scopes: { LLM: { mode: 'LISTED', workspaceIds: [uuid(14)] } }, revision: 17 })
    member.managedOrgs![0].requestMail = true
    setup(profileWith(['institution.request-mail.configure']))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '신청 메일 수신 설정' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('신청 이메일 수신 방식'), 'DESIGNATED')
    expect(within(dialog).getByLabelText(`${member.name} 메일 수신자 지정`)).toBeChecked()
    await user.selectOptions(within(dialog).getByLabelText('미리보기 신청 종류'), 'VM')
    await user.type(within(dialog).getByLabelText('수신 대상 워크스페이스 ID'), uuid(12))
    await user.click(within(dialog).getByRole('button', { name: '선택 대상 수신자 조회' }))
    await within(dialog).findByText('이 종류의 신청 결정 업무 없음')
    expect(within(dialog).getByLabelText(`${member.name} 메일 수신자 지정`)).toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: '수신 변경안 미리보기' }))
    await within(dialog).findByRole('heading', { name: '저장 전 수신 설정 확인' })
    expect(orgMailPreviews[0].target).toEqual({ requestType: 'VM', workspaceId: uuid(12) })
    expect(orgMailPreviews[0].body.recipientIds).toEqual([member.id])
    await user.click(within(dialog).getByRole('button', { name: '검토한 수신 설정 저장' }))
    await screen.findByText(/신청 메일 수신 설정을 버전 1로 저장했습니다/)
    expect(orgMailSaves[0].body).toEqual({ expectedRevision: 0, mailMode: 'DESIGNATED', recipientIds: [member.id], reason: null })
    expect(evaluateOrgOperations(uuid(1))!.members.find((row) => row.userId === member.id)!.requestMail).toBe(true)
    expect(orgOperationPermissions[`${member.id}:${uuid(1)}`].revision).toBe(17)
  })

  test('typed eligibility with a newer org revision blocks save without overwriting the global draft', async () => {
    setup(profileWith(['institution.request-mail.configure']))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '신청 메일 수신 설정' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('신청 이메일 수신 방식'), 'DESIGNATED')
    await user.click(within(dialog).getByLabelText('김관리 메일 수신자 지정'))
    orgOperationRevisions[uuid(1)] = 1
    await user.selectOptions(within(dialog).getByLabelText('미리보기 신청 종류'), 'VM')
    await user.type(within(dialog).getByLabelText('수신 대상 워크스페이스 ID'), uuid(12))
    await user.click(within(dialog).getByRole('button', { name: '선택 대상 수신자 조회' }))
    await within(dialog).findByRole('button', { name: '최신 수신 설정 다시 조회' })
    expect(within(dialog).getByLabelText('신청 이메일 수신 방식')).toHaveValue('DESIGNATED')
    expect(within(dialog).getByLabelText('김관리 메일 수신자 지정')).toBeChecked()
    expect(within(dialog).getByRole('button', { name: '수신 변경안 미리보기' })).toBeDisabled()
    expect(orgMailSaves).toHaveLength(0)
  })

  test('an unknown typed workspace is an error until the user explicitly returns to general eligibility', async () => {
    setup(profileWith(['institution.request-mail.read']))
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('미리보기 신청 종류'), 'VM')
    await user.type(screen.getByLabelText('수신 대상 워크스페이스 ID'), uuid(9911))
    await user.click(screen.getByRole('button', { name: '선택 대상 수신자 조회' }))
    await screen.findByText('워크스페이스를 찾을 수 없습니다')
    expect(screen.queryByText('표시 결과 기준: 일반 자격 (종류·공간 미지정)')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '일반 자격 조회로 돌아가기' }))
    await screen.findByText('표시 결과 기준: 일반 자격 (종류·공간 미지정)')
  })
})
