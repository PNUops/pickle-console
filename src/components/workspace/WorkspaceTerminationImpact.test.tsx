import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, test, vi } from 'vitest'
import type { WorkspaceTerminationImpact } from '../../api/workspace-termination'
import { renderApp } from '../../test/render'
import { server } from '../../test/msw/server'
import { uuid } from '../../test/msw/ids'
import { refreshSuccessHandler, orgManagerUser, orgAdminUser, orgViewerUser, sysAdminUser, sysManagerUser, sysViewerUser } from '../../test/msw/handlers/auth'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import App from '../../App'
import { AuthProvider } from '../../auth/AuthProvider'
import { ToastProvider } from '../ui'

const ownerPath = '*/api/v1/workspaces/:workspaceId/termination-impact'
const adminPath = '*/api/v1/admin/workspaces/:workspaceId/termination-impact'
const invitationPath = '*/api/v1/workspaces/:workspaceId/invitations/:invitationId/termination-impact'
afterEach(() => vi.unstubAllEnvs())

function renderContext(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '*', element: <QueryClientProvider client={client}><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></QueryClientProvider> }], { initialEntries: [route] })
  render(<RouterProvider router={router} />)
  return router
}

function impactFixture(overrides: Partial<WorkspaceTerminationImpact> = {}): WorkspaceTerminationImpact {
  const request = { kind: 'REQUEST' as const, requestId: uuid(201), requestName: '첫 기관 신청', requestStatus: 'SUBMITTED' as const, type: 'VM' as const,
    orgId: uuid(1), orgName: '첫 기관', requestReadable: true, recipientId: null, invitationId: null, userId: null, name: null, invitee: null, userReadable: false, recipientStatus: null, reason: null, resourceId: null, willClose: true }
  return {
    action: 'DELETE_WORKSPACE', workspaceId: uuid(12), workspaceName: '캡스톤 3조', invitationId: null,
    observedAt: '2026-10-16T10:00:00Z', fingerprint: 'same-exact-targets', executable: false, blockedReason: 'REMAINING_RESOURCES',
    summary: { submittedRequests: 1, closingRecipients: 2, failedRecipients: 1, pendingJoinRecipients: 1, queuedRecipients: 1, approvedRecipients: 1, undecidedRecipients: 1 },
    recipientCounts: [{ requestStatus: 'SUBMITTED', recipientStatus: 'QUEUED', count: 1, willClose: true }, { requestStatus: 'APPROVED', recipientStatus: 'PENDING_JOIN', count: 1, willClose: true }, { requestStatus: 'APPROVED', recipientStatus: 'FAILED', count: 1, willClose: false }],
    resourceBlockers: [{ type: 'VM', count: 1 }],
    blockingResources: { page: 0, size: 20, totalElements: 1, totalPages: 1, content: [{ type: 'VM', id: uuid(55), name: '남은 정확한 VM', orgId: uuid(1), orgName: '첫 기관', status: 'CREATING', resourceReadable: true }] },
    targets: { page: 0, size: 20, totalElements: 4, totalPages: 1, content: [request,
      { ...request, kind: 'RECIPIENT', recipientId: uuid(600), name: '승인 전 대상', recipientStatus: 'QUEUED' },
      { ...request, kind: 'RECIPIENT', requestId: uuid(202), requestName: '다른 기관 승인 신청', orgId: uuid(2), orgName: '둘째 기관', recipientId: uuid(601), invitationId: uuid(990), name: null, invitee: 'future@example.test', recipientStatus: 'PENDING_JOIN', requestStatus: 'APPROVED' },
      { ...request, kind: 'RECIPIENT', requestId: uuid(203), requestName: '실패 원본 신청', requestStatus: 'APPROVED', recipientId: uuid(602), name: '실패 원본', recipientStatus: 'FAILED', reason: '합성 등록 실패', willClose: false, requestReadable: false },
    ] },
    ...overrides,
  }
}

test('an owner reads whole-workspace effects and separate failure history without writing', async () => {
  const user = userEvent.setup()
  let reads = 0, writes = 0
  server.use(refreshSuccessHandler('access-user'), http.get(ownerPath, ({ request }) => {
    reads++
    expect(new URL(request.url).searchParams.has('orgId')).toBe(false)
    return HttpResponse.json(impactFixture())
  }), http.delete('*/api/v1/workspaces/:workspaceId', () => { writes++; return new HttpResponse(null, { status: 204 }) }))
  renderApp(`/console/workspaces/${uuid(12)}`)
  await user.click(await screen.findByRole('button', { name: '종료 영향 보기' }))
  const modal = within(await screen.findByRole('dialog', { name: '워크스페이스 삭제 영향' }))
  await modal.findByText('선택한 기관과 목록 페이지에 관계없는 전체 워크스페이스 기준')
  expect(modal.getByText('취소될 승인 대기 신청').nextElementSibling).toHaveTextContent('1건')
  expect(modal.getByText('자동 종료될 대상자').nextElementSibling).toHaveTextContent('2명')
  expect(modal.getByText('자동 종료되지 않는 실패 이력').nextElementSibling).toHaveTextContent('1명')
  expect(modal.getByRole('region', { name: '남은 실제 리소스' })).toHaveTextContent('가상머신: 1개')
  expect(modal.getByText('실패 원본 신청')).not.toHaveAttribute('href')
  expect(modal.getByRole('link', { name: '다른 기관 승인 신청' })).toHaveAttribute('href', `/console/requests/${uuid(202)}?returnTo=${encodeURIComponent(`/console/workspaces/${uuid(12)}`)}`)
  expect(reads).toBe(1)
  expect(writes).toBe(0)
})

test('support impact reads ignore the selected institution and link to the actual request institution', async () => {
  const user = userEvent.setup()
  const requests: string[] = []
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser), http.get(adminPath, ({ request }) => { requests.push(request.url); return HttpResponse.json(impactFixture()) }))
  const source = `/admin/workspaces?workspaceId=${uuid(12)}&inspect=1&org=${uuid(2)}`
  renderApp(source)
  await user.click(await screen.findByRole('button', { name: '종료 영향 보기' }))
  const modal = within(await screen.findByRole('dialog', { name: '워크스페이스 삭제 영향' }))
  const link = new URL((await modal.findAllByRole('link', { name: '첫 기관 신청' }))[0].getAttribute('href')!, 'https://pickle.invalid')
  expect(link.searchParams.get('org')).toBe(uuid(1))
  expect(link.searchParams.get('returnTo')).toContain(`workspaceId=${uuid(12)}`)
  expect(requests).toHaveLength(1)
  expect([...new URL(requests[0]).searchParams.keys()].sort()).toEqual(['page', 'resourcePage', 'size'])
})

test('a pending invitation reads its exact identifier and shows effects spanning requests', async () => {
  const user = userEvent.setup()
  const ids: string[] = []
  server.use(refreshSuccessHandler('access-user'), http.get(invitationPath, ({ params }) => {
    ids.push(String(params.invitationId))
    const original = impactFixture()
    const target = { ...original.targets.content[2], invitationId: String(params.invitationId) }
    return HttpResponse.json(impactFixture({ action: 'CANCEL_INVITATION', invitationId: String(params.invitationId), executable: true, blockedReason: null, resourceBlockers: [], blockingResources: { page: 0, size: 20, totalElements: 0, totalPages: 0, content: [] },
      summary: { submittedRequests: 0, closingRecipients: 2, failedRecipients: 0, pendingJoinRecipients: 2, queuedRecipients: 0, approvedRecipients: 2, undecidedRecipients: 0 },
      recipientCounts: [{ requestStatus: 'APPROVED', recipientStatus: 'PENDING_JOIN', count: 2, willClose: true }],
      targets: { page: 0, size: 20, totalElements: 2, totalPages: 1, content: [target, { ...target, requestId: uuid(205), requestName: '두 번째 연결 신청', recipientId: uuid(605) }] },
    }))
  }))
  renderApp(`/console/workspaces/${uuid(12)}`)
  await user.click(await screen.findByRole('button', { name: 'jiwoo.han@pusan.ac.kr 종료 영향 보기' }))
  const modal = within(await screen.findByRole('dialog', { name: '초대 취소 영향' }))
  await modal.findByText('이 초대 ID에 연결된 모든 신청 기준')
  expect(ids).toHaveLength(1)
  expect(ids[0]).toBe(uuid(3101))
  expect(modal.getByText('초대 ID:')).toHaveTextContent(ids[0])
  expect(modal.getByText('현재 조회된 조건에서는 초대 취소가 가능합니다. 아직 실행한 결과는 아닙니다.')).toBeInTheDocument()
  expect(modal.getByRole('link', { name: '두 번째 연결 신청' })).toBeInTheDocument()
  expect(modal.queryByRole('link', { name: '첫 기관 신청' })).not.toBeInTheDocument()
})

test.each([403, 503])('a failed observation (%s) is never rendered as zero and can be explicitly retried', async (status) => {
  const user = userEvent.setup()
  let reads = 0
  server.use(refreshSuccessHandler('access-user'), http.get(ownerPath, () => ++reads === 1
    ? HttpResponse.json({ code: status === 403 ? 'WORKSPACE_ROLE_INSUFFICIENT' : 'SERVICE_UNAVAILABLE', status, title: '영향 조회 불가', detail: '합성 조회 실패' }, { status })
    : HttpResponse.json(impactFixture({ targets: { page: 0, size: 20, totalElements: 0, totalPages: 0, content: [] }, summary: { submittedRequests: 0, closingRecipients: 0, failedRecipients: 0, pendingJoinRecipients: 0, queuedRecipients: 0, approvedRecipients: 0, undecidedRecipients: 0 } }))))
  renderApp(`/console/workspaces/${uuid(12)}`)
  await user.click(await screen.findByRole('button', { name: '종료 영향 보기' }))
  const modal = within(await screen.findByRole('dialog', { name: '워크스페이스 삭제 영향' }))
  await modal.findByText('합성 조회 실패')
  expect(modal.queryByText('자동 종료될 대상자')).not.toBeInTheDocument()
  await user.click(modal.getByRole('button', { name: '전체 영향 다시 조회' }))
  await modal.findByText('현재 연결된 종료 대상이나 실패 이력이 없습니다.')
  expect(reads).toBe(2)
})

test('pagination combines only an identical target fingerprint while observation time may change', async () => {
  const user = userEvent.setup()
  const original = impactFixture()
  server.use(refreshSuccessHandler('access-user'), http.get(ownerPath, ({ request }) => {
    const page = Number(new URL(request.url).searchParams.get('page'))
    return HttpResponse.json({ ...original, observedAt: page ? '2026-10-16T10:01:00Z' : original.observedAt, targets: { page, size: 20, totalElements: 4, totalPages: 2, content: original.targets.content.slice(page * 2, page * 2 + 2) } })
  }))
  renderApp(`/console/workspaces/${uuid(12)}`)
  await user.click(await screen.findByRole('button', { name: '종료 영향 보기' }))
  const modal = within(await screen.findByRole('dialog', { name: '워크스페이스 삭제 영향' }))
  await user.click(await modal.findByRole('button', { name: '다음 대상 더 보기' }))
  await modal.findByText(/실패 원본 · 실패/)
  expect(modal.getByRole('heading', { name: '신청과 대상자 (4 / 4건)' })).toBeInTheDocument()
  expect(modal.queryByText(/이전 페이지와 합칠 수 없습니다/)).not.toBeInTheDocument()
})

test('an equal-count target replacement discards all old pages until explicit refresh', async () => {
  const user = userEvent.setup()
  const original = impactFixture()
  let firstPageReads = 0
  server.use(refreshSuccessHandler('access-user'), http.get(ownerPath, ({ request }) => {
    const page = Number(new URL(request.url).searchParams.get('page'))
    if (page === 0) firstPageReads++
    return HttpResponse.json({ ...original, fingerprint: page || firstPageReads > 1 ? 'replaced-exact-targets' : original.fingerprint,
      targets: { page, size: 20, totalElements: 4, totalPages: 2, content: original.targets.content.slice(page * 2, page * 2 + 2) } })
  }))
  renderApp(`/console/workspaces/${uuid(12)}`)
  await user.click(await screen.findByRole('button', { name: '종료 영향 보기' }))
  const modal = within(await screen.findByRole('dialog', { name: '워크스페이스 삭제 영향' }))
  await user.click(await modal.findByRole('button', { name: '다음 대상 더 보기' }))
  await modal.findByText(/이전 페이지와 합칠 수 없습니다/)
  expect(modal.queryByRole('link', { name: '첫 기관 신청' })).not.toBeInTheDocument()
  expect(modal.queryByText('자동 종료될 대상자')).not.toBeInTheDocument()
  await user.click(modal.getByRole('button', { name: '전체 영향 다시 조회' }))
  await modal.findAllByRole('link', { name: '첫 기관 신청' })
  expect(firstPageReads).toBe(2)
})

test('closing and reopening ignores an older delayed observation and restores keyboard focus', async () => {
  const user = userEvent.setup()
  let release: () => void = () => {}
  const pending = new Promise<void>((done) => { release = done })
  let reads = 0
  server.use(refreshSuccessHandler('access-user'), http.get(ownerPath, async () => {
    if (++reads === 1) { await pending; return HttpResponse.json(impactFixture({ workspaceName: '오래된 관측' })) }
    return HttpResponse.json(impactFixture({ workspaceName: '현재 관측' }))
  }))
  renderApp(`/console/workspaces/${uuid(12)}`)
  const trigger = await screen.findByRole('button', { name: '종료 영향 보기' })
  await user.click(trigger)
  await waitFor(() => expect(reads).toBe(1))
  await user.keyboard('{Escape}')
  expect(trigger).toHaveFocus()
  await user.click(trigger)
  await screen.findByRole('heading', { name: '현재 관측' })
  await act(async () => { release(); await pending })
  expect(screen.queryByRole('heading', { name: '오래된 관측' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '현재 관측' })).toBeInTheDocument()
})

test.each([
  ['access-org-admin', orgAdminUser, true], ['access-org-manager', orgManagerUser, true], ['access-org-viewer', orgViewerUser, false],
  ['access-sys-admin', sysAdminUser, true], ['access-sys-manager', sysManagerUser, false], ['access-sys-viewer', sysViewerUser, false],
] as const)('termination observations follow server workspace capabilities for %s', async (token, actor, writable) => {
  server.use(refreshSuccessHandler(token, actor))
  renderApp(`/admin/workspaces?workspaceId=${uuid(12)}&inspect=1&org=${uuid(2)}`)
  await screen.findByRole('heading', { name: '캡스톤 3조' })
  expect(!!screen.queryByRole('button', { name: '종료 영향 보기' })).toBe(writable)
})

test('a workspace member receives no owner termination observation controls', async () => {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/workspaces/${uuid(15)}`)
  await screen.findByRole('heading', { name: '알고리즘 스터디' })
  expect(screen.queryByRole('button', { name: /종료 영향 보기/ })).not.toBeInTheDocument()
})

test('an older observation cannot reopen after a selected institution changes', async () => {
  const user = userEvent.setup()
  let release: () => void = () => {}
  const pending = new Promise<void>((done) => { release = done })
  let started = false
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser), http.get(adminPath, async () => { started = true; await pending; return HttpResponse.json(impactFixture({ workspaceName: '이전 기관 관측' })) }))
  const router = renderContext(`/admin/workspaces?workspaceId=${uuid(12)}&inspect=1&org=${uuid(2)}`)
  try {
    await user.click(await screen.findByRole('button', { name: '종료 영향 보기' }))
    await waitFor(() => expect(started).toBe(true))
    await act(() => router.navigate(`/admin/workspaces?workspaceId=${uuid(12)}&inspect=1&org=${uuid(1)}`))
    await screen.findByRole('heading', { name: '캡스톤 3조' })
    await act(async () => { release(); await pending })
    expect(screen.queryByRole('dialog', { name: '워크스페이스 삭제 영향' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '이전 기관 관측' })).not.toBeInTheDocument()
  } finally { release() }
})

test('rapid repeated opens issue one observation while the first result is pending', async () => {
  const user = userEvent.setup()
  let release: () => void = () => {}
  const pending = new Promise<void>((done) => { release = done })
  let reads = 0
  server.use(refreshSuccessHandler('access-user'), http.get(ownerPath, async () => { reads++; await pending; return HttpResponse.json(impactFixture()) }))
  renderApp(`/console/workspaces/${uuid(12)}`)
  const trigger = await screen.findByRole('button', { name: '종료 영향 보기' })
  try {
    fireEvent.click(trigger)
    fireEvent.click(trigger)
    await waitFor(() => expect(reads).toBe(1))
    expect(screen.queryByText('자동 종료될 대상자')).not.toBeInTheDocument()
    await act(async () => { release(); await pending })
    await screen.findByText('자동 종료될 대상자')
    expect(reads).toBe(1)
    await user.keyboard('{Escape}')
  } finally { release() }
})

test('a response for another exact target fails closed without displaying its rows', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-user'), http.get(ownerPath, () => HttpResponse.json(impactFixture({ workspaceId: uuid(15) }))))
  renderApp(`/console/workspaces/${uuid(12)}`)
  await user.click(await screen.findByRole('button', { name: '종료 영향 보기' }))
  const modal = within(await screen.findByRole('dialog', { name: '워크스페이스 삭제 영향' }))
  await modal.findByText('요청한 대상이나 페이지와 조회 결과가 일치하지 않습니다. 전체 영향을 다시 조회해 주세요.')
  expect(modal.queryByText('자동 종료될 대상자')).not.toBeInTheDocument()
  expect(modal.queryByRole('link', { name: '다른 기관 승인 신청' })).not.toBeInTheDocument()
})

test('registered blockers retain exact IDs, actual institutions, read flags and the disabled GPU screen gate', async () => {
  vi.stubEnv('VITE_GPU_PREVIEW', '0')
  const user = userEvent.setup()
  const original = impactFixture()
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser), http.get(adminPath, () => HttpResponse.json(impactFixture({
    blockingResources: { page: 0, size: 20, totalElements: 4, totalPages: 1, content: [original.blockingResources.content[0],
      { type: 'LLM_API_KEY', id: uuid(170), name: '읽기 제한 키', status: 'PENDING', orgId: uuid(2), orgName: '둘째 기관', resourceReadable: false },
      { type: 'DOMAIN', id: uuid(9101), name: 'exact.example.test', status: 'ACTIVE', orgId: null, orgName: null, resourceReadable: false },
      { type: 'GPU', id: uuid(901), name: '남은 GPU', status: 'ALLOCATED', orgId: uuid(1), orgName: '첫 기관', resourceReadable: true },
    ] },
  }))))
  renderApp(`/admin/workspaces?workspaceId=${uuid(12)}&inspect=1&org=${uuid(2)}`)
  await user.click(await screen.findByRole('button', { name: '종료 영향 보기' }))
  const modal = within(await screen.findByRole('dialog', { name: '워크스페이스 삭제 영향' }))
  const vm = new URL((await modal.findByRole('link', { name: '남은 정확한 VM' })).getAttribute('href')!, 'https://pickle.invalid')
  expect(vm.pathname).toBe(`/admin/vms/${uuid(55)}`)
  expect(vm.searchParams.get('org')).toBe(uuid(1))
  expect(vm.searchParams.get('returnTo')).toContain(`workspaceId=${uuid(12)}`)
  expect(modal.queryByRole('link', { name: 'exact.example.test' })).not.toBeInTheDocument()
  expect(modal.getByText('exact.example.test')).toBeInTheDocument()
  expect(modal.getByText(/기관 정보 미표시/)).toBeInTheDocument()
  expect(modal.getByText('저장 상태: 활성 (ACTIVE)')).toBeInTheDocument()
  expect(modal.queryByText(/연결됨/)).not.toBeInTheDocument()
  expect(modal.getByText('저장 상태: 생성 중')).toBeInTheDocument()
  expect(modal.getByText('저장 상태: 할당됨')).toBeInTheDocument()
  expect(modal.getByText('저장 상태: 발급 전')).toBeInTheDocument()
  expect(modal.getByText('저장 상태는 실제 외부 적용이나 접속 성공을 뜻하지 않습니다. 도메인 갱신·해제·예약 기한은 별도 관측 정보입니다.')).toBeInTheDocument()
  expect(modal.queryByRole('link', { name: '읽기 제한 키' })).not.toBeInTheDocument()
  expect(modal.queryByRole('link', { name: '남은 GPU' })).not.toBeInTheDocument()
  expect(modal.getByText('이 빌드에서는 GPU 조회 화면을 제공하지 않습니다. 정확한 ID로 운영자에게 확인해 주세요.')).toBeInTheDocument()
  expect(modal.getByRole('region', { name: '삭제를 막는 실제 리소스 목록' })).toHaveTextContent(uuid(901))
})

test('target and registered-resource pagination share one fingerprint without duplicating the other list', async () => {
  const user = userEvent.setup()
  const original = impactFixture()
  const queries: string[] = []
  server.use(refreshSuccessHandler('access-user'), http.get(ownerPath, ({ request }) => {
    const params = new URL(request.url).searchParams
    const page = Number(params.get('page')), resourcePage = Number(params.get('resourcePage'))
    queries.push(`${page}:${resourcePage}`)
    return HttpResponse.json({ ...original,
      targets: { page, size: 20, totalElements: 4, totalPages: 2, content: original.targets.content.slice(page * 2, page * 2 + 2) },
      blockingResources: { page: resourcePage, size: 20, totalElements: 2, totalPages: 2, content: [{ ...original.blockingResources.content[0], id: uuid(55 + resourcePage * 2), name: resourcePage ? '두 번째 실제 VM' : '첫 번째 실제 VM' }] },
    })
  }))
  renderApp(`/console/workspaces/${uuid(12)}`)
  await user.click(await screen.findByRole('button', { name: '종료 영향 보기' }))
  const modal = within(await screen.findByRole('dialog', { name: '워크스페이스 삭제 영향' }))
  await user.click(await modal.findByRole('button', { name: '다음 리소스 더 보기' }))
  await modal.findByRole('link', { name: '두 번째 실제 VM' })
  await user.click(modal.getByRole('button', { name: '다음 대상 더 보기' }))
  await modal.findByRole('heading', { name: '신청과 대상자 (4 / 4건)' })
  expect(modal.getAllByRole('link', { name: '첫 번째 실제 VM' })).toHaveLength(1)
  expect(modal.getAllByRole('link', { name: '두 번째 실제 VM' })).toHaveLength(1)
  expect(queries).toEqual(['0:0', '0:1', '1:1'])
})

test('a registered-resource page failure retains known rows and never reports zero blockers', async () => {
  const user = userEvent.setup()
  const original = impactFixture()
  server.use(refreshSuccessHandler('access-user'), http.get(ownerPath, ({ request }) => Number(new URL(request.url).searchParams.get('resourcePage'))
    ? HttpResponse.json({ code: 'SERVICE_UNAVAILABLE', status: 503, detail: '다음 리소스 조회 실패' }, { status: 503 })
    : HttpResponse.json({ ...original, blockingResources: { ...original.blockingResources, totalElements: 2, totalPages: 2 } })))
  renderApp(`/console/workspaces/${uuid(12)}`)
  await user.click(await screen.findByRole('button', { name: '종료 영향 보기' }))
  const modal = within(await screen.findByRole('dialog', { name: '워크스페이스 삭제 영향' }))
  await user.click(await modal.findByRole('button', { name: '다음 리소스 더 보기' }))
  await modal.findByText('다음 리소스 조회 실패')
  expect(modal.getByRole('link', { name: '남은 정확한 VM' })).toBeInTheDocument()
  expect(modal.getByRole('heading', { name: '실제 리소스 (1 / 2개)' })).toBeInTheDocument()
  expect(modal.queryByText('이 종료 작업을 막는 실제 리소스가 없습니다.')).not.toBeInTheDocument()
})

test('a changed resource page invalidates both loaded lists before any refresh', async () => {
  const user = userEvent.setup()
  const original = impactFixture()
  server.use(refreshSuccessHandler('access-user'), http.get(ownerPath, ({ request }) => {
    const resourcePage = Number(new URL(request.url).searchParams.get('resourcePage'))
    return HttpResponse.json({ ...original, fingerprint: resourcePage ? 'same-count-resource-replaced' : original.fingerprint,
      blockingResources: { ...original.blockingResources, page: resourcePage, totalElements: 2, totalPages: 2 },
    })
  }))
  renderApp(`/console/workspaces/${uuid(12)}`)
  await user.click(await screen.findByRole('button', { name: '종료 영향 보기' }))
  const modal = within(await screen.findByRole('dialog', { name: '워크스페이스 삭제 영향' }))
  await user.click(await modal.findByRole('button', { name: '다음 리소스 더 보기' }))
  await modal.findByText(/이전 페이지와 합칠 수 없습니다/)
  expect(modal.queryByRole('link', { name: '남은 정확한 VM' })).not.toBeInTheDocument()
  expect(modal.queryByRole('heading', { name: /신청과 대상자/ })).not.toBeInTheDocument()
})
