import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import { currentPath, renderApp } from '../test/render'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { adminRequestStore, approvalContextFixture, approveBodies, submittedAdminRequest } from '../test/msw/handlers/admin'
import { orgAdminUser, orgManagerUser, orgViewerUser, refreshSuccessHandler, sysAdminUser, sysManagerUser, sysViewerUser } from '../test/msw/handlers/auth'
import { vmStore } from '../test/msw/handlers/vms'
import { externalDomains } from '../test/msw/handlers/publishing'
import { adminLlmKeyStore } from '../test/msw/handlers/llm-keys'
import { approvalTargetCounts, commonApprovalComparisons } from '../components/request-kind/approval-confirmation'
import { fetchAdminRequests } from '../api/queries'

test('declared recipient totals distinguish current membership loss, closed targets and unknown observations', () => {
  const request = submittedAdminRequest(201)
  request.recipients = [
    { id: uuid(600), userId: uuid(42), name: '활성 대상', status: 'QUEUED' },
    { id: uuid(601), userId: uuid(57), name: '이탈한 대상', status: 'QUEUED' },
    { id: uuid(602), status: 'PENDING_JOIN', invitee: 'future@example.test' },
    { id: uuid(603), status: 'CANCELED' },
  ]
  const facts = [{ userId: uuid(42), name: '활성 대상', member: true, userStatus: 'ACTIVE' }, { userId: uuid(57), name: '이탈한 대상', member: false, userStatus: 'ACTIVE' }]
  expect(approvalTargetCounts(request, facts, true)).toEqual({ total: 4, ready: 1, waiting: 1, excluded: 2, unknown: 0 })
  expect(approvalTargetCounts(request)).toEqual({ total: 4, ready: 0, waiting: 1, excluded: 1, unknown: 2 })
  expect(approvalTargetCounts({ ...request, recipients: [{ id: uuid(610), status: 'QUEUED' }] }, facts, true)).toMatchObject({ ready: 0, unknown: 1 })
  const missing = commonApprovalComparisons({ ...request, reqEndDate: undefined }, { grantedEndDate: null })
  expect(missing.find((row) => row.label === '사용 종료일')).toMatchObject({ requested: '종료일 기록 없음', granted: '무기한' })
  const unlimited = commonApprovalComparisons({ ...request, reqEndDate: null }, { grantedEndDate: null })
  expect(unlimited.find((row) => row.label === '사용 종료일')?.requested).toBe('무기한')
})

test('the shared approval confirmation excludes a departed user and does not reserve the nominal total', async () => {
  const user = userEvent.setup()
  const request = adminRequestStore.find((row) => row.id === uuid(201))!
  request.recipients = [
    { id: uuid(600), userId: uuid(42), name: '홍길동', status: 'QUEUED' },
    { id: uuid(601), userId: uuid(57), name: '이탈한 대상', status: 'QUEUED' },
    { id: uuid(602), status: 'PENDING_JOIN', invitee: 'future@example.test' },
    { id: uuid(603), status: 'CANCELED', name: '취소된 대상' },
  ]
  const context = approvalContextFixture(uuid(201))
  context.workspace.members = context.workspace.members.filter((member) => member.userId !== uuid(57))
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser), http.get('*/api/v1/admin/requests/:requestId/context', () => HttpResponse.json(context)))
  renderApp(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
  await user.click(await screen.findByRole('button', { name: '승인하기' }))
  const modal = within(screen.getByRole('dialog', { name: '신청 승인' }))
  await modal.findByText(/신청 대상 4명.*조회된 구성원 대상 1명.*가입 대기 1명.*취소·제외 2명/)
  expect(modal.getByText(/2명 기준 부여안 합계.*4 vCPU.*4 GiB.*40 GiB/)).toBeInTheDocument()
  expect(modal.getByText(/물리 용량 예약을 뜻하지 않습니다/)).toBeInTheDocument()
  await user.click(modal.getByText('실제 대상 확인 (4명)'))
  expect(modal.getByText('이탈한 대상 / 현재 워크스페이스 구성원 아님')).toBeInTheDocument()
  expect(approveBodies).toHaveLength(0)
})

test.each([
  ['access-org-admin', orgAdminUser, true, false], ['access-org-manager', orgManagerUser, true, false], ['access-org-viewer', orgViewerUser, false, false],
  ['access-sys-admin', sysAdminUser, true, true], ['access-sys-manager', sysManagerUser, false, true], ['access-sys-viewer', sysViewerUser, false, true],
] as const)('registered and failed outcomes retain exact role capabilities for %s', async (token, profile, canRetry, canReadTasks) => {
  const request = adminRequestStore.find((row) => row.id === uuid(201))!
  request.status = 'APPROVED'
  request.recipients = [
    { id: uuid(600), userId: uuid(42), name: '홍길동', status: 'CREATED', resourceId: uuid(56) },
    { id: uuid(601), userId: uuid(57), name: '김철수', status: 'FAILED', reason: '등록할 공간이 없습니다.' },
  ]
  const context = approvalContextFixture(uuid(201))
  context.recipientUserReadFlags = { [uuid(42)]: true, [uuid(57)]: true }
  context.workspace.members = []
  context.generatedResources = [{ id: uuid(56), type: 'VM', name: '실제 생성 VM', state: 'ERROR', orgId: uuid(1), workspaceId: uuid(12), recipientId: uuid(600), createdAt: request.updatedAt, recordUpdatedAt: request.updatedAt, nodeId: uuid(2), nodeName: 'pve2', canReadDetail: true }]
  server.use(refreshSuccessHandler(token, profile), http.get('*/api/v1/admin/requests/:requestId/context', () => HttpResponse.json(context)))
  renderApp(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
  const result = await screen.findByRole('table', { name: '신청에서 등록된 자원 상태' })
  expect(within(result).getByText('오류')).toBeInTheDocument()
  expect(within(result).getByText('pve2')).toBeInTheDocument()
  const resultLink = new URL(within(result).getByRole('link', { name: '실제 생성 VM' }).getAttribute('href')!, 'https://pickle.invalid')
  expect(resultLink.pathname).toBe(`/admin/vms/${uuid(56)}`)
  expect(resultLink.searchParams.get('org')).toBe(uuid(1))
  const returnedRequest = new URL(resultLink.searchParams.get('returnTo')!, 'https://pickle.invalid')
  expect(returnedRequest.pathname).toBe(`/admin/requests/${uuid(201)}`)
  expect(returnedRequest.searchParams.get('org')).toBe(uuid(1))
  expect(!!within(result).queryByRole('link', { name: '이 VM의 운영 작업' })).toBe(canReadTasks)
  const recipients = screen.getByRole('table', { name: '대상자' })
  expect(within(recipients).getByText('자원 등록됨')).toBeInTheDocument()
  expect(within(recipients).getByText('실패')).toBeInTheDocument()
  expect(!!within(recipients).queryByRole('button', { name: '다시 시도' })).toBe(canRetry)
  expect(within(recipients).getByRole('link', { name: '홍길동' })).toHaveAttribute('href', `/admin/users/${uuid(42)}?org=${uuid(1)}`)
})

test('recipient retry records queue reception and then observes the actual registered VM separately', async () => {
  const user = userEvent.setup()
  const request = adminRequestStore.find((row) => row.id === uuid(201))!
  request.status = 'APPROVED'
  request.recipients = [{ id: uuid(600), userId: uuid(42), name: '홍길동', status: 'FAILED', reason: '일시적 등록 오류' }]
  const context = approvalContextFixture(uuid(201))
  context.recipientUserReadFlags = { [uuid(42)]: true }
  let retried = false
  let registered = false
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser),
    http.post('*/api/v1/admin/requests/:requestId/recipients/:recipientId/retry', () => { retried = true; request.recipients![0].status = 'QUEUED'; request.recipients![0].reason = null; return HttpResponse.json(request) }),
    http.get('*/api/v1/admin/requests/:requestId/context', () => HttpResponse.json({ ...context, generatedResources: registered ? [{ id: uuid(56), type: 'VM', name: '등록된 VM', state: 'CREATING', orgId: uuid(1), workspaceId: uuid(12), recipientId: uuid(600), createdAt: request.updatedAt, recordUpdatedAt: request.updatedAt, canReadDetail: true }] : [] })),
  )
  renderApp(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
  await user.click(await screen.findByRole('button', { name: '다시 시도' }))
  expect(retried).toBe(true)
  expect(await screen.findByText('생성 대기')).toBeInTheDocument()
  expect(screen.queryByRole('table', { name: '신청에서 등록된 자원 상태' })).not.toBeInTheDocument()
  registered = true
  request.recipients![0].status = 'CREATED'
  request.recipients![0].resourceId = uuid(56)
  await screen.findByRole('table', { name: '신청에서 등록된 자원 상태' }, { timeout: 6000 })
  expect(screen.getByText('자원 등록됨')).toBeInTheDocument()
  expect(screen.getByText('생성 중')).toBeInTheDocument()
})

test('an entirely registered request keeps observing VM provisioning until its actual state settles', async () => {
  const request = adminRequestStore.find((row) => row.id === uuid(201))!
  request.status = 'APPROVED'
  request.recipients = [{ id: uuid(600), userId: uuid(42), name: '홍길동', status: 'CREATED', resourceId: uuid(56) }]
  const context = approvalContextFixture(uuid(201))
  let running = false
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser), http.get('*/api/v1/admin/requests/:requestId/context', () => HttpResponse.json({ ...context, generatedResources: [{ id: uuid(56), type: 'VM', name: '관측 VM', state: running ? 'RUNNING' : 'CREATING', orgId: uuid(1), workspaceId: uuid(12), recipientId: uuid(600), createdAt: request.updatedAt, recordUpdatedAt: request.updatedAt, canReadDetail: true }] })))
  renderApp(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
  await screen.findByText('생성 중')
  expect(screen.getByText('자원 등록됨')).toBeInTheDocument()
  running = true
  await screen.findByText('실행 중', {}, { timeout: 6000 })
  expect(screen.getByText('자원 등록됨')).toBeInTheDocument()
})

test('a midnight change must be reviewed before the approval sends a new start date', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date('2026-10-04T14:59:00Z'))
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
    await user.click(await screen.findByRole('button', { name: '승인하기' }))
    const modal = within(screen.getByRole('dialog', { name: '신청 승인' }))
    expect(modal.getByText('부여 사용 시작일: 2026-10-04')).toBeInTheDocument()
    vi.setSystemTime(new Date('2026-10-04T15:01:00Z'))
    await user.click(modal.getByRole('button', { name: '승인 확정' }))
    expect(approveBodies).toHaveLength(0)
    expect(modal.getByText('부여 사용 시작일: 2026-10-05')).toBeInTheDocument()
    expect(modal.getByText(/승인 내용이 갱신되었습니다/)).toBeInTheDocument()
    await user.click(modal.getByRole('button', { name: '승인 확정' }))
    await waitFor(() => expect(approveBodies[0]?.body.grantedStartDate).toBe('2026-10-05'))
  } finally {
    vi.useRealTimers()
  }
})

test('the request search and submitted period filters survive an exact detail and list roundtrip', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser))
  const source = `/admin/requests?org=${uuid(1)}&status=all&relatedUserId=${uuid(42)}&q=${encodeURIComponent('캡스톤')}&requestedEndFrom=2026-12-01&requestedEndTo=2026-12-31&reqIndefinite=false`
  renderApp(source)
  const table = await screen.findByRole('table', { name: '관리자 신청 목록' })
  await user.click(within(table).getAllByRole('link')[0])
  await screen.findByRole('heading', { name: '신청 상세' })
  await user.click(screen.getByRole('link', { name: '← 신청 목록' }))
  await screen.findByRole('table', { name: '관리자 신청 목록' })
  expect(currentPath()).toBe(source)
  expect(screen.getByLabelText('신청 검색')).toHaveValue('캡스톤')
  expect(screen.getByLabelText('희망 종료일 이후')).toHaveValue('2026-12-01')
})

test('request list wire rejects an indefinite filter combined with either end-date bound', async () => {
  for (const bound of [{ requestedEndFrom: '2026-12-01' }, { requestedEndTo: '2026-12-31' }]) {
    await expect(fetchAdminRequests({ orgId: uuid(1), reqIndefinite: true, ...bound }))
      .rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', status: 422 } })
  }
})

test('switching to indefinite requests clears both date bounds before querying', async () => {
  const user = userEvent.setup()
  const queries: URLSearchParams[] = []
  adminRequestStore.push(submittedAdminRequest(9700))
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser),
    http.get('*/api/v1/admin/requests', ({ request }) => { queries.push(new URL(request.url).searchParams) }))
  renderApp(`/admin/requests?org=${uuid(1)}&requestedEndFrom=2026-12-01&requestedEndTo=2026-12-31&reqIndefinite=false`)
  await screen.findByRole('table', { name: '관리자 신청 목록' })
  await user.selectOptions(screen.getByLabelText('희망 기간 종류'), 'true')
  await waitFor(() => expect(queries.at(-1)?.get('reqIndefinite')).toBe('true'))
  expect(queries.at(-1)?.toString()).not.toContain('requestedEndFrom')
  expect(queries.at(-1)?.toString()).not.toContain('requestedEndTo')
  expect(screen.getByLabelText('희망 종료일 이후')).toHaveValue('')
  expect(screen.getByLabelText('희망 종료일 이전')).toHaveValue('')
  await screen.findByRole('table', { name: '관리자 신청 목록' })
  expect(screen.queryByText('무기한 검색에는 종료일 범위를 함께 보내지 않습니다.')).not.toBeInTheDocument()
})

test.each([
  ['희망 종료일 이후', 'requestedEndFrom', '2026-12-01'],
  ['희망 종료일 이전', 'requestedEndTo', '2026-12-31'],
] as const)('entering %s from indefinite requests switches to a finite query', async (label, parameter, value) => {
  const queries: URLSearchParams[] = []
  adminRequestStore.push(submittedAdminRequest(9700))
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser),
    http.get('*/api/v1/admin/requests', ({ request }) => { queries.push(new URL(request.url).searchParams) }))
  renderApp(`/admin/requests?org=${uuid(1)}&reqIndefinite=true`)
  await screen.findByRole('table', { name: '관리자 신청 목록' })
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
  await waitFor(() => expect(queries.at(-1)?.get(parameter)).toBe(value))
  expect(queries.at(-1)?.get('reqIndefinite')).toBe('false')
  expect(screen.getByLabelText('희망 기간 종류')).toHaveValue('false')
  await screen.findByRole('table', { name: '관리자 신청 목록' })
})

test('a mixed direct request URL gives indefinite precedence in the wire and exact return link', async () => {
  const user = userEvent.setup()
  const queries: URLSearchParams[] = []
  adminRequestStore.push(submittedAdminRequest(9700))
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser),
    http.get('*/api/v1/admin/requests', ({ request }) => { queries.push(new URL(request.url).searchParams) }))
  renderApp(`/admin/requests?org=${uuid(1)}&requestedEndFrom=2026-12-01&requestedEndTo=2026-12-31&reqIndefinite=true`)
  await waitFor(() => expect(queries.length).toBeGreaterThan(0))
  expect(queries.every((query) => !query.has('requestedEndFrom') && !query.has('requestedEndTo'))).toBe(true)
  const table = await screen.findByRole('table', { name: '관리자 신청 목록' })
  const canonical = `/admin/requests?org=${uuid(1)}&reqIndefinite=true`
  await waitFor(() => expect(currentPath()).toBe(canonical))
  const link = within(table).getAllByRole('link')[0]
  expect(new URL(link.getAttribute('href')!, 'https://pickle.invalid').searchParams.get('returnTo')).toBe(canonical)
  await user.click(link)
  await screen.findByRole('heading', { name: '신청 상세' })
  await user.click(screen.getByRole('link', { name: '← 신청 목록' }))
  await screen.findByRole('table', { name: '관리자 신청 목록' })
  expect(currentPath()).toBe(canonical)
})

test('placement reads are approver-scoped and names choose the exact node without the inventory endpoint', async () => {
  const user = userEvent.setup()
  let inventories = 0
  let previewBody: unknown
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser),
    http.get('*/api/v1/admin/nodes', () => { inventories += 1; return HttpResponse.json([]) }),
    http.post('*/api/v1/admin/vm-placement/preview', async ({ request }) => { previewBody = await request.json(); return HttpResponse.json({ orgId: uuid(1), inputImageId: (previewBody as { imageId: string }).imageId, observedAt: '2026-10-04T01:00:00Z', image: { id: uuid(1), name: 'Ubuntu', version: 1, selectableNow: true }, candidates: [{ nodeId: uuid(2), nodeName: 'pve2', fitsOneNow: true }], fitsAnyOneNow: true }) }),
  )
  renderApp(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
  const node = await screen.findByLabelText('배치 노드')
  await waitFor(() => expect(node).toBeEnabled())
  await user.selectOptions(node, uuid(2))
  await user.click(screen.getByRole('button', { name: '승인하기' }))
  const modal = within(screen.getByRole('dialog', { name: '신청 승인' }))
  expect(modal.getByText('배치: pve2')).toBeInTheDocument()
  expect(previewBody).toMatchObject({ orgId: uuid(1), imageId: uuid(1), memoryMb: 2048 })
  expect(inventories).toBe(0)
  await user.click(modal.getByRole('button', { name: '승인 확정' }))
  await waitFor(() => expect(approveBodies[0].body.vm?.nodeId).toBe(uuid(2)))
})

test('read flags fail closed for a current system account or a missing context result', async () => {
  const request = adminRequestStore.find((row) => row.id === uuid(201))!
  request.status = 'APPROVED'
  request.recipients = [{ id: uuid(600), userId: uuid(5), name: '시스템 계정', status: 'QUEUED' }]
  const context = approvalContextFixture(uuid(201))
  context.recipientUserReadFlags = { [uuid(5)]: false }
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser), http.get('*/api/v1/admin/requests/:requestId/context', () => HttpResponse.json(context)))
  renderApp(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
  const recipients = await screen.findByRole('table', { name: '대상자' })
  expect(within(recipients).getByText('시스템 계정')).toBeInTheDocument()
  expect(within(recipients).queryByRole('link', { name: '시스템 계정' })).not.toBeInTheDocument()
})

test('a missing context retains actual recipient names without inventing support permissions', async () => {
  const request = adminRequestStore.find((row) => row.id === uuid(201))!
  request.status = 'APPROVED'
  request.recipients = [{ id: uuid(600), userId: uuid(42), name: '홍길동', status: 'CREATED', resourceId: uuid(56) }]
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser), http.get('*/api/v1/admin/requests/:requestId/context', () => new HttpResponse(null, { status: 404 })))
  renderApp(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
  const recipients = await screen.findByRole('table', { name: '대상자' })
  expect(within(recipients).getByText('홍길동')).toBeInTheDocument()
  expect(within(recipients).queryByRole('link', { name: '홍길동' })).not.toBeInTheDocument()
  await screen.findByText('승인 참고 정보를 불러오지 못했습니다')
  expect(screen.queryByRole('table', { name: '신청에서 등록된 자원 상태' })).not.toBeInTheDocument()
})

test('a retired requested image requires a currently selectable grant while retaining its actual reference', async () => {
  const user = userEvent.setup()
  const request = adminRequestStore.find((row) => row.id === uuid(201))!
  request.vm!.imageId = uuid(99)
  request.vm!.imageName = '은퇴한 신청 이미지'
  const context = approvalContextFixture(uuid(201))
  context.vm!.requestedImage = { id: uuid(99), name: '은퇴한 신청 이미지', version: 3, selectableNow: false }
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser), http.get('*/api/v1/admin/requests/:requestId/context', () => HttpResponse.json(context)))
  renderApp(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
  await screen.findByText('은퇴한 신청 이미지 / revision 3')
  expect(screen.getByText('현재 신청 불가')).toBeInTheDocument()
  await user.click(await screen.findByRole('button', { name: '승인하기' }))
  expect(await screen.findByText('현재 신청 가능한 OS 이미지를 선택해 주세요.')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(approveBodies).toHaveLength(0)
})

test('a compatible requested image absent from the canonical list keeps its original identifier after a scoped placement observation', async () => {
  const user = userEvent.setup()
  const request = adminRequestStore.find((row) => row.id === uuid(201))!
  request.vm!.imageId = uuid(99)
  request.vm!.imageName = '기존 호환 이미지'
  const context = approvalContextFixture(request.id)
  context.vm!.requestedImage = { id: uuid(99), name: '기존 호환 이미지', version: 1, selectableNow: true }
  let observed: unknown
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser),
    http.get('*/api/v1/admin/requests/:requestId/context', () => HttpResponse.json(context)),
    http.post('*/api/v1/admin/vm-placement/preview', async ({ request: incoming }) => { observed = await incoming.json(); return HttpResponse.json({ orgId: uuid(1), inputImageId: (observed as { imageId: string }).imageId, observedAt: '2026-10-04T01:00:00Z', image: { id: uuid(1), name: 'Ubuntu 24.04 LTS', version: 1, selectableNow: true }, candidates: [{ nodeId: uuid(2), nodeName: 'pve2', fitsOneNow: true }], fitsAnyOneNow: true }) }),
  )
  renderApp(`/admin/requests/${request.id}?org=${uuid(1)}`)
  const image = await screen.findByLabelText('OS 이미지')
  await waitFor(() => expect(within(image).getByRole('option', { name: /현재 선택 목록에 없음.*현재 신청 가능/ })).toBeEnabled())
  expect(image).toHaveValue(uuid(99))
  expect(observed).toMatchObject({ imageId: uuid(99), orgId: uuid(1) })
  await user.click(screen.getByRole('button', { name: '승인하기' }))
  const modal = within(screen.getByRole('dialog', { name: '신청 승인' }))
  expect(modal.getByText('Ubuntu 24.04 LTS (revision 1)')).toBeInTheDocument()
  await user.click(modal.getByRole('button', { name: '승인 확정' }))
  await waitFor(() => expect(approveBodies[0]?.body.vm?.grantedImageId).toBe(uuid(99)))
})

test.each([
  [uuid(1), uuid(98)], [uuid(2), uuid(99)], [uuid(1), undefined],
])('a placement observation for another or unknown input never validates the requested alias (%s/%s)', async (orgId, inputImageId) => {
  const user = userEvent.setup()
  const request = adminRequestStore.find((row) => row.id === uuid(201))!
  request.vm!.imageId = uuid(99)
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser), http.post('*/api/v1/admin/vm-placement/preview', () => HttpResponse.json({ orgId, inputImageId, observedAt: '2026-10-04T01:00:00Z', image: { id: uuid(1), name: 'Ubuntu', version: 1, selectableNow: true }, candidates: [{ nodeId: uuid(2), nodeName: '다른 대상의 노드', fitsOneNow: true }], fitsAnyOneNow: true })))
  renderApp(`/admin/requests/${request.id}?org=${uuid(1)}`)
  await screen.findByText('현재 입력의 배치 정보를 확인할 수 없습니다.')
  expect(screen.queryByRole('option', { name: /다른 대상의 노드/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '승인하기' }))
  await screen.findByText('현재 신청 가능한 OS 이미지를 선택해 주세요.')
  expect(approveBodies).toHaveLength(0)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('a newer unavailable image observation cannot be approved from an older selectable catalogue row', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser), http.post('*/api/v1/admin/vm-placement/preview', () => HttpResponse.json({ orgId: uuid(1), inputImageId: uuid(1), observedAt: '2026-10-04T01:00:00Z', image: { id: uuid(1), name: 'Ubuntu', version: 1, selectableNow: false }, candidates: [], fitsAnyOneNow: false })))
  renderApp(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
  await screen.findByText('현재 선택한 OS 이미지는 신청 불가로 조회되었습니다. 다른 이미지를 선택해 주세요.')
  await user.click(screen.getByRole('button', { name: '승인하기' }))
  await screen.findByText('현재 신청 가능한 OS 이미지를 선택해 주세요.')
  expect(approveBodies).toHaveLength(0)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test.each([
  ['access-org-admin', orgAdminUser, false], ['access-org-manager', orgManagerUser, false], ['access-org-viewer', orgViewerUser, false],
  ['access-sys-admin', sysAdminUser, true], ['access-sys-manager', sysManagerUser, true], ['access-sys-viewer', sysViewerUser, true],
] as const)('actual system-tier user references preserve directory scope for %s', async (token, profile, canReadSystemUsers) => {
  const request = adminRequestStore.find((row) => row.id === uuid(201))!
  request.status = 'APPROVED'
  request.recipients = [sysAdminUser, sysManagerUser, sysViewerUser].map((target, index) => ({ id: uuid(620 + index), userId: target.id, name: target.name, status: 'QUEUED' }))
  server.use(refreshSuccessHandler(token, profile))
  renderApp(`/admin/requests/${request.id}?org=${uuid(1)}`)
  const table = within(await screen.findByRole('table', { name: '대상자' }))
  await screen.findByRole('complementary', { name: '승인 판단 참고 정보' })
  await waitFor(() => {
    for (const target of [sysAdminUser, sysManagerUser, sysViewerUser]) expect(!!table.queryByRole('link', { name: target.name })).toBe(canReadSystemUsers)
  })
})

test('empty search results and reversed requested end dates keep the list filters visible', async () => {
  const user = userEvent.setup()
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
  renderApp(`/admin/requests?org=${uuid(1)}&q=missing-request`)
  await screen.findByText('표시할 신청이 없습니다.')
  expect(screen.getByLabelText('신청 검색')).toHaveValue('missing-request')
  fireEvent.change(screen.getByLabelText('희망 종료일 이후'), { target: { value: '2026-12-31' } })
  fireEvent.change(screen.getByLabelText('희망 종료일 이전'), { target: { value: '2026-12-01' } })
  await screen.findByText('희망 종료일 범위의 앞뒤 날짜를 확인해 주세요.')
  expect(screen.queryByText('신청 목록 불러오는 중')).not.toBeInTheDocument()
  await user.clear(screen.getByLabelText('신청 검색'))
  expect(screen.getByLabelText('희망 종료일 이후')).toHaveValue('2026-12-31')
})

test('the operating task URL actually applies the VM filter and returns to its request', async () => {
  const user = userEvent.setup()
  const scopes: Array<string | null> = []
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser), http.get('*/api/v1/admin/tasks', ({ request }) => { scopes.push(new URL(request.url).searchParams.get('vmId')) }))
  const target = `/admin/requests/${uuid(201)}?org=${uuid(1)}`
  renderApp(`/admin/tasks?vmId=${uuid(56)}&org=${uuid(1)}&returnTo=${encodeURIComponent(target)}`)
  await screen.findByRole('heading', { name: '작업 큐' })
  await waitFor(() => expect(scopes).toEqual([uuid(56)]))
  expect(screen.queryByRole('button', { name: '재시도' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: '← 신청 상세' }))
  await screen.findByRole('heading', { name: '신청 상세' })
  expect(currentPath()).toContain(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
})

test.each([
  [`/admin/requests/${uuid(201)}?org=${uuid(2)}`, false],
  [`/admin/requests/${uuid(202)}?org=${uuid(1)}`, false],
  [`/admin/requests/${uuid(201)}`, true],
] as const)('a VM return destination must identify its actual request and organization: %s', async (destination, accepted) => {
  vmStore.find((vm) => vm.id === uuid(56))!.requestId = uuid(201)
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(`/admin/vms/${uuid(56)}?returnTo=${encodeURIComponent(destination)}`)
  await screen.findByRole('heading', { name: 'algo-judge' })
  const back = screen.queryByRole('link', { name: '← 신청 상세' })
  expect(back !== null).toBe(accepted)
  if (back) {
    const target = new URL(back.getAttribute('href')!, 'https://pickle.invalid')
    expect(target.pathname).toBe(`/admin/requests/${uuid(201)}`)
    expect(target.searchParams.get('org')).toBe(uuid(1))
  }
})

test('a registered VM preserves its exact request and the original filtered list on return', async () => {
  const user = userEvent.setup()
  const request = adminRequestStore.find((row) => row.id === uuid(201))!
  request.status = 'APPROVED'
  request.recipients = [{ id: uuid(600), userId: uuid(42), name: '홍길동', status: 'CREATED', resourceId: uuid(56) }]
  vmStore.find((vm) => vm.id === uuid(56))!.requestId = request.id
  const context = approvalContextFixture(request.id)
  context.generatedResources = [{ id: uuid(56), type: 'VM', name: '정확한 VM 결과', state: 'RUNNING', orgId: uuid(1), workspaceId: uuid(12), recipientId: uuid(600), createdAt: request.updatedAt, recordUpdatedAt: request.updatedAt, canReadDetail: true }]
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser), http.get('*/api/v1/admin/requests/:requestId/context', () => HttpResponse.json(context)))
  const sourceList = `/admin/requests?org=${uuid(1)}&status=all&q=${encodeURIComponent('캡스톤')}`
  renderApp(`/admin/requests/${request.id}?org=${uuid(1)}&returnTo=${encodeURIComponent(sourceList)}`)
  await user.click(await screen.findByRole('link', { name: '정확한 VM 결과' }))
  await screen.findByRole('heading', { name: 'algo-judge' })
  expect(screen.getByRole('link', { name: '정확한 신청 보기' })).toHaveAttribute('href', `/admin/requests/${request.id}?org=${uuid(1)}`)
  expect(screen.queryByRole('button', { name: '재부팅' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: '← 신청 상세' }))
  await screen.findByRole('heading', { name: '신청 상세' })
  await user.click(screen.getByRole('link', { name: '← 신청 목록' }))
  expect(currentPath()).toBe(sourceList)
})

test('a registered LLM key preserves its exact request and the original filtered list on return', async () => {
  const user = userEvent.setup()
  const request = { ...adminRequestStore.find((row) => row.id === uuid(205))!, id: uuid(405), status: 'APPROVED' as const }
  adminRequestStore.push(request)
  const key = { ...adminLlmKeyStore.find((row) => row.id === uuid(171))!, id: uuid(9171), name: 'approval-followup-key', requestId: request.id }
  adminLlmKeyStore.push(key)
  const context = approvalContextFixture(uuid(205))
  context.generatedResources = [{ id: key.id, type: 'LLM_API_KEY', name: key.name, state: key.status, orgId: key.orgId!, workspaceId: key.workspaceId!, recipientId: null, createdAt: key.createdAt, recordUpdatedAt: key.createdAt, canReadDetail: true }]
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser), http.get('*/api/v1/admin/requests/:requestId/context', () => HttpResponse.json(context)))
  const list = `/admin/requests?org=${uuid(1)}&status=all&type=LLM_API_KEY`
  renderApp(`/admin/requests/${request.id}?org=${uuid(1)}&returnTo=${encodeURIComponent(list)}`)
  const generated = await screen.findByRole('table', { name: '신청에서 등록된 자원 상태' })
  await user.click(within(generated).getByRole('link', { name: key.name }))
  await screen.findByRole('heading', { name: key.name })
  expect(screen.getByRole('link', { name: '정확한 신청 보기' })).toHaveAttribute('href', `/admin/requests/${request.id}?org=${uuid(1)}`)
  expect(screen.queryByRole('button', { name: '한도 변경' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: '← 신청 상세' }))
  await screen.findByRole('heading', { name: '신청 상세' })
  await user.click(screen.getByRole('link', { name: '← 신청 목록' }))
  expect(currentPath()).toBe(list)
})

test('a default LLM request with no dedicated context fixture receives its actual typed review context', async () => {
  server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser))
  renderApp(`/admin/requests/${uuid(206)}?org=${uuid(1)}`)
  const panel = within(await screen.findByRole('complementary', { name: '승인 판단 참고 정보' }))
  expect(panel.getByText('active-admin-key')).toBeInTheDocument()
  expect(panel.queryByText(/물리 용량/)).not.toBeInTheDocument()
  expect(screen.queryByText('승인 참고 정보를 불러오지 못했습니다')).not.toBeInTheDocument()
  expect(screen.queryByRole('table', { name: '신청에서 등록된 자원 상태' })).not.toBeInTheDocument()
})

test.each([
  ['access-org-admin', orgAdminUser, true], ['access-org-manager', orgManagerUser, true], ['access-org-viewer', orgViewerUser, false],
  ['access-sys-admin', sysAdminUser, true], ['access-sys-manager', sysManagerUser, true], ['access-sys-viewer', sysViewerUser, false],
] as const)('a direct domain URL reads its exact target and preserves intervention rights for %s', async (token, profile, canIntervene) => {
  const user = userEvent.setup()
  const target = externalDomains[0]
  server.use(refreshSuccessHandler(token, profile))
  renderApp(`/admin/domains?org=${target.orgId}&domainId=${target.id}`)
  const drawer = within(await screen.findByRole('dialog', { name: '도메인 상세' }))
  await drawer.findByRole('heading', { name: target.fqdn })
  expect(!!drawer.queryByRole('button', { name: '강제 해제' })).toBe(canIntervene)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(currentPath()).toBe(`/admin/domains?org=${target.orgId}`)
})

test('a direct domain target outside the managed scope or malformed ID never opens intervention inputs', async () => {
  const target = externalDomains[0]
  target.orgId = uuid(2)
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
  const view = renderApp(`/admin/domains?org=${uuid(1)}&domainId=${target.id}`)
  const drawer = within(await screen.findByRole('dialog', { name: '도메인 상세' }))
  await drawer.findByText('선택한 관리 범위의 도메인이 아닙니다.')
  expect(drawer.queryByRole('heading', { name: target.fqdn })).not.toBeInTheDocument()
  expect(drawer.queryByRole('button', { name: '강제 해제' })).not.toBeInTheDocument()
  view.unmount()
  renderApp(`/admin/domains?org=${uuid(1)}&domainId=bad`)
  await screen.findByText('도메인 ID를 확인해 주세요.')
})

test('a late domain intervention response cannot close or relabel a different institution view', async () => {
  const user = userEvent.setup()
  const target = externalDomains[0]
  let responded = false
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.post('*/api/v1/admin/domains/:domainId/force-release', async () => { await delay(250); responded = true; return HttpResponse.json({ message: '원래 대상의 해제 접수 결과' }) }))
  renderApp(`/admin/domains?org=${uuid(1)}&domainId=${target.id}`)
  const drawer = within(await screen.findByRole('dialog', { name: '도메인 상세' }))
  await drawer.findByRole('heading', { name: target.fqdn })
  await user.click(drawer.getByRole('button', { name: '강제 해제' }))
  const confirmation = within(screen.getByRole('dialog', { name: '도메인 강제 해제' }))
  await user.type(confirmation.getByRole('textbox'), target.fqdn)
  await user.click(confirmation.getByRole('button', { name: '강제 해제' }))
  fireEvent.change(screen.getByLabelText('관리 기관 선택'), { target: { value: uuid(2) } })
  await screen.findByText('선택한 관리 범위의 도메인이 아닙니다.')
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)) })
  expect(responded).toBe(true)
  expect(currentPath()).toContain(`domainId=${target.id}`)
  expect(screen.queryByText('원래 대상의 해제 접수 결과')).not.toBeInTheDocument()
})

test('a legacy approved domain with no immutable resource link reports unknown association rather than creation failure', async () => {
  const request = { ...submittedAdminRequest(401), type: 'DOMAIN' as const, status: 'APPROVED' as const, vm: undefined, domain: { label: 'old-issued', rootDomain: 'example.test', grantedFqdn: 'old-issued.example.test' } }
  adminRequestStore.push(request)
  const context = approvalContextFixture(uuid(201))
  context.type = 'DOMAIN'; context.vm = null; context.domain = { fqdn: 'old-issued.example.test', available: false, held: 1, cap: 3 }
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser), http.get('*/api/v1/admin/requests/:requestId/context', () => HttpResponse.json(context)))
  renderApp(`/admin/requests/${request.id}?org=${uuid(1)}`)
  await screen.findByText(/이 신청의 확정 자원 ID 연결 기록이 없습니다/)
  expect(screen.queryByRole('link', { name: 'old-issued.example.test' })).not.toBeInTheDocument()
  expect(screen.queryByText('생성 실패')).not.toBeInTheDocument()
})

test('an immutable domain result opens its original ID and returns to the same filtered request list', async () => {
  const user = userEvent.setup()
  const domain = externalDomains[0]
  const request = { ...submittedAdminRequest(401), type: 'DOMAIN' as const, status: 'APPROVED' as const, vm: undefined, domain: { label: 'myblog', rootDomain: 'pusan.dev', grantedFqdn: domain.fqdn } }
  adminRequestStore.push(request)
  const context = approvalContextFixture(uuid(201))
  context.type = 'DOMAIN'; context.vm = null; context.domain = { fqdn: domain.fqdn, available: false, held: 1, cap: 3 }
  context.generatedResources = [{ id: domain.id, type: 'DOMAIN', name: domain.fqdn, state: domain.status, orgId: domain.orgId, workspaceId: domain.workspaceId, recipientId: null, createdAt: domain.createdAt, recordUpdatedAt: domain.updatedAt!, canReadDetail: true, renewDueAt: domain.renewDueAt, releasedAt: null, reservedUntil: null }]
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser), http.get('*/api/v1/admin/requests/:requestId/context', () => HttpResponse.json(context)))
  const list = `/admin/requests?org=${uuid(1)}&status=all&type=DOMAIN`
  renderApp(`/admin/requests/${request.id}?org=${uuid(1)}&returnTo=${encodeURIComponent(list)}`)
  const results = await screen.findByRole('table', { name: '신청에서 등록된 자원 상태' })
  await user.click(within(results).getByRole('link', { name: domain.fqdn }))
  const drawer = within(await screen.findByRole('dialog', { name: '도메인 상세' }))
  await drawer.findByRole('heading', { name: domain.fqdn })
  expect(currentPath()).toContain(`domainId=${domain.id}`)
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('link', { name: '← 신청 상세' }))
  await screen.findByRole('heading', { name: '신청 상세' })
  await user.click(screen.getByRole('link', { name: '← 신청 목록' }))
  expect(currentPath()).toBe(list)
})

test('a removed original domain displays its actual lifecycle records without opening a same-name replacement', async () => {
  const domain = externalDomains[0]
  const request = { ...submittedAdminRequest(401), type: 'DOMAIN' as const, status: 'APPROVED' as const, vm: undefined, domain: { label: 'myblog', rootDomain: 'pusan.dev', grantedFqdn: domain.fqdn } }
  adminRequestStore.push(request)
  const context = approvalContextFixture(uuid(201))
  context.type = 'DOMAIN'; context.vm = null; context.domain = { fqdn: domain.fqdn, available: false, held: 1, cap: 3 }
  context.generatedResources = [{ id: uuid(8888), type: 'DOMAIN', name: domain.fqdn, state: 'REMOVED', orgId: domain.orgId, workspaceId: domain.workspaceId, recipientId: null, createdAt: domain.createdAt, recordUpdatedAt: request.updatedAt, canReadDetail: false, renewDueAt: '2026-09-01T00:00:00+09:00', releasedAt: '2026-09-02T00:00:00+09:00', reservedUntil: null }]
  server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser), http.get('*/api/v1/admin/requests/:requestId/context', () => HttpResponse.json(context)))
  renderApp(`/admin/requests/${request.id}?org=${uuid(1)}`)
  const results = await screen.findByRole('table', { name: '신청에서 등록된 자원 상태' })
  expect(within(results).getByText(domain.fqdn)).toBeInTheDocument()
  expect(within(results).queryByRole('link', { name: domain.fqdn })).not.toBeInTheDocument()
  expect(within(results).getByText(`원본 ID: ${uuid(8888)} / 현재 상세 조회 불가`)).toBeInTheDocument()
  expect(within(results).getByText(/갱신 기한:.*2026/)).toBeInTheDocument()
  expect(within(results).getByText(/해제 기록:.*2026/)).toBeInTheDocument()
  expect(within(results).getByText('예약 기한: 기록 없음')).toBeInTheDocument()
})

test('a late approval response cannot replace another institution confirmation', async () => {
  const user = userEvent.setup()
  let resolved = false
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser), http.post('*/api/v1/admin/requests/:requestId/approve', async () => { await delay(250); resolved = true; return HttpResponse.json({ ...submittedAdminRequest(201), status: 'APPROVED' }) }))
  renderApp(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
  await user.click(await screen.findByRole('button', { name: '승인하기' }))
  await user.click(within(screen.getByRole('dialog', { name: '신청 승인' })).getByRole('button', { name: '승인 확정' }))
  fireEvent.change(screen.getByLabelText('관리 기관 선택'), { target: { value: uuid(2) } })
  await screen.findByText('선택한 관리 범위의 신청이 아닙니다')
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)) })
  expect(resolved).toBe(true)
  expect(screen.queryByText('승인 내용이 저장되었습니다. VM 생성 진행과 실제 완료는 가상머신 상세에서 확인해 주세요.')).not.toBeInTheDocument()
})
