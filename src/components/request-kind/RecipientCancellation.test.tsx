import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from '../../App'
import { AuthProvider } from '../../auth/AuthProvider'
import type { RequestDetail, RequestRecipient } from '../../api/queries'
import type { RecipientCancellationImpact, RecipientCancellationReceipt } from '../../api/request-recipient-cancellation'
import { ToastProvider } from '../ui'
import { renderApp } from '../../test/render'
import { server } from '../../test/msw/server'
import { requestStore } from '../../test/msw/handlers/requests'
import { adminRequestStore } from '../../test/msw/handlers/admin'
import { orgManagerUser, orgAdminUser, orgViewerUser, sysAdminUser, sysManagerUser, sysViewerUser, refreshSuccessHandler } from '../../test/msw/handlers/auth'
import { uuid } from '../../test/msw/ids'

const ownerImpact = '*/api/v1/requests/:requestId/recipients/:recipientId/cancellation-impact'
const supportImpact = '*/api/v1/admin/requests/:requestId/recipients/:recipientId/cancellation-impact'
const ownerCancel = '*/api/v1/requests/:requestId/recipients/:recipientId/cancel'
const supportCancel = '*/api/v1/admin/requests/:requestId/recipients/:recipientId/cancel'
const acknowledgement = '선택한 대상과 현재 상태, 생성 대기 취소 효과를 확인했습니다'

function recipient(overrides: Partial<RequestRecipient> = {}): RequestRecipient {
  return { id: uuid(700), userId: uuid(57), name: '정확한 대상', invitee: null, resourceId: null, status: 'QUEUED', reason: null,
    cancellationCapability: { ownerAllowed: true, supportAllowed: false, blockedReason: null }, cancellation: null, ...overrides }
}
function requestFixture(admin = false, overrides: Partial<RequestDetail> = {}): RequestDetail {
  const store = admin ? adminRequestStore : requestStore
  const base = store.find((request) => request.status === 'APPROVED') ?? store[0]
  const request: RequestDetail = { ...base, id: uuid(299), status: 'APPROVED', type: 'VM', recipients: [recipient()], ...overrides }
  store.push(request)
  return request
}
function impact(request: RequestDetail, overrides: Partial<RecipientCancellationImpact> = {}): RecipientCancellationImpact {
  const target = request.recipients[0]
  return { requestId: request.id, workspaceId: request.workspaceId!, recipientId: target.id, type: request.type,
    previousStatus: target.status, previousReason: target.reason, previousAttempts: target.status === 'FAILED' ? 2 : 0,
    allowed: true, blockedReason: null, observedAt: '2026-10-17T00:00:00Z', fingerprint: 'exact-current-recipient', ...overrides }
}
function receipt(request: RequestDetail, overrides: Partial<RecipientCancellationReceipt> = {}): RecipientCancellationReceipt {
  const observed = impact(request)
  return { id: uuid(900), requestId: request.id, workspaceId: request.workspaceId!, recipientId: request.recipients[0].id,
    canceledAt: '2026-10-17T00:01:00Z', reason: '수강 변경', previousStatus: observed.previousStatus,
    previousReason: observed.previousReason, previousAttempts: observed.previousAttempts, ...overrides }
}
function applyReceipt(request: RequestDetail, result: RecipientCancellationReceipt) {
  const target = request.recipients.find((row) => row.id === result.recipientId)!
  target.status = 'CANCELED'
  target.cancellation = result
  target.cancellationCapability = { ownerAllowed: false, supportAllowed: false, blockedReason: '이미 취소된 대상자입니다.' }
}
async function openCancellation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '정확한 대상 생성 대기 취소' }))
  const dialog = within(await screen.findByRole('dialog', { name: '대상자 생성 대기 취소' }))
  await dialog.findByText(/현재 상태:/)
  return dialog
}
async function confirmCancellation(user: ReturnType<typeof userEvent.setup>, dialog: ReturnType<typeof within>, reason = '수강 변경') {
  await user.type(dialog.getByRole('textbox', { name: '취소 사유' }), reason)
  await user.click(dialog.getByRole('checkbox', { name: acknowledgement }))
  await user.click(dialog.getByRole('button', { name: '생성 대기 취소' }))
}
function renderContext(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '*', element: <QueryClientProvider client={client}><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></QueryClientProvider> }], { initialEntries: [route] })
  render(<RouterProvider router={router} />)
  return { router, client }
}

test.each(['VM', 'LLM_API_KEY'] as const)('an owner cancels one approved %s recipient and retains the approval and other rows', async (type) => {
  const user = userEvent.setup()
  const other = recipient({ id: uuid(701), name: '다른 대상', status: 'FAILED', reason: '다른 대상 실패', cancellationCapability: { ownerAllowed: true, supportAllowed: false } })
  const request = requestFixture(false, { type, recipients: [recipient(), other] })
  const originalReview = structuredClone(request.review)
  const writes: unknown[] = []
  server.use(refreshSuccessHandler('access-user'), http.get(ownerImpact, () => HttpResponse.json(impact(request))),
    http.post(ownerCancel, async ({ request: wire }) => { writes.push(await wire.json()); const result = receipt(request); applyReceipt(request, result); return HttpResponse.json(result) }))
  renderApp(`/console/requests/${request.id}`)
  const dialog = await openCancellation(user)
  expect(dialog.getByText('현재 워크스페이스 소유자 자격')).toBeInTheDocument()
  expect(dialog.getByText(request.displayName, { exact: false })).toBeInTheDocument()
  expect(dialog.getByRole('button', { name: '생성 대기 취소' })).toBeDisabled()
  await confirmCancellation(user, dialog, '  수강 변경  ')
  await waitFor(() => expect(screen.getAllByText('취소 사유: 수강 변경').length).toBeGreaterThan(0))
  expect(writes).toEqual([{ reason: '  수강 변경  ', confirmation: { fingerprint: 'exact-current-recipient', confirmed: true } }])
  expect(request.status).toBe('APPROVED')
  expect(request.review).toEqual(originalReview)
  expect(other.status).toBe('FAILED')
  expect(other.reason).toBe('다른 대상 실패')
  expect(screen.getByText('다른 대상 실패')).toBeInTheDocument()
})

test('canceling a failed recipient preserves the previous failure and attempts beside the durable cancellation reason', async () => {
  const user = userEvent.setup()
  const request = requestFixture(false, { recipients: [recipient({ status: 'FAILED', reason: '이전 생성 실패 원문' })] })
  server.use(refreshSuccessHandler('access-user'), http.get(ownerImpact, () => HttpResponse.json(impact(request))), http.post(ownerCancel, () => {
    const result = receipt(request); applyReceipt(request, result); return HttpResponse.json(result)
  }))
  renderApp(`/console/requests/${request.id}`)
  const dialog = await openCancellation(user)
  expect(dialog.getByText(/생성 실패의 재시도를 포기합니다/)).toBeInTheDocument()
  await confirmCancellation(user, dialog)
  await waitFor(() => expect(screen.getAllByText('이전 생성 실패·제외 사유: 이전 생성 실패 원문').length).toBeGreaterThan(0))
  expect(request.recipients[0].reason).toBe('이전 생성 실패 원문')
  expect(screen.getAllByText('이전 생성 시도: 2회').length).toBeGreaterThan(0)
})

test.each([
  ['access-org-manager', orgManagerUser, true], ['access-org-admin', orgAdminUser, true], ['access-sys-admin', sysAdminUser, true],
  ['access-org-viewer', orgViewerUser, false], ['access-sys-manager', sysManagerUser, false], ['access-sys-viewer', sysViewerUser, false],
] as const)('server cancellation capabilities control the support action for %s', async (token, actor, allowed) => {
  const request = requestFixture(true, { recipients: [recipient({ cancellationCapability: { ownerAllowed: false, supportAllowed: allowed, blockedReason: allowed ? null : '취소 권한이 없습니다.' } })] })
  server.use(refreshSuccessHandler(token, actor), http.get(supportImpact, () => HttpResponse.json(impact(request))))
  renderApp(`/admin/requests/${request.id}?org=${request.orgId}`)
  await screen.findByRole('table', { name: '대상자' })
  expect(!!screen.queryByRole('button', { name: '정확한 대상 생성 대기 취소' })).toBe(allowed)
  if (allowed) {
    const dialog = await openCancellation(userEvent.setup())
    expect(dialog.getByText('워크스페이스 지원 쓰기 권한')).toBeInTheDocument()
  }
})

test('an administrator with only actual ownership explicitly uses the owner route', async () => {
  const user = userEvent.setup()
  const request = requestFixture(true)
  let ownerReads = 0, supportReads = 0, ownerWrites = 0, supportWrites = 0
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser), http.get(ownerImpact, () => { ownerReads++; return HttpResponse.json(impact(request)) }), http.get(supportImpact, () => { supportReads++; return HttpResponse.json(impact(request)) }),
    http.post(ownerCancel, () => { ownerWrites++; return HttpResponse.json(receipt(request)) }), http.post(supportCancel, () => { supportWrites++; return new HttpResponse(null, { status: 403 }) }))
  renderApp(`/admin/requests/${request.id}?org=${request.orgId}`)
  const dialog = await openCancellation(user)
  expect(dialog.getByText('현재 워크스페이스 소유자 자격')).toBeInTheDocument()
  await confirmCancellation(user, dialog)
  await waitFor(() => expect(ownerWrites).toBe(1))
  expect([ownerReads, supportReads, supportWrites]).toEqual([1, 0, 0])
})

test('a requester or recipient with no server capability cannot cancel a null-resource recipient', async () => {
  const request = requestFixture(false, { recipients: [recipient({ userId: uuid(42), cancellationCapability: { ownerAllowed: false, supportAllowed: false, blockedReason: '현재 소유자가 아닙니다.' } })] })
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/requests/${request.id}`)
  await screen.findByRole('table', { name: '대상자' })
  expect(screen.queryByRole('button', { name: /생성 대기 취소/ })).not.toBeInTheDocument()
  expect(screen.getByText('현재 소유자가 아닙니다.')).toBeInTheDocument()
})

test('a registration race refuses cancellation, reads the current blocker and requires a new confirmation', async () => {
  const user = userEvent.setup()
  const request = requestFixture()
  let reads = 0, writes = 0
  server.use(refreshSuccessHandler('access-user'), http.get(ownerImpact, () => HttpResponse.json(impact(request, ++reads === 1 ? {} : { allowed: false, blockedReason: '이미 등록된 자원이 있습니다.', previousStatus: 'CREATED', fingerprint: 'registered-now' }))),
    http.post(ownerCancel, () => { writes++; return HttpResponse.json({ status: 409, code: 'REQUEST_RECIPIENT_NOT_CANCELABLE', detail: '이미 등록된 자원이 있습니다.' }, { status: 409 }) }))
  renderApp(`/console/requests/${request.id}`)
  const dialog = await openCancellation(user)
  await confirmCancellation(user, dialog)
  await waitFor(() => expect(reads).toBe(2))
  await dialog.findAllByText('이미 등록된 자원이 있습니다.')
  expect(dialog.getByRole('checkbox')).not.toBeChecked()
  expect(dialog.getByRole('button', { name: '생성 대기 취소' })).toBeDisabled()
  expect(dialog.getByText(/발급 전 LLM API 키는 등록 자원입니다/)).toBeInTheDocument()
  expect(writes).toBe(1)
})

test('a lost POST response never auto-repeats and an explicit GET restores its saved receipt', async () => {
  const user = userEvent.setup()
  const request = requestFixture(false, { recipients: [recipient({ status: 'PENDING_JOIN' })] })
  let writes = 0, receiptVisible = false
  const durable = receipt(request)
  server.use(refreshSuccessHandler('access-user'), http.get(ownerImpact, () => HttpResponse.json(impact(request))),
    http.get('*/api/v1/requests/:requestId', () => HttpResponse.json(receiptVisible ? { ...request, recipients: [{ ...request.recipients[0], status: 'CANCELED', cancellation: durable }] } : request)),
    http.post(ownerCancel, () => { writes++; return HttpResponse.error() }))
  renderApp(`/console/requests/${request.id}`)
  const dialog = await openCancellation(user)
  await confirmCancellation(user, dialog)
  await dialog.findByText(/완료나 실패를 단정할 수 없습니다/)
  expect(writes).toBe(1)
  expect(dialog.queryByText('생성 대기 취소 완료')).not.toBeInTheDocument()
  expect(dialog.getByRole('button', { name: '생성 대기 취소' })).toBeDisabled()
  receiptVisible = true
  await user.click(dialog.getByRole('button', { name: '현재 결과 조회' }))
  await waitFor(() => expect(screen.getAllByText('취소 사유: 수강 변경').length).toBeGreaterThan(0))
  expect(writes).toBe(1)
})

test('an already canceled direct request URL shows the persisted result without any POST', async () => {
  const request = requestFixture(false, { recipients: [recipient({ status: 'FAILED', reason: '이전 실패' })] })
  applyReceipt(request, receipt(request))
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/requests/${request.id}`)
  await screen.findByText('취소 사유: 수강 변경')
  expect(screen.getByText('이전 생성 실패·제외 사유: 이전 실패')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /생성 대기 취소/ })).not.toBeInTheDocument()
})

test('duplicate submits issue one cancellation while its response is pending', async () => {
  const user = userEvent.setup()
  const request = requestFixture()
  let release: () => void = () => {}
  const pending = new Promise<void>((done) => { release = done })
  let writes = 0
  server.use(refreshSuccessHandler('access-user'), http.get(ownerImpact, () => HttpResponse.json(impact(request))), http.post(ownerCancel, async () => { writes++; await pending; return HttpResponse.json(receipt(request)) }))
  renderApp(`/console/requests/${request.id}`)
  const dialog = await openCancellation(user)
  await user.type(dialog.getByRole('textbox'), '수강 변경')
  await user.click(dialog.getByRole('checkbox'))
  const submit = dialog.getByRole('button', { name: '생성 대기 취소' })
  try {
    fireEvent.click(submit); fireEvent.click(submit)
    await waitFor(() => expect(writes).toBe(1))
    await act(async () => { release(); await pending })
    await dialog.findByText('취소 사유: 수강 변경')
    expect(writes).toBe(1)
  } finally { release() }
})

test('a delayed cancellation preview cannot cross an administrator organization switch', async () => {
  const user = userEvent.setup()
  const request = requestFixture(true, { recipients: [recipient({ cancellationCapability: { ownerAllowed: false, supportAllowed: true } })] })
  let release: () => void = () => {}
  const pending = new Promise<void>((done) => { release = done })
  let started = false
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.get(supportImpact, async () => { started = true; await pending; return HttpResponse.json(impact(request)) }))
  const { router } = renderContext(`/admin/requests/${request.id}?org=${uuid(1)}`)
  try {
    await user.click(await screen.findByRole('button', { name: '정확한 대상 생성 대기 취소' }))
    await waitFor(() => expect(started).toBe(true))
    await act(() => router.navigate(`/admin/requests/${request.id}?org=${uuid(2)}`))
    await act(async () => { release(); await pending })
    expect(screen.queryByRole('dialog', { name: '대상자 생성 대기 취소' })).not.toBeInTheDocument()
  } finally { release() }
})

test('a support cancellation posts its confirmed fingerprint and never falls back to owner after a refusal', async () => {
  const user = userEvent.setup()
  const request = requestFixture(true, { recipients: [recipient({ cancellationCapability: { ownerAllowed: true, supportAllowed: true } })] })
  let ownerReads = 0, ownerWrites = 0
  const writes: unknown[] = []
  server.use(refreshSuccessHandler('access-org-manager', orgManagerUser), http.get(supportImpact, () => HttpResponse.json(impact(request, { fingerprint: 'support-mode' }))),
    http.get(ownerImpact, () => { ownerReads++; return HttpResponse.json(impact(request)) }), http.post(ownerCancel, () => { ownerWrites++; return HttpResponse.json(receipt(request)) }),
    http.post(supportCancel, async ({ request: wire }) => { writes.push(await wire.json()); return HttpResponse.json({ status: 403, code: 'FORBIDDEN', detail: '지원 쓰기 권한이 변경되었습니다.' }, { status: 403 }) }))
  renderApp(`/admin/requests/${request.id}?org=${request.orgId}`)
  const dialog = await openCancellation(user)
  expect(dialog.getByText('워크스페이스 지원 쓰기 권한')).toBeInTheDocument()
  await confirmCancellation(user, dialog)
  await dialog.findByText('지원 쓰기 권한이 변경되었습니다.')
  expect(writes).toEqual([{ reason: '수강 변경', confirmation: { fingerprint: 'support-mode', confirmed: true } }])
  expect([ownerReads, ownerWrites]).toEqual([0, 0])
  expect(dialog.getByRole('checkbox')).not.toBeChecked()
})

test('changing capability from support to actual owner resets confirmation and rejects a late support preview', async () => {
  const user = userEvent.setup()
  const request = requestFixture(true, { recipients: [recipient({ cancellationCapability: { ownerAllowed: true, supportAllowed: true } })] })
  let release: () => void = () => {}
  const pending = new Promise<void>((done) => { release = done })
  let supportReads = 0, ownerReads = 0
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
    http.get(supportImpact, async () => { supportReads++; await pending; return HttpResponse.json(impact(request, { previousReason: '이전 지원 응답', fingerprint: 'late-support' })) }),
    http.get(ownerImpact, () => { ownerReads++; return HttpResponse.json(impact(request, { fingerprint: 'owner-context' })) }))
  const { client } = renderContext(`/admin/requests/${request.id}?org=${request.orgId}`)
  try {
    await user.click(await screen.findByRole('button', { name: '정확한 대상 생성 대기 취소' }))
    await waitFor(() => expect(supportReads).toBe(1))
    request.recipients[0].cancellationCapability = { ownerAllowed: true, supportAllowed: false }
    await act(() => client.invalidateQueries({ queryKey: ['admin', 'requests', request.id] }))
    await waitFor(() => expect(ownerReads).toBe(1))
    const dialog = within(screen.getByRole('dialog', { name: '대상자 생성 대기 취소' }))
    await dialog.findByText('현재 워크스페이스 소유자 자격')
    await act(async () => { release(); await pending })
    expect(dialog.queryByText(/이전 지원 응답/)).not.toBeInTheDocument()
    expect(dialog.getByRole('checkbox')).not.toBeChecked()
    expect(dialog.getByRole('textbox')).toHaveValue('')
  } finally { release() }
})

test('refreshing only the cancellation observation time retains the same fingerprint confirmation', async () => {
  const user = userEvent.setup()
  const request = requestFixture()
  let reads = 0
  server.use(refreshSuccessHandler('access-user'), http.get(ownerImpact, () => HttpResponse.json(impact(request, { observedAt: ++reads === 1 ? '2026-10-17T00:00:00Z' : '2026-10-17T00:02:00Z' }))))
  renderApp(`/console/requests/${request.id}`)
  const dialog = await openCancellation(user)
  await user.type(dialog.getByRole('textbox'), '수강 변경')
  await user.click(dialog.getByRole('checkbox'))
  await user.click(dialog.getByRole('button', { name: '현재 취소 영향 새로 조회' }))
  await dialog.findByText(/2026-10-17 09:02/)
  expect(dialog.getByRole('checkbox')).toBeChecked()
  expect(dialog.getByRole('button', { name: '생성 대기 취소' })).toBeEnabled()
})

test('escape closes a pending preview and its late response cannot restore the dialog', async () => {
  const user = userEvent.setup()
  const request = requestFixture()
  let release: () => void = () => {}
  const pending = new Promise<void>((done) => { release = done })
  let started = false
  server.use(refreshSuccessHandler('access-user'), http.get(ownerImpact, async () => { started = true; await pending; return HttpResponse.json(impact(request)) }))
  renderApp(`/console/requests/${request.id}`)
  const trigger = await screen.findByRole('button', { name: '정확한 대상 생성 대기 취소' })
  try {
    await user.click(trigger)
    await waitFor(() => expect(started).toBe(true))
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    await act(async () => { release(); await pending })
    expect(screen.queryByRole('dialog', { name: '대상자 생성 대기 취소' })).not.toBeInTheDocument()
  } finally { release() }
})

test('an uncertain operation can be closed and reopened to explicitly read its durable result', async () => {
  const user = userEvent.setup()
  const request = requestFixture(false, { recipients: [recipient({ status: 'PENDING_JOIN' })] })
  const durable = receipt(request)
  let applied = false, writes = 0
  server.use(refreshSuccessHandler('access-user'),
    http.get(ownerImpact, () => HttpResponse.json(impact(request, applied ? { allowed: false, blockedReason: '이미 취소된 대상자입니다.', previousStatus: 'CANCELED', fingerprint: 'already-canceled' } : {}))),
    http.get('*/api/v1/requests/:requestId', () => HttpResponse.json(applied ? { ...request, recipients: [{ ...request.recipients[0], status: 'CANCELED', cancellation: durable }] } : request)),
    http.post(ownerCancel, () => { writes++; applied = true; return HttpResponse.error() }))
  renderApp(`/console/requests/${request.id}`)
  const first = await openCancellation(user)
  await confirmCancellation(user, first)
  await first.findByText(/완료나 실패를 단정할 수 없습니다/)
  await user.keyboard('{Escape}')
  const reopened = await openCancellation(user)
  expect(reopened.getByRole('button', { name: '생성 대기 취소' })).toBeDisabled()
  await user.click(reopened.getByRole('button', { name: '현재 결과 조회' }))
  await waitFor(() => expect(screen.getAllByText('취소 사유: 수강 변경').length).toBeGreaterThan(0))
  expect(writes).toBe(1)
})

test.each([403, 503])('an unavailable cancellation preview (%s) leaves submission unconfirmed', async (status) => {
  const user = userEvent.setup()
  const request = requestFixture()
  let writes = 0
  server.use(refreshSuccessHandler('access-user'), http.get(ownerImpact, () => HttpResponse.json({ status, code: 'FORBIDDEN', detail: '취소 영향 조회 실패' }, { status })),
    http.post(ownerCancel, () => { writes++; return HttpResponse.json(receipt(request)) }))
  renderApp(`/console/requests/${request.id}`)
  await user.click(await screen.findByRole('button', { name: '정확한 대상 생성 대기 취소' }))
  const dialog = within(await screen.findByRole('dialog', { name: '대상자 생성 대기 취소' }))
  await dialog.findByText('취소 영향 조회 실패')
  expect(dialog.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(dialog.getByRole('button', { name: '생성 대기 취소' })).toBeDisabled()
  expect(writes).toBe(0)
})

test('an explicit result read updates only this reader cache and preserves another actor snapshot', async () => {
  const user = userEvent.setup()
  const request = requestFixture()
  let currentRead = false
  server.use(refreshSuccessHandler('access-user'), http.get(ownerImpact, () => HttpResponse.json(impact(request))),
    http.get('*/api/v1/requests/:requestId', () => HttpResponse.json(currentRead ? { ...request, displayName: '현재 열람자 조회 결과' } : request)))
  const { client } = renderContext(`/console/requests/${request.id}`)
  const previousKey = ['requests', request.id, 'previous-actor-reader']
  client.setQueryData(previousKey, { ...request, displayName: '이전 열람자 캐시' })
  const dialog = await openCancellation(user)
  currentRead = true
  await user.click(dialog.getByRole('button', { name: '현재 결과 조회' }))
  await dialog.findByText(/저장된 개별 취소 결과가 없습니다/)
  expect(client.getQueryData<RequestDetail>(previousKey)?.displayName).toBe('이전 열람자 캐시')
  expect(dialog.getByText(/현재 열람자 조회 결과/)).toBeInTheDocument()
})
