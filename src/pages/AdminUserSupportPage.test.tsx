import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { delay, http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui'
import type { UserResourceAccess } from '../api/admin-user-support'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'
import { adminProfilePatches, adminUserStore } from '../test/msw/handlers/users'
import { supportFixture } from '../test/msw/handlers/user-support'
import { orgAdminUser, orgManagerUser, orgViewerUser, refreshSuccessHandler, sysAdminUser, sysManagerUser, sysViewerUser } from '../test/msw/handlers/auth'

test.each([
  ['access-sys-admin', sysAdminUser, true, true, true],
  ['access-sys-manager', sysManagerUser, true, false, false],
  ['access-sys-viewer', sysViewerUser, true, false, false],
  ['access-org-admin', orgAdminUser, false, false, true],
  ['access-org-manager', orgManagerUser, false, false, true],
  ['access-org-viewer', orgViewerUser, false, false, false],
] as const)('support direct URL preserves existing capabilities for %s', async (token, profile, seesProfile, correctsProfile, seesInvitations) => {
  server.use(refreshSuccessHandler(token, profile))
  renderApp(`/admin/users/${uuid(42)}?org=${uuid(1)}`)
  await screen.findByRole('heading', { name: '사용자 관계와 지원' })
  await screen.findByRole('heading', { name: '워크스페이스 관계' })
  expect(screen.queryByRole('dialog', { name: '사용자 상세' })).not.toBeInTheDocument()
  if (seesProfile) expect(await screen.findByText('202012345')).toBeInTheDocument()
  else expect(screen.queryByText('202012345')).not.toBeInTheDocument()
  expect(!!screen.queryByRole('button', { name: '정정' })).toBe(correctsProfile)
  expect(!!screen.queryByText('이 역할에서는 초대 대상 정보를 조회할 수 없습니다.')).toBe(!seesInvitations)
  const requestTable = screen.getByRole('table', { name: '사용자 관련 신청 결과' })
  expect(!!within(requestTable).queryByText('가입 대기')).toBe(seesInvitations)
  expect(!!within(requestTable).queryByText('대상자')).toBe(seesInvitations)
  if (!seesInvitations) expect(within(requestTable).getByText('워크스페이스 구성원')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /대리 로그인|우회/ })).not.toBeInTheDocument()
})

test('workspace-filtered request paging and detail return keep the exact server filter', async () => {
  const user = userEvent.setup()
  const scopes: Array<string | null> = []
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser), http.get('*/api/v1/admin/requests', ({ request }) => { scopes.push(new URL(request.url).searchParams.get('workspaceId')) }))
  const source = `/admin/requests?org=${uuid(1)}&status=all&workspaceId=${uuid(12)}`
  renderApp(source)
  const table = await screen.findByRole('table', { name: '관리자 신청 목록' })
  await user.click(within(table).getAllByRole('link')[0])
  await screen.findByRole('heading', { name: '신청 상세' })
  expect(screen.getByRole('link', { name: '← 신청 목록' })).toHaveAttribute('href', source)
  await user.click(screen.getByRole('link', { name: '← 신청 목록' }))
  await screen.findByRole('table', { name: '관리자 신청 목록' })
  expect(currentPath()).toBe(source)
  expect(scopes.every((scope) => scope === uuid(12))).toBe(true)
})

test('the directory URL restores filters through support detail and explicit list return', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  const source = `/admin/users?org=${uuid(1)}&status=ACTIVE&role=USER&filterOrg=${uuid(1)}&q=${encodeURIComponent('홍길동')}&sort=name`
  renderApp(source)
  await user.click(await screen.findByRole('button', { name: '홍길동' }))
  const drawer = within(await screen.findByRole('dialog', { name: '사용자 상세' }))
  await user.click(await drawer.findByRole('link', { name: '관계와 지원 상세 열기' }))
  await screen.findByRole('heading', { name: '워크스페이스 관계' })
  await user.click(screen.getByRole('link', { name: '← 사용자 목록' }))
  const reopened = await screen.findByRole('dialog', { name: '사용자 상세' })
  await user.keyboard('{Escape}')
  expect(reopened).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: '홍길동' })).toHaveFocus())
  expect(screen.getByLabelText('사용자 검색')).toHaveValue('홍길동')
  expect(screen.getByLabelText('역할 필터')).toHaveValue('USER')
  expect(screen.getByLabelText('기관 필터')).toHaveValue(uuid(1))
  expect(currentPath()).toBe(source)
})

test('a shared user page restores its server page without relying on a selected list row', async () => {
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
  for (let index = 0; index < 15; index += 1) adminUserStore.push({ ...adminUserStore[2], id: uuid(810 + index), name: `사용자${index}`, email: `person${index}@example.test` })
  renderApp('/admin/users?status=ACTIVE&role=USER&sort=name&page=1')
  await screen.findByRole('table', { name: '관리자 사용자 목록' })
  await waitFor(() => expect(new URL(currentPath(), 'https://pickle.invalid').searchParams.get('page')).toBe('1'))
  expect(screen.getByRole('button', { name: '2 페이지' })).toHaveAttribute('aria-current', 'page')
})

test('profile correction previews conditional work and then shows actual joining and resource registration', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(`/admin/users/${uuid(42)}?org=${uuid(1)}`)
  await user.click(await screen.findByRole('button', { name: '정정' }))
  const modal = within(screen.getByRole('dialog', { name: '프로필 정정' }))
  await user.clear(modal.getByLabelText('학번'))
  await user.type(modal.getByLabelText('학번'), '202054321')
  await waitFor(() => expect(modal.getByRole('button', { name: '저장' })).toBeEnabled())
  expect(modal.getByText(/일치하는 대기 초대를 수락할 수 있습니다/)).toBeInTheDocument()
  expect(modal.getByRole('link', { name: '가상머신 신청' })).toHaveAttribute('href', `/admin/requests/${uuid(201)}?org=${uuid(1)}`)
  expect(adminProfilePatches).toHaveLength(0)
  await user.click(modal.getByRole('button', { name: '저장' }))
  const outcome = await screen.findByRole('region', { name: '계정 변경 후 연결 결과' })
  expect(await within(outcome).findByText('연구팀: 가입 완료')).toBeInTheDocument()
  expect(await within(outcome).findByText('자원 등록됨')).toBeInTheDocument()
  expect(await within(outcome).findByText('생성 중')).toBeInTheDocument()
  expect(screen.queryByText('생성 완료')).not.toBeInTheDocument()
  expect(within(outcome).getByRole('link', { name: '실제 자원 보기' })).toHaveAttribute('href', `/admin/vms/${uuid(100)}?org=${uuid(1)}`)
})

test('a global account change observes an impacted request outside the selected institution without broadening the ordinary list', async () => {
  const user = userEvent.setup()
  const all = supportFixture(uuid(42), uuid(1))
  all.requests[0].orgId = uuid(2)
  all.requests[0].orgName = '테스트 기관'
  all.resources[0].orgId = uuid(2)
  all.resources[0].orgName = '테스트 기관'
  let changed = false
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.post('*/api/v1/admin/users/:userId/profile-impact', () => HttpResponse.json({ action: 'PROFILE', userId: uuid(42), observedAt: '2026-10-04T01:00:00Z', candidateStatus: 'ACTIVE', claimsPossible: true, studentNoWillChange: true,
      invitations: [{ id: uuid(501), workspaceId: uuid(11), workspaceName: '연구팀', workspaceKind: 'LAB', role: 'MEMBER', status: 'PENDING', matchedBy: 'EMAIL', acceptedAt: null, alreadyMember: true, recipients: [{ requestId: uuid(201), orgId: uuid(2), type: 'VM', requestStatus: 'APPROVED', status: 'PENDING_JOIN', projectedStatus: 'QUEUED', grantedEndDate: '2026-12-31' }] }] })),
    http.patch('*/api/v1/admin/users/:userId/profile', () => { changed = true }),
    http.get('*/api/v1/admin/users/:userId/support', ({ request }) => {
      if (new URL(request.url).searchParams.get('orgId')) return HttpResponse.json({ ...all, requests: [], resources: [] })
      return HttpResponse.json({ ...all, invitations: all.invitations.map((invitation) => ({ ...invitation, status: changed ? 'ACCEPTED' : 'PENDING' })), requests: all.requests.map((row) => ({ ...row, recipientStatus: 'QUEUED' })) })
    }),
  )
  renderApp(`/admin/users/${uuid(42)}?org=${uuid(1)}`)
  await user.click(await screen.findByRole('button', { name: '정정' }))
  const modal = within(screen.getByRole('dialog', { name: '프로필 정정' }))
  await user.clear(modal.getByLabelText('학번'))
  await user.type(modal.getByLabelText('학번'), '202054321')
  await waitFor(() => expect(modal.getByRole('button', { name: '저장' })).toBeEnabled())
  await user.click(modal.getByRole('button', { name: '저장' }))
  const outcome = within(await screen.findByRole('region', { name: '계정 변경 후 연결 결과' }))
  const actualRequest = await outcome.findByRole('link', { name: '테스트 기관 / 가상머신 신청' })
  expect(actualRequest).toHaveAttribute('href', `/admin/requests/${uuid(201)}?org=${uuid(2)}`)
  expect(outcome.getByText('생성 대기')).toBeInTheDocument()
  expect(outcome.getByRole('link', { name: '플랫폼 전체에서 사용자 관계 다시 조회' })).toHaveAttribute('href', `/admin/users/${uuid(42)}`)
  expect(screen.getByText('현재 관리 범위에서 연결된 신청이 없습니다.')).toBeInTheDocument()
})

test('claiming an invitation for an unapproved request shows approval wait in preview and actual results', async () => {
  const user = userEvent.setup()
  const data = supportFixture(uuid(42), uuid(1))
  let claimed = false
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.post('*/api/v1/admin/users/:userId/profile-impact', () => HttpResponse.json({ action: 'PROFILE', userId: uuid(42), observedAt: '2026-10-04T02:00:00Z', candidateStatus: 'ACTIVE', claimsPossible: true, studentNoWillChange: true,
      invitations: [{ id: uuid(501), workspaceId: uuid(11), workspaceName: '연구팀', workspaceKind: 'LAB', role: 'MEMBER', status: 'PENDING', matchedBy: 'EMAIL', acceptedAt: null, alreadyMember: true, recipients: [{ requestId: uuid(201), orgId: uuid(1), type: 'VM', requestStatus: 'SUBMITTED', status: 'PENDING_JOIN', projectedStatus: 'QUEUED', grantedEndDate: null }] }] })),
    http.patch('*/api/v1/admin/users/:userId/profile', () => { claimed = true }),
    http.get('*/api/v1/admin/users/:userId/support', () => HttpResponse.json({ ...data,
      invitations: data.invitations.map((row) => ({ ...row, status: claimed ? 'ACCEPTED' : 'PENDING' })),
      requests: data.requests.map((row) => ({ ...row, status: 'SUBMITTED', recipientStatus: claimed ? 'QUEUED' : 'PENDING_JOIN', resourceId: null, grantedEndDate: null })),
    })),
  )
  renderApp(`/admin/users/${uuid(42)}?org=${uuid(1)}`)
  await user.click(await screen.findByRole('button', { name: '정정' }))
  const modal = within(screen.getByRole('dialog', { name: '프로필 정정' }))
  await user.clear(modal.getByLabelText('학번'))
  await user.type(modal.getByLabelText('학번'), '202054321')
  await waitFor(() => expect(modal.getByRole('button', { name: '저장' })).toBeEnabled())
  expect(modal.getByText(/현재 가입 대기 → 예상 승인 대기/)).toBeInTheDocument()
  expect(modal.queryByText(/생성 대기/)).not.toBeInTheDocument()
  await user.click(modal.getByRole('button', { name: '저장' }))
  const outcome = within(await screen.findByRole('region', { name: '계정 변경 후 연결 결과' }))
  await outcome.findByText('연구팀: 가입 완료')
  expect(outcome.getByText('승인 대기')).toBeInTheDocument()
  expect(outcome.queryByText('생성 대기')).not.toBeInTheDocument()
  expect(outcome.queryByRole('link', { name: '실제 자원 보기' })).not.toBeInTheDocument()
  const table = screen.getByRole('table', { name: '사용자 관련 신청 결과' })
  expect(within(table).getAllByText('승인 대기')).toHaveLength(2)
  expect(within(table).queryByText('생성 대기')).not.toBeInTheDocument()
})

test('reactivation restored to verification pending does not promise invitation claim or resource creation', async () => {
  const user = userEvent.setup()
  const account = adminUserStore.find((row) => row.id === uuid(42))!
  account.status = 'DISABLED'
  account.statusChanges = [{ fromStatus: 'PENDING_VERIFICATION', toStatus: 'DISABLED', changedAt: '2026-10-04T00:00:00Z' }]
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(`/admin/users/${uuid(42)}?org=${uuid(1)}`)
  await user.click(await screen.findByRole('button', { name: '비활성화 해제' }))
  const modal = within(screen.getByRole('dialog', { name: '계정 재활성화 영향 확인' }))
  await modal.findByText('변경 후 계정 상태: 인증 대기')
  expect(modal.getByText('이 변경만으로 초대 수락이나 자원 생성이 진행되지 않습니다.')).toBeInTheDocument()
  expect(account.status).toBe('DISABLED')
  await user.click(modal.getByRole('button', { name: '영향 확인 후 재활성화' }))
  await waitFor(() => expect(account.status).toBe('PENDING_VERIFICATION'))
})

test('an exact diagnostic target persists in the URL and exposes no actual user operation', async () => {
  const user = userEvent.setup()
  let queried: URL | null = null
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser), http.get('*/api/v1/admin/users/:userId/support/access', ({ request }) => { queried = new URL(request.url) }))
  renderApp(`/admin/users/${uuid(42)}?org=${uuid(1)}`)
  await screen.findByRole('heading', { name: '이 사용자의 접근 조건' })
  await user.type(screen.getByLabelText('자원 ID'), uuid(100))
  await user.click(screen.getByRole('button', { name: '접근 조건 조회' }))
  const result = await screen.findByRole('region', { name: '자원 접근 조회 결과' })
  await within(result).findByRole('heading', { name: 'research-vm' })
  expect(queried!.searchParams.get('resourceId')).toBe(uuid(100))
  expect(queried!.searchParams.get('type')).toBe('VM')
  expect(queried!.searchParams.get('orgId')).toBe(uuid(1))
  expect(currentPath()).toContain(`resourceId=${uuid(100)}`)
  expect(within(result).queryByRole('button', { name: '사용자 지정 권한 회수' })).not.toBeInTheDocument()
})

test('empty scoped results differ from a denied or missing diagnostic target', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser))
  renderApp(`/admin/users/${uuid(42)}?org=${uuid(2)}&resourceType=VM&resourceId=${uuid(100)}`)
  expect(await screen.findByText('현재 관리 범위에서 연결된 신청이 없습니다.')).toBeInTheDocument()
  expect(await screen.findByText('현재 관리 범위에서 연결된 자원이 없습니다.')).toBeInTheDocument()
  expect(await screen.findByText('대상이 없거나 현재 관리 범위에서 조회할 수 없습니다.')).toBeInTheDocument()
  await user.clear(screen.getByLabelText('자원 ID'))
  await user.type(screen.getByLabelText('자원 ID'), 'invalid')
  await user.click(screen.getByRole('button', { name: '접근 조건 조회' }))
  expect(screen.getByText('자원 ID를 UUID 형식으로 입력해 주세요.')).toBeInTheDocument()
})

test('workspace ownership standing does not claim that a missing resource grant permits use', async () => {
  const resource = { ...supportFixture(uuid(42)).resources[0], workspaceRole: 'OWNER', personalGrantRole: null, workspaceGrantRole: null, effectiveRole: null, standingRights: true, baseConditionsSatisfied: false, reasons: ['NO_RESOURCE_GRANT'] }
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser), http.get('*/api/v1/admin/users/:userId/support/access', () => HttpResponse.json(resource)))
  renderApp(`/admin/users/${uuid(42)}?org=${uuid(1)}&resourceType=VM&resourceId=${uuid(100)}`)
  const result = await screen.findByRole('region', { name: '자원 접근 조회 결과' })
  expect(await within(result).findByText('실효 자원 접근 권한이 없습니다.')).toBeInTheDocument()
  expect(within(result).getByText('워크스페이스 소유자의 상시권은 접근 권한 목록과 삭제에 관한 권한이며 자원 이용 등급과 별개입니다.')).toBeInTheDocument()
  expect(within(result).queryByText(/기본 조건을 충족합니다/)).not.toBeInTheDocument()
})

test('an elapsed resource period does not describe a still running VM as externally stopped', async () => {
  const resource = { ...supportFixture(uuid(42)).resources[0], status: 'RUNNING', reasons: ['RESOURCE_ENDED'] }
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser), http.get('*/api/v1/admin/users/:userId/support/access', () => HttpResponse.json(resource)))
  renderApp(`/admin/users/${uuid(42)}?org=${uuid(1)}&resourceType=VM&resourceId=${uuid(100)}`)
  const result = await screen.findByRole('region', { name: '자원 접근 조회 결과' })
  expect(await within(result).findByText('사용 기간이 지났거나 종료 상태입니다.')).toBeInTheDocument()
  expect(within(result).getByText('실행 중')).toBeInTheDocument()
  expect(within(result).queryByText('종료됨')).not.toBeInTheDocument()
})

test('missing or system-tier accounts stay inaccessible to the organization reader', async () => {
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
  renderApp(`/admin/users/${uuid(5)}?org=${uuid(1)}`)
  await screen.findByRole('alert')
  expect(screen.queryByRole('heading', { name: '워크스페이스 관계' })).not.toBeInTheDocument()
})

test('partial recipient failure names the actual request and does not make an applicant-only relation a recipient', async () => {
  const data = supportFixture(uuid(42), uuid(1))
  data.requests = [
    { ...data.requests[0], recipientStatus: 'FAILED', reason: '생성 작업을 다시 확인해 주세요.' },
    { ...data.requests[0], id: uuid(202), recipientId: null, recipientStatus: null, applicant: false, grantedEndDate: null },
  ]
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser), http.get('*/api/v1/admin/users/:userId/support', () => HttpResponse.json(data)))
  renderApp(`/admin/users/${uuid(42)}?org=${uuid(1)}`)
  const table = await screen.findByRole('table', { name: '사용자 관련 신청 결과' })
  expect(within(table).getByText('실패')).toBeInTheDocument()
  expect(within(table).getByText('생성 작업을 다시 확인해 주세요.')).toBeInTheDocument()
  expect(within(table).getByText('워크스페이스 구성원')).toBeInTheDocument()
  expect(within(table).getByText('무기한')).toBeInTheDocument()
  expect(within(table).getAllByRole('link', { name: '가상머신 신청' })[0]).toHaveAttribute('href', `/admin/requests/${uuid(201)}?org=${uuid(1)}`)
})

test('removing the last grant of a nonmember retains the receipt when the relationship disappears', async () => {
  const user = userEvent.setup()
  const account = adminUserStore.find((row) => row.id === uuid(42))!
  account.status = 'DISABLED'
  const data = supportFixture(uuid(42), uuid(1))
  data.memberships = []
  const resource: UserResourceAccess = { ...data.resources[0], workspaceRole: null, personalGrantRole: 'EDITOR', effectiveRole: null, canRevoke: true, revokeReason: 'ALLOWED', reasons: ['ACCOUNT_INACTIVE', 'NOT_WORKSPACE_MEMBER'] }
  let removed = false
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/users/:userId/support', () => HttpResponse.json({ ...data, resources: removed ? [] : [resource] })),
    http.post('*/api/v1/admin/bulk-changes/preview', () => HttpResponse.json({ items: [{ targetId: resource.id, name: '현재 자원 이름', applicable: true, reason: null, fields: [{ field: 'role', oldValue: 'OWNER', newValue: null }], fingerprint: 'newer-state' }] })),
    http.post('*/api/v1/admin/bulk-changes', () => { removed = true; return HttpResponse.json({ batchId: uuid(902), items: [{ targetId: resource.id, name: '현재 자원 이름', result: 'APPLIED', reason: null, fields: [{ field: 'role', oldValue: 'OWNER', newValue: null }] }] }) }),
  )
  renderApp(`/admin/users/${uuid(42)}?org=${uuid(1)}`)
  await user.click(await screen.findByRole('button', { name: '사용자 지정 권한 회수' }))
  const modal = within(screen.getByRole('dialog', { name: '사용자 지정 권한 회수' }))
  await modal.findByText('회수할 등급: 소유자')
  expect(modal.getByText(/대상 자원: 현재 자원 이름/)).toBeInTheDocument()
  await user.click(modal.getByRole('button', { name: '미리보기 확인 후 회수' }))
  await screen.findByText('현재 관리 범위에서 연결된 자원이 없습니다.')
  const receipt = screen.getByRole('region', { name: '최근 권한 회수 결과' })
  expect(within(receipt).getByText(`처리 ID ${uuid(902)}`)).toBeInTheDocument()
  expect(within(receipt).getByText('현재 자원 이름: 적용됨')).toBeInTheDocument()
  expect(within(receipt).getByText(new RegExp(account.id))).toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: '사용자 지정 권한 회수' })).not.toBeInTheDocument()
})

test('an inactive named grant uses exact existing bulk preview and conflict-aware apply before refreshed results', async () => {
  const user = userEvent.setup()
  const account = adminUserStore.find((row) => row.id === uuid(42))!
  account.status = 'DISABLED'
  const data = supportFixture(uuid(42), uuid(1))
  const resource: UserResourceAccess = { ...data.resources[0], personalGrantRole: 'EDITOR', effectiveRole: 'EDITOR', canRevoke: true, revokeReason: 'ALLOWED' }
  let removed = false
  let previewBody: unknown
  let applyBody: unknown
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get('*/api/v1/admin/users/:userId/support', () => HttpResponse.json({ ...data, resources: [{ ...resource, personalGrantRole: removed ? null : 'EDITOR', effectiveRole: 'MEMBER', canRevoke: !removed }] })),
    http.post('*/api/v1/admin/bulk-changes/preview', async ({ request }) => { previewBody = await request.json(); return HttpResponse.json({ items: [{ targetId: resource.id, name: resource.name, applicable: true, reason: null, fields: [{ field: 'role', oldValue: 'EDITOR', newValue: null }], fingerprint: 'current-state' }] }) }),
    http.post('*/api/v1/admin/bulk-changes', async ({ request }) => { applyBody = await request.json(); removed = true; return HttpResponse.json({ batchId: uuid(901), items: [{ targetId: resource.id, name: resource.name, result: 'APPLIED', reason: null, fields: [{ field: 'role', oldValue: 'EDITOR', newValue: null }] }] }) }),
  )
  renderApp(`/admin/users/${uuid(42)}?org=${uuid(1)}`)
  await user.click(await screen.findByRole('button', { name: '사용자 지정 권한 회수' }))
  const modal = within(screen.getByRole('dialog', { name: '사용자 지정 권한 회수' }))
  await waitFor(() => expect(modal.getByRole('button', { name: '미리보기 확인 후 회수' })).toBeEnabled())
  expect(modal.getByText(/대상 사용자: 홍길동/)).toBeInTheDocument()
  expect(modal.getByText(/대상 자원: research-vm/)).toBeInTheDocument()
  expect(previewBody).toEqual({ targetType: 'VM', targetIds: [resource.id], change: { kind: 'ACCESS', access: { action: 'REVOKE', userId: account.id } } })
  expect(removed).toBe(false)
  await user.click(modal.getByRole('button', { name: '미리보기 확인 후 회수' }))
  await modal.findByRole('region', { name: '권한 회수 결과' })
  expect(applyBody).toEqual({ ...(previewBody as object), fingerprints: { [resource.id]: 'current-state' } })
  expect(account.status).toBe('DISABLED')
  await user.click(modal.getByRole('button', { name: '결과 닫기' }))
  expect(screen.queryByRole('button', { name: '사용자 지정 권한 회수' })).not.toBeInTheDocument()
  expect(screen.getByText('사용자 지정 권한: 없음 / 워크스페이스 전체 권한: 참여자')).toBeInTheDocument()
})

test('workspace relationships retain filters through user support and expose scoped resource and request links', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  const source = `/admin/workspaces?org=${uuid(1)}&q=${encodeURIComponent('캡스톤')}&workspaceId=${uuid(12)}&tab=members`
  renderApp(source)
  const drawer = within(await screen.findByRole('dialog', { name: '워크스페이스 상세' }))
  await user.click(await drawer.findByRole('link', { name: '홍길동' }))
  await screen.findByRole('heading', { name: '사용자 관계와 지원' })
  await user.click(screen.getByRole('link', { name: '← 워크스페이스 목록' }))
  const returned = within(await screen.findByRole('dialog', { name: '워크스페이스 상세' }))
  await user.click(await returned.findByRole('tab', { name: '자원과 신청' }))
  await returned.findByRole('link', { name: '도메인 목록' })
  expect(returned.getByRole('link', { name: '도메인 목록' })).toHaveAttribute('href', `/admin/domains?workspaceId=${uuid(12)}&org=${uuid(1)}`)
  expect(returned.getByRole('link', { name: '이 워크스페이스의 신청 보기' })).toHaveAttribute('href', `/admin/requests?status=all&workspaceId=${uuid(12)}&org=${uuid(1)}`)
  expect(screen.getByLabelText('워크스페이스 이름 검색')).toHaveValue('캡스톤')
})

test('a delayed diagnostic from a prior institution cannot overwrite the selected institution', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser), http.get('*/api/v1/admin/users/:userId/support/access', async ({ request }) => {
    if (new URL(request.url).searchParams.get('orgId') === uuid(1)) { await delay(150); return HttpResponse.json({ ...supportFixture(uuid(42)).resources[0], name: '이전 기관의 늦은 자원' }) }
    return HttpResponse.json({ type: 'about:blank', title: '접근 불가', status: 404, detail: '새 기관의 범위 밖입니다.', code: 'RESOURCE_NOT_FOUND' }, { status: 404 })
  }))
  const router = createMemoryRouter([{ path: '*', element: <QueryClientProvider client={client}><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></QueryClientProvider> }], { initialEntries: [`/admin/users/${uuid(42)}?org=${uuid(1)}&resourceType=VM&resourceId=${uuid(100)}`] })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { name: '이 사용자의 접근 조건' })
  fireEvent.change(screen.getByLabelText('관리 기관 선택'), { target: { value: uuid(2) } })
  await act(() => router.navigate(`/admin/users/${uuid(42)}?org=${uuid(2)}&resourceType=VM&resourceId=${uuid(100)}`))
  await screen.findByText('새 기관의 범위 밖입니다.')
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)) })
  expect(screen.queryByText('이전 기관의 늦은 자원')).not.toBeInTheDocument()
})
