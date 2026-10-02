import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { fetchOrgOperations } from '../api/queries'
import { ACCESS_TOKENS, orgAdminUser, orgManagerUser, orgViewerUser, refreshSuccessHandler, sysAdminUser, sysManagerUser, sysViewerUser } from '../test/msw/handlers/auth'
import { adminUserStore } from '../test/msw/handlers/users'
import { orgOperationModes, orgOperationRevisions, orgOperationSaves } from '../test/msw/handlers/org-operations'
import { auditStore } from '../test/msw/handlers/audit'
import { orgs } from '../test/msw/handlers/reference'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'

function asSystem(path = `/admin/org-operations?org=${uuid(1)}`) {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(path)
}

describe('Organization operation permissions and scope', () => {
  test.each([
    ['access-sys-admin', sysAdminUser, true], ['access-sys-manager', sysManagerUser, false], ['access-sys-viewer', sysViewerUser, false],
    ['access-org-admin', orgAdminUser, true], ['access-org-manager', orgManagerUser, false], ['access-org-viewer', orgViewerUser, false],
  ] as const)('%s reads actual roles and has the matching edit capability', async (token, profile, editable) => {
    server.use(refreshSuccessHandler(token, profile))
    renderApp(`/admin/org-operations?org=${uuid(1)}`)
    expect(await screen.findByRole('heading', { name: '현재 신청 알림 설정' })).toBeInTheDocument()
    expect(!!screen.queryByRole('button', { name: '명단과 수신 설정 편집' })).toBe(editable)
    expect(!!screen.queryByRole('link', { name: '기관 변경 이력' })).toBe(token !== 'access-org-viewer')
  })

  test('the selected organisation role is independent of the highest account role', async () => {
    const token = 'access-org-local-viewer'
    ACCESS_TOKENS[token] = { ...ACCESS_TOKENS['access-org-admin-dual'], managedOrgs: [{ orgId: uuid(1), orgName: orgs[0].name, role: 'ORG_ADMIN', requestMail: false }, { orgId: uuid(2), orgName: orgs[1].name, role: 'ORG_VIEWER', requestMail: false }] }
    server.use(refreshSuccessHandler(token, orgAdminUser))
    renderApp(`/admin/org-operations?org=${uuid(2)}`)
    await screen.findByRole('heading', { name: '현재 신청 알림 설정' })
    expect(screen.queryByRole('button', { name: '명단과 수신 설정 편집' })).not.toBeInTheDocument()
    delete ACCESS_TOKENS[token]
  })

  test('the system catalogue includes disabled institutions and chooses a direct scoped URL', async () => {
    orgs[1].status = 'DISABLED'
    const user = userEvent.setup()
    asSystem('/admin/org-operations')
    const row = (await screen.findByText('테스트 기관')).closest('tr')!
    expect(within(row).getByText('비활성')).toBeInTheDocument()
    await user.click(within(row).getByRole('link', { name: '명단과 수신 설정 보기' }))
    await screen.findByRole('heading', { name: '현재 신청 알림 설정' })
    expect(currentPath()).toBe(`/admin/org-operations?org=${uuid(2)}`)
    expect(screen.getByLabelText('관리 기관 선택')).toHaveValue(uuid(2))
  })

  test('a role holder reads the local assignment rather than an unrelated highest role', async () => {
    const account = adminUserStore.find((row) => row.id === uuid(7))!
    account.managedOrgs[0].role = 'ORG_VIEWER'
    account.managedOrgs.push({ orgId: uuid(2), orgName: '테스트 기관', role: 'ORG_ADMIN', requestMail: false })
    asSystem()
    const row = (await screen.findByRole('link', { name: '김관리' })).closest('tr')!
    expect(within(row).getByText('기관 열람자')).toBeInTheDocument()
    expect(within(row).queryByText('기관 관리자')).not.toBeInTheDocument()
    expect(within(row).getByText('신청 승인권 없음')).toBeInTheDocument()
  })
})

describe('Atomic roster editing and recipient preview', () => {
  test('designated zero is warned, previewed and saved as the full roster without fallback', async () => {
    const user = userEvent.setup()
    asSystem()
    await user.click(await screen.findByRole('button', { name: '명단과 수신 설정 편집' }))
    const dialog = screen.getByRole('dialog', { name: '기관 명단과 수신 설정 편집' })
    await user.selectOptions(within(dialog).getByLabelText('신청 이메일 수신 방식'), 'DESIGNATED')
    await user.click(within(dialog).getByRole('button', { name: '변경안 미리보기' }))
    expect(await within(dialog).findByText('신청 메일을 받을 기관 수신자가 0명입니다.')).toBeInTheDocument()
    expect(orgOperationSaves).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: '검토한 전체 명단 저장' }))
    await screen.findByText(/버전 1로 저장했습니다/)
    expect(orgOperationSaves[0].body).toMatchObject({ expectedRevision: 0, mailMode: 'DESIGNATED', members: [{ userId: uuid(7), role: 'ORG_ADMIN', requestMail: false }] })
    expect(screen.getByText(/신청 메일 수신자가 0명입니다/)).toBeInTheDocument()
  })

  test('a changed draft invalidates the previously reviewed body', async () => {
    const user = userEvent.setup()
    asSystem()
    await user.click(await screen.findByRole('button', { name: '명단과 수신 설정 편집' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '변경안 미리보기' }))
    await within(dialog).findByRole('button', { name: '검토한 전체 명단 저장' })
    await user.click(within(dialog).getByLabelText('김관리 메일 수신자 지정'))
    expect(within(dialog).queryByRole('button', { name: '검토한 전체 명단 저장' })).not.toBeInTheDocument()
    expect(orgOperationSaves).toHaveLength(0)
  })

  test('a conflicting save keeps the draft and requires explicit fresh comparison', async () => {
    const user = userEvent.setup()
    asSystem()
    await user.click(await screen.findByRole('button', { name: '명단과 수신 설정 편집' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('신청 이메일 수신 방식'), 'DESIGNATED')
    await user.click(within(dialog).getByRole('button', { name: '변경안 미리보기' }))
    await within(dialog).findByRole('button', { name: '검토한 전체 명단 저장' })
    orgOperationRevisions[uuid(1)] = 1
    await user.click(within(dialog).getByRole('button', { name: '검토한 전체 명단 저장' }))
    await within(dialog).findByText('기관 설정이 다른 화면에서 변경됐습니다')
    expect(within(dialog).getByRole('button', { name: '변경안 미리보기' })).toBeDisabled()
    expect(orgOperationSaves).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: '최신 현재값으로 다시 검토' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '변경안 미리보기' })).toBeEnabled())
    expect(within(dialog).getByLabelText('신청 이메일 수신 방식')).toHaveValue('DESIGNATED')
    await user.click(within(dialog).getByRole('button', { name: '변경안 미리보기' }))
    await within(dialog).findByRole('button', { name: '검토한 전체 명단 저장' })
    await user.click(within(dialog).getByRole('button', { name: '검토한 전체 명단 저장' }))
    await screen.findByText(/버전 2로 저장했습니다/)
    expect(orgOperationSaves[0].body.expectedRevision).toBe(1)
  })

  test('a system vacancy exception requires reason and exact institution confirmation', async () => {
    const user = userEvent.setup()
    asSystem()
    await user.click(await screen.findByRole('button', { name: '명단과 수신 설정 편집' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '회수: 김관리' }))
    await user.type(within(dialog).getByLabelText('변경 사유'), '긴급 담당 교체')
    await user.click(within(dialog).getByRole('button', { name: '변경안 미리보기' }))
    const save = await within(dialog).findByRole('button', { name: '검토한 전체 명단 저장' })
    expect(save).toBeDisabled()
    await user.click(within(dialog).getByLabelText('관리자 또는 승인자 공백 예외를 적용합니다'))
    await user.type(within(dialog).getByLabelText('예외 대상 기관 이름 확인'), '정보컴퓨터공학부 실습지원센터')
    expect(save).toBeEnabled()
    await user.click(save)
    await screen.findByText(/버전 1로 저장했습니다/)
    expect(orgOperationSaves[0].body).toMatchObject({ members: [], allowVacancy: true, confirmedOrgId: uuid(1), reason: '긴급 담당 교체' })
  })

  test('an institution editor keeps its own role locked while editing its mail choice', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp(`/admin/org-operations?org=${uuid(1)}`)
    await user.click(await screen.findByRole('button', { name: '명단과 수신 설정 편집' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: '회수: 김관리' })).toBeDisabled()
    expect(within(dialog).getByLabelText('김관리 기관 역할')).toBeDisabled()
    expect(within(dialog).getByLabelText('김관리 메일 수신자 지정')).toBeEnabled()
    expect(within(dialog).queryByLabelText('관리자 또는 승인자 공백 예외를 적용합니다')).not.toBeInTheDocument()
  })

  test('the mock enforces the forbidden self-role and system-account boundaries', async () => {
    asSystem()
    await screen.findByRole('heading', { name: '현재 신청 알림 설정' })
    for (const [token, members] of [
      ['access-org-admin', []],
      ['access-sys-admin', [{ userId: uuid(5), role: 'ORG_ADMIN', requestMail: false }]],
    ] as const) {
      const response = await fetch(`/api/v1/admin/orgs/${uuid(1)}/operations/preview`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: 0, mailMode: null, members }) })
      expect(response.status).toBe(403)
      expect((await response.json()).code).toBe('ACCESS_DENIED')
    }
  })

  test('requester and inactive exclusions are displayed without changing the saved roster', async () => {
    const user = userEvent.setup()
    orgOperationModes[uuid(1)] = 'DESIGNATED'
    adminUserStore.find((row) => row.id === uuid(7))!.managedOrgs[0].requestMail = true
    const inactive = adminUserStore.find((row) => row.id === uuid(42))!
    inactive.status = 'DISABLED'
    inactive.managedOrgs = [{ orgId: uuid(1), orgName: orgs[0].name, role: 'ORG_MANAGER', requestMail: true }]
    asSystem()
    await screen.findByRole('heading', { name: '현재 신청 알림 설정' })
    await user.type(screen.getByLabelText('신청자 제외 미리보기'), uuid(7))
    await user.click(screen.getByRole('button', { name: '수신자 확인' }))
    expect(await screen.findByText('신청자 본인')).toBeInTheDocument()
    expect(screen.getByText('계정 비활성')).toBeInTheDocument()
    expect(orgOperationSaves).toHaveLength(0)
    expect(adminUserStore.find((row) => row.id === uuid(7))!.managedOrgs[0].requestMail).toBe(true)
  })

  test('a role change clears a recipient designation before atomic preview and save', async () => {
    const account = adminUserStore.find((row) => row.id === uuid(42))!
    account.managedOrgs = [{ orgId: uuid(1), orgName: orgs[0].name, role: 'ORG_MANAGER', requestMail: true }]
    const user = userEvent.setup()
    asSystem()
    await user.click(await screen.findByRole('button', { name: '명단과 수신 설정 편집' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('홍길동 기관 역할'), 'ORG_VIEWER')
    expect(within(dialog).getByLabelText('홍길동 메일 수신자 지정')).toBeDisabled()
    expect(within(dialog).getByLabelText('홍길동 메일 수신자 지정')).not.toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: '변경안 미리보기' }))
    await within(dialog).findByRole('button', { name: '검토한 전체 명단 저장' })
    await user.click(within(dialog).getByRole('button', { name: '검토한 전체 명단 저장' }))
    await screen.findByText(/버전 1로 저장했습니다/)
    expect(orgOperationSaves[0].body.members).toContainEqual({ userId: uuid(42), role: 'ORG_VIEWER', requestMail: false })
  })
})

describe('Institution navigation and target audit', () => {
  test('complete arrays support page boundaries and URL searches without omitting save members', async () => {
    const template = adminUserStore.find((row) => row.id === uuid(7))!
    for (let index = 0; index < 100; index++) adminUserStore.push({ ...template, id: uuid(1000 + index), name: `명단${String(index).padStart(3, '0')}`, email: `staff${index}@example.test`, managedOrgs: [{ orgId: uuid(1), orgName: orgs[0].name, role: 'ORG_MANAGER', requestMail: false }] })
    const user = userEvent.setup()
    asSystem(`/admin/org-operations?org=${uuid(1)}&page=5`)
    await screen.findByText('전체 기관 역할 101명 · 조건에 맞는 명단 101명')
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2)
    await user.type(screen.getByLabelText('기관 명단 검색'), '명단099')
    expect(currentPath()).toContain('q=')
    expect(currentPath()).not.toContain('page=')
    await user.click(screen.getByRole('button', { name: '명단과 수신 설정 편집' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('신청 이메일 수신 방식'), 'DESIGNATED')
    await user.click(within(dialog).getByRole('button', { name: '변경안 미리보기' }))
    await within(dialog).findByRole('button', { name: '검토한 전체 명단 저장' })
    await user.click(within(dialog).getByRole('button', { name: '검토한 전체 명단 저장' }))
    await screen.findByText(/버전 1로 저장했습니다/)
    expect(orgOperationSaves[0].body.members).toHaveLength(101)
  })

  test('an institution finds its changes by target organisation and sees before and after snapshots', async () => {
    auditStore.unshift({ ...auditStore[0], id: uuid(9000), actorName: '이시스템', actorRole: 'SYS_ADMIN', actorOrgId: null, action: 'org.operations_update', targetType: 'org', targetId: uuid(1), targetOrgId: uuid(1), targetOrgName: orgs[0].name,
      detail: { reason: '수신자 교체', before: { revision: 1, mailMode: 'DESIGNATED', members: [{ userId: uuid(7), role: 'ORG_ADMIN', requestMail: true }] }, after: { revision: 2, mailMode: 'DESIGNATED', members: [{ userId: uuid(7), role: 'ORG_ADMIN', requestMail: false }] } } })
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp(`/admin/audit?org=${uuid(1)}&targetOrgId=${uuid(1)}`)
    const table = await screen.findByRole('table')
    const row = within(table).getByText('기관 명단과 수신 설정 변경').closest('tr')!
    expect(within(row).getByText('이시스템')).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: '상세 보기' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '변경 전' })).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: '변경 후' })).toBeInTheDocument()
    expect(within(dialog).getByText('변경 사유: 수신자 교체')).toBeInTheDocument()
  })

  test('a user link opens the actual user detail and can return to the institution', async () => {
    const user = userEvent.setup()
    asSystem()
    await user.click(await screen.findByRole('link', { name: '김관리' }))
    expect(await screen.findByRole('dialog', { name: '사용자 상세' })).toBeInTheDocument()
    expect(currentPath()).toContain(`selected=${uuid(7)}`)
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('link', { name: '기관 운영' }))
    await screen.findByRole('heading', { name: '현재 신청 알림 설정' })
    expect(currentPath()).toBe(`/admin/org-operations?org=${uuid(1)}`)
  })

  test('read failures offer an explicit retry', async () => {
    let calls = 0
    server.use(http.get('*/api/v1/admin/orgs/:orgId/operations', async () => { calls += 1; return HttpResponse.json({ type: 'about:blank', status: 503, code: 'UPSTREAM_ERROR', detail: '조회 실패' }, { status: 503 }) }))
    const user = userEvent.setup()
    asSystem()
    await screen.findByText('조회 실패')
    await user.click(screen.getByRole('button', { name: '다시 조회' }))
    await waitFor(() => expect(calls).toBe(2))
    expect(screen.queryByText('저장됨')).not.toBeInTheDocument()
  })

  test('a global catalogue failure is distinct from a successful empty catalogue', async () => {
    let calls = 0
    server.use(http.get('*/api/v1/admin/orgs', async () => { calls += 1; await delay(20); return calls === 1 ? HttpResponse.json({ status: 503, code: 'UPSTREAM_ERROR' }, { status: 503 }) : HttpResponse.json([]) }))
    const user = userEvent.setup()
    asSystem('/admin/org-operations')
    expect(await screen.findByLabelText('기관 목록 불러오는 중')).toBeInTheDocument()
    expect(screen.queryByText('등록된 기관이 없습니다.')).not.toBeInTheDocument()
    await screen.findByRole('button', { name: '기관 목록 다시 조회' })
    expect(screen.queryByText('등록된 기관이 없습니다.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '기관 목록 다시 조회' }))
    expect(await screen.findByText('등록된 기관이 없습니다.')).toBeInTheDocument()
    expect(calls).toBe(2)
  })

  test('a late save refreshes caches without adding feedback to a different target', async () => {
    const user = userEvent.setup()
    asSystem()
    await user.click(await screen.findByRole('button', { name: '명단과 수신 설정 편집' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '변경안 미리보기' }))
    await within(dialog).findByRole('button', { name: '검토한 전체 명단 저장' })
    const snapshot = await fetchOrgOperations(uuid(1))
    let completed = false
    server.use(http.put('*/api/v1/admin/orgs/:orgId/operations', async () => { await delay(200); completed = true; return HttpResponse.json({ ...snapshot, revision: 1 }) }))
    await user.click(within(dialog).getByRole('button', { name: '검토한 전체 명단 저장' }))
    await user.click(within(dialog).getAllByRole('link', { name: '김관리' })[0])
    await screen.findByRole('dialog', { name: '사용자 상세' })
    await waitFor(() => expect(completed).toBe(true))
    expect(screen.queryByText('저장됨')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '사용자 상세' })).toBeInTheDocument()
  })
})
