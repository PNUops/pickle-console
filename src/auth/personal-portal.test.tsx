import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { components } from '../api/schema'
import { resetMfaEnrollmentRequired } from '../api/mfa-enrollment'
import { USER_ROLE_LABELS } from '../lib/labels'
import { ACCESS_TOKENS, refreshSuccessHandler, sysAdminProfile, USER_PASSWORD } from '../test/msw/handlers/auth'
import { currentTerms } from '../test/msw/handlers/consent'
import { setSystemStatus } from '../test/msw/handlers/reference'
import { createdRequestBodies, requestStore } from '../test/msw/handlers/requests'
import { workspaceStore } from '../test/msw/handlers/workspaces'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { currentPath, renderApp } from '../test/render'

const administratorTokens = [
  'access-org-viewer', 'access-org-manager', 'access-org-admin',
  'access-sys-viewer', 'access-sys-manager', 'access-sys-admin',
] as const

beforeEach(resetMfaEnrollmentRequired)
afterEach(resetMfaEnrollmentRequired)

test.each(administratorTokens)('%s can open a personal request directly', async (token) => {
  const profile = ACCESS_TOKENS[token]
  server.use(refreshSuccessHandler(token, profile))
  renderApp('/console/requests/new?kind=VM')

  expect(await screen.findByRole('heading', { name: '리소스 신청' })).toBeInTheDocument()
  expect(await screen.findByLabelText('이름')).toBeInTheDocument()
  expect(currentPath()).toBe('/console/requests/new?kind=VM')
})

test.each(administratorTokens)('%s keeps the administrator home after default login', async (token) => {
  server.use(refreshSuccessHandler(token, ACCESS_TOKENS[token]))
  renderApp('/login')

  await screen.findByRole('heading', { name: '관리자 대시보드' })
  expect(currentPath().split('?')[0]).toBe('/admin')
})

test.each(administratorTokens)('%s switches both consoles without exchanging the session', async (token) => {
  const profile = ACCESS_TOKENS[token]
  const refresh = vi.fn()
  const login = vi.fn()
  const logout = vi.fn()
  server.use(
    refreshSuccessHandler(token, profile, refresh),
    http.post('*/api/v1/auth/login', () => { login(); return new HttpResponse(null, { status: 500 }) }),
    http.post('*/api/v1/auth/logout', () => { logout(); return new HttpResponse(null, { status: 204 }) }),
  )
  const user = userEvent.setup()
  renderApp(`/admin?org=${uuid(1)}`)
  await screen.findByRole('heading', { name: '관리자 대시보드' })
  await user.click(screen.getByRole('button', { name: `${profile.name} 계정 메뉴` }))
  await user.click(screen.getByRole('button', { name: '사용자 콘솔' }))
  await screen.findByRole('heading', { name: '대시보드' })
  expect(currentPath()).toBe('/console')

  await user.click(screen.getByRole('button', { name: `${profile.name} 계정 메뉴` }))
  expect(screen.getByRole('button', { name: '내 활동' })).toBeInTheDocument()
  expect(screen.getByText(USER_ROLE_LABELS[profile.role])).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '계정 설정' }))
  await screen.findByRole('heading', { name: '계정 설정' })
  expect(currentPath()).toBe('/console/account')
  await user.click(screen.getByRole('button', { name: `${profile.name} 계정 메뉴` }))
  await user.click(screen.getByRole('button', { name: '관리자 콘솔' }))
  await screen.findByRole('heading', { name: '관리자 대시보드' })
  expect(currentPath().split('?')[0]).toBe('/admin')
  expect(refresh).toHaveBeenCalledTimes(1)
  expect(login).not.toHaveBeenCalled()
  expect(logout).not.toHaveBeenCalled()
})

test('a regular user receives no administrator console switch', async () => {
  server.use(refreshSuccessHandler('access-user'))
  renderApp('/console')
  await userEvent.click(await screen.findByRole('button', { name: '홍길동 계정 메뉴' }))
  expect(screen.queryByRole('button', { name: '관리자 콘솔' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '내 활동' })).toBeInTheDocument()
})

test('a signed-out administrator returns to the requested personal form after login', async () => {
  const profile = ACCESS_TOKENS['access-org-admin']
  const user = userEvent.setup()
  renderApp('/console/requests/new?kind=VM')
  await screen.findByRole('heading', { name: '로그인' })
  await user.type(screen.getByLabelText('이메일'), profile.email)
  await user.type(screen.getByLabelText('비밀번호'), USER_PASSWORD)
  await user.click(screen.getByRole('button', { name: '로그인' }))
  await screen.findByRole('heading', { name: '리소스 신청' })
  expect(currentPath()).toBe('/console/requests/new?kind=VM')
})

test('organization MFA enrollment remains optional and visible in the personal console', async () => {
  server.use(refreshSuccessHandler('access-org-viewer', ACCESS_TOKENS['access-org-viewer']))
  renderApp('/console')
  await screen.findByRole('heading', { name: '대시보드' })
  expect(screen.getByRole('link', { name: '지금 등록하기' })).toHaveAttribute('href', '/admin/account?enroll=2fa')
  await userEvent.click(screen.getByRole('button', { name: '2단계 인증 권유 닫기' }))
  expect(screen.queryByRole('link', { name: '지금 등록하기' })).not.toBeInTheDocument()
  expect(currentPath()).toBe('/console')
})

test('administrator guide actions remain usable in a personal workspace', async () => {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminProfile))
  renderApp(`/console/${uuid(12)}/docs/start`)
  await screen.findByRole('heading', { name: '처음 시작하기' })
  expect(screen.getByRole('link', { name: '리소스 신청' })).toHaveAttribute('href', `/console/${uuid(12)}/requests/new`)
  expect(screen.getByRole('link', { name: '내 워크스페이스' })).toHaveAttribute('href', '/console/workspaces')
})

test('a personal workspace deep link remains distinct from the administrator institution', async () => {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminProfile))
  renderApp(`/console/${uuid(12)}/vms`)
  await screen.findByRole('heading', { name: '가상머신' })
  expect(currentPath()).toBe(`/console/${uuid(12)}/vms`)
  expect(screen.getByRole('link', { name: '리소스 신청' })).toHaveAttribute('href', `/console/${uuid(12)}/requests/new`)
  await userEvent.click(screen.getByRole('button', { name: '이시스템 계정 메뉴' }))
  await userEvent.click(screen.getByRole('button', { name: '관리자 콘솔' }))
  await screen.findByRole('heading', { name: '관리자 대시보드' })
  expect(currentPath()).not.toContain('workspaceId=')
})

test('an administrator without a workspace can create one and submit a personal request', async () => {
  workspaceStore.splice(0, workspaceStore.length)
  const bearers: string[] = []
  const actorOf = (request: Request) => {
    const bearer = request.headers.get('Authorization') ?? ''
    bearers.push(bearer)
    return ACCESS_TOKENS[bearer.replace('Bearer ', '')]
  }
  server.use(
    refreshSuccessHandler('access-sys-admin', sysAdminProfile),
    http.get('*/api/v1/me', () => HttpResponse.json({ ...sysAdminProfile, memberships: [] })),
    http.get('*/api/v1/workspaces', ({ request }) => {
      const actor = actorOf(request)
      if (!actor) return new HttpResponse(null, { status: 401 })
      return HttpResponse.json(workspaceStore.flatMap((record) => {
        const membership = record.members.find((member) => member.userId === actor.id)
        return membership ? [{ ...record.detail, myRole: membership.role, memberCount: record.members.length }] : []
      }))
    }),
    http.post('*/api/v1/workspaces', async ({ request }) => {
      const actor = actorOf(request)
      if (!actor) return new HttpResponse(null, { status: 401 })
      const body = await request.json() as components['schemas']['CreateWorkspaceRequest']
      const record = {
        detail: { id: uuid(9001), kind: body.kind, name: body.name, description: body.description ?? null, myRole: 'OWNER' as const, createdAt: '2026-10-18T19:00:00+09:00' },
        members: [{ userId: actor.id, name: actor.name, email: actor.email, role: 'OWNER' as const }],
      }
      workspaceStore.push(record)
      return HttpResponse.json({ ...record.detail, members: record.members }, { status: 201 })
    }),
    http.post('*/api/v1/requests', async ({ request }) => {
      const actor = actorOf(request)
      if (!actor) return new HttpResponse(null, { status: 401 })
      const body = await request.json() as components['schemas']['CreateRequestRequest']
      const workspace = workspaceStore.find((record) => record.detail.id === body.workspaceId)
      if (body.approval || !workspace?.members.some((member) => member.userId === actor.id && member.role === 'OWNER')) {
        return new HttpResponse(null, { status: 403 })
      }
      createdRequestBodies.push(body)
      const created = {
        ...requestStore[0], id: uuid(9002), displayName: body.displayName,
        workspaceId: workspace.detail.id, workspaceName: workspace.detail.name,
        requesterId: actor.id, requesterName: actor.name, status: 'SUBMITTED' as const, review: null,
      }
      requestStore.push(created)
      return HttpResponse.json(created, { status: 201 })
    }),
  )
  const user = userEvent.setup()
  renderApp('/console/workspaces')
  await screen.findByText('속한 워크스페이스가 없습니다. 새 워크스페이스를 만들어 시작해 보세요.')
  await user.click(screen.getByRole('button', { name: '새 워크스페이스 만들기' }))
  await user.selectOptions(screen.getByLabelText('유형'), 'PROJECT')
  await user.type(screen.getByLabelText('워크스페이스 이름'), '개인 연구 프로젝트')
  await user.click(screen.getByRole('button', { name: '만들기' }))
  await screen.findByRole('heading', { name: '개인 연구 프로젝트' })
  expect(workspaceStore[0].members[0].userId).toBe(sysAdminProfile.id)
  await user.click(screen.getByRole('link', { name: '리소스 신청' }))
  await user.click(await screen.findByRole('radio', { name: /가상머신/ }))
  expect(await screen.findByLabelText('이름')).toBeInTheDocument()
  expect(currentPath()).toContain('/console/requests/new?kind=VM')
  await user.type(screen.getByLabelText('이름'), '개인 연구 서버')
  await user.click(screen.getByRole('radio', { name: 'Ubuntu' }))
  await user.click(screen.getByRole('radio', { name: /컴퓨팅 최적화/ }))
  await user.click(screen.getByRole('button', { name: '다음' }))
  await user.click(await screen.findByRole('radio', { name: '개인 연구 프로젝트' }))
  await user.click(screen.getByRole('radio', { name: '정보컴퓨터공학부 실습지원센터' }))
  await user.type(screen.getByLabelText('사용 목적'), '개인 연구 환경')
  await user.click(screen.getByRole('radio', { name: /이번 학기/ }))
  await user.click(screen.getByRole('button', { name: '다음' }))
  expect(screen.queryByRole('button', { name: '제출하고 승인' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '신청 제출' }))
  await screen.findByRole('heading', { name: '신청이 접수되었습니다' })
  expect(createdRequestBodies).toHaveLength(1)
  expect(createdRequestBodies[0].approval).toBeUndefined()
  expect(createdRequestBodies[0].workspaceId).toBe(workspaceStore[0].detail.id)
  expect(requestStore.at(-1)?.status).toBe('SUBMITTED')
  expect(requestStore.at(-1)?.requesterId).toBe(sysAdminProfile.id)
  expect(bearers.length).toBeGreaterThanOrEqual(3)
  expect(new Set(bearers)).toEqual(new Set(['Bearer access-sys-admin']))
  // The fixture must reject an unrelated account instead of accepting any Bearer.
  const denied = await fetch(new URL('/api/v1/requests', window.location.origin), {
    method: 'POST',
    headers: { Authorization: 'Bearer access-user', 'Content-Type': 'application/json' },
    body: JSON.stringify(createdRequestBodies[0]),
  })
  expect(denied.status).toBe(403)
  expect(createdRequestBodies).toHaveLength(1)
})

test('personal console entry preserves pending consent before the profile gate', async () => {
  server.use(
    refreshSuccessHandler('access-sys-admin', sysAdminProfile),
    http.get('*/api/v1/me', () => HttpResponse.json({ ...sysAdminProfile, pendingConsents: currentTerms, profileComplete: false })),
  )
  renderApp('/console/requests/new')
  await screen.findByRole('heading', { name: '약관 재동의가 필요합니다' })
  expect(screen.queryByRole('heading', { name: '직책과 소속을 입력해 주세요' })).not.toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: '콘솔 메뉴' })).not.toBeInTheDocument()
})

test('personal console entry preserves the incomplete profile gate', async () => {
  server.use(
    refreshSuccessHandler('access-sys-admin', sysAdminProfile),
    http.get('*/api/v1/me', () => HttpResponse.json({ ...sysAdminProfile, profileComplete: false })),
  )
  renderApp('/console/requests/new')
  await screen.findByRole('heading', { name: '직책과 소속을 입력해 주세요' })
  expect(screen.queryByRole('navigation', { name: '콘솔 메뉴' })).not.toBeInTheDocument()
})

test('a personal console request requiring MFA still redirects to enrollment', async () => {
  let denials = 0
  server.use(
    refreshSuccessHandler('access-sys-admin', sysAdminProfile),
    http.get('*/api/v1/workspaces', () => {
      denials += 1
      return HttpResponse.json({ status: 403, code: 'MFA_ENROLLMENT_REQUIRED', title: '2단계 인증 등록이 필요합니다' }, { status: 403 })
    }),
  )
  renderApp('/console/vms')
  await waitFor(() => expect(currentPath()).toMatch(/^\/admin\/account(?:\?|$)/))
  expect(denials).toBeGreaterThan(0)
})

test('administrator maintenance access remains available in the personal console', async () => {
  setSystemStatus({ maintenance: true })
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminProfile))
  renderApp('/console')
  await screen.findByText(/점검 모드가 켜져 있습니다/)
  expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '서비스 점검 중' })).not.toBeInTheDocument()
})
