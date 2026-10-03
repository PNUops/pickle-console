import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { fetchMailDelivery } from '../api/queries'
import { orgAdminUser, orgManagerUser, orgViewerUser, regularUser, refreshSuccessHandler, sysAdminUser, sysManagerUser, sysViewerUser } from '../test/msw/handlers/auth'
import { mailDeliveryResends, mailDeliveryStore, requestMailSelectionStore } from '../test/msw/handlers/mail-deliveries'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'

function system(path = '/admin/notification-log') {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(path)
}

function deliveryRow(title: string) {
  return screen.findByRole('button', { name: title }).then((button) => button.closest('tr')!)
}

describe('Unified mail delivery access and queue meaning', () => {
  test('account queue overflow is skipped before any SMTP attempt', async () => {
    system()
    const row = await deliveryRow('이메일 인증')
    expect(within(row).getByText('발송 생략')).toBeInTheDocument()
    expect(within(row).getByText('0회')).toBeInTheDocument()
    const detail = await fetchMailDelivery(uuid(412))
    expect(detail.delivery).toMatchObject({ event: 'account.signup_verification', status: 'SKIPPED', attempts: 0, failureCode: 'QUEUE_FULL' })
    expect(detail.attemptHistory).toEqual([])
    const failedRow = await deliveryRow('계정 메일 연결 실패')
    expect(within(failedRow).getByText('발송 실패')).toBeInTheDocument()
    expect(within(failedRow).getByText('1회')).toBeInTheDocument()
    const failed = await fetchMailDelivery(uuid(417))
    expect(failed.delivery).toMatchObject({ sourceKind: 'ACCOUNT', status: 'FAILED', attempts: 1, failureCode: 'MAIL_CONNECTION_FAILED', canResend: false })
    expect(failed.attemptHistory[0]).toMatchObject({ outcome: 'FAILED', failureCode: 'MAIL_CONNECTION_FAILED' })
    expect(mailDeliveryStore.find((delivery) => delivery.id === uuid(413))?.event).toBe('account.password_reset')
    expect(mailDeliveryStore.find((delivery) => delivery.id === uuid(415))?.event).toBe('account.already_registered')
  })

  test('a legacy aggregate count does not manufacture individual attempts', async () => {
    system()
    await deliveryRow('기존 알림 이력')
    const detail = await fetchMailDelivery(uuid(414))
    expect(detail.delivery).toMatchObject({ attempts: 1, failureCode: 'LEGACY_STATUS_IMPORT', legacyAddressUnknown: true })
    expect(detail.attemptHistory).toEqual([])
  })

  test('missing delivery and request records answer not found, while an empty list has zero pages', async () => {
    system()
    await deliveryRow('VM 생성 완료')
    const headers = { Authorization: 'Bearer access-sys-admin' }
    for (const path of [`/api/v1/admin/mail-deliveries/${uuid(999)}/resend`, `/api/v1/admin/requests/${uuid(999)}/notification-selection`]) {
      const response = await fetch(path, { headers, method: path.endsWith('/resend') ? 'POST' : 'GET' })
      expect(response.status).toBe(404)
      expect((await response.json()).code).toBe('RESOURCE_NOT_FOUND')
    }
    const empty = await fetch('/api/v1/admin/mail-deliveries?email=nobody%40example.test', { headers })
    expect(await empty.json()).toMatchObject({ content: [], totalElements: 0, totalPages: 0 })
  })

  test('a sending account attempt records STARTED without a completed result', async () => {
    system(`/admin/notification-log?selected=${uuid(416)}`)
    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByText('시도 시작 · 종료 기록 없음')).toBeInTheDocument()
    expect(within(drawer).getByText('미완료')).toBeInTheDocument()
    const detail = await fetchMailDelivery(uuid(416))
    expect(detail.delivery).toMatchObject({ status: 'SENDING', attempts: 1 })
    expect(detail.attemptHistory[0]).toMatchObject({ outcome: 'STARTED', completedAt: null, failureCode: null })
  })
  test.each([
    ['access-sys-admin', sysAdminUser, true], ['access-sys-manager', sysManagerUser, true], ['access-sys-viewer', sysViewerUser, false],
  ] as const)('%s reads unified records and has the matching resend action', async (token, profile, operating) => {
    server.use(refreshSuccessHandler(token, profile))
    renderApp('/admin/notification-log')
    const failed = await deliveryRow('VM 만료 7일 전')
    expect(within(failed).getByText('메일 서버 연결 실패')).toBeInTheDocument()
    expect(!!within(failed).queryByRole('button', { name: '재발송' })).toBe(operating)
    const account = await deliveryRow('이메일 인증')
    expect(within(account).getByText('계정 메일')).toBeInTheDocument()
    expect(within(account).queryByRole('button', { name: '재발송' })).not.toBeInTheDocument()
  })

  test.each([
    ['access-org-admin', orgAdminUser], ['access-org-manager', orgManagerUser], ['access-org-viewer', orgViewerUser], ['access-user', regularUser],
  ] as const)('%s cannot read unified delivery metadata', async (token, profile) => {
    server.use(refreshSuccessHandler(token, profile))
    renderApp('/admin/notification-log')
    await waitFor(() => expect(currentPath()).not.toContain('notification-log'))
    expect(screen.queryByRole('heading', { name: '알림 발송 이력' })).not.toBeInTheDocument()
    const response = await fetch('/api/v1/admin/mail-deliveries', { headers: { Authorization: `Bearer ${token}` } })
    expect(response.status).toBe(403)
    const snapshot = await fetch(`/api/v1/admin/requests/${uuid(201)}/notification-selection`, { headers: { Authorization: `Bearer ${token}` } })
    expect(snapshot.status).toBe(403)
  })

  test('normal, bundle, retry, skipped and unknown are distinct from SMTP handoff', async () => {
    system()
    expect(within(await deliveryRow('새 VM 신청')).getByText('일반 대기')).toBeInTheDocument()
    expect(within(await deliveryRow('7월 정기 점검 안내')).getByText('묶음 대기')).toBeInTheDocument()
    expect(within(await deliveryRow('신청 재시도 대기')).getByText('재시도 대기')).toBeInTheDocument()
    expect(within(await deliveryRow('계정 메일 접수')).getByText('계정 메일 대기')).toBeInTheDocument()
    expect(within(await deliveryRow('VM 삭제 완료')).getByText('발송 생략')).toBeInTheDocument()
    expect(within(await deliveryRow('비밀번호 재설정')).getByText('결과 확인 필요')).toBeInTheDocument()
    expect(within(await deliveryRow('VM 생성 완료')).getByText('SMTP 인계')).toBeInTheDocument()
    expect(screen.getByText(/SMTP 인계는 메일함 도착이나 열람을 확인한 결과가 아닙니다/)).toBeInTheDocument()
  })

  test('an unconfirmed account process preserves its stored state without promising execution', async () => {
    const account = mailDeliveryStore.find((row) => row.id === uuid(415))!
    account.processingUnconfirmed = true
    system()
    const row = await deliveryRow('계정 메일 접수')
    expect(within(row).getByText('현재 처리 확인 필요')).toBeInTheDocument()
    expect(within(row).getByText('원기록: 발송 대기')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: '재발송' })).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('큐 단계')).queryByRole('option', { name: '계정 메일 처리 확인 필요' })).not.toBeInTheDocument()
    expect(account.status).toBe('PENDING')
    expect(account.queueState).toBe('ACCOUNT_WAIT')
    expect(account.failureCode).toBeNull()
  })
})

describe('Mail delivery URL filtering and detail navigation', () => {
  test('filters are restored and changing filters discards page and selected target', async () => {
    const user = userEvent.setup()
    system(`/admin/notification-log?sourceKind=NOTIFICATION&status=PENDING&queueState=RETRY_WAIT&event=request.submitted&requestId=${uuid(201)}&orgId=${uuid(1)}`)
    const retry = await deliveryRow('신청 재시도 대기')
    expect(screen.getByLabelText('큐 단계')).toHaveValue('RETRY_WAIT')
    await user.click(within(retry).getByRole('button', { name: '신청 재시도 대기' }))
    expect(await screen.findByRole('dialog', { name: '메일 발송 상세' })).toBeInTheDocument()
    expect(currentPath()).toContain(`selected=${uuid(411)}`)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(currentPath()).toContain(`requestId=${uuid(201)}`)
    await user.selectOptions(screen.getByLabelText('전달 상태'), 'FAILED')
    expect(currentPath()).not.toContain('selected=')
    expect(currentPath()).not.toContain('page=')
    expect(await screen.findByText('조건에 맞는 발송 이력이 없습니다.')).toBeInTheDocument()
  })

  test('server pagination includes the hundredth row and selection is restored by direct URL', async () => {
    const template = mailDeliveryStore[0]
    for (let index = 0; index < 100; index++) mailDeliveryStore.push({ ...template, id: uuid(1000 + index), title: `발송${String(index).padStart(3, '0')}` })
    system(`/admin/notification-log?page=4&status=SENT&selected=${uuid(1001)}`)
    const drawer = await screen.findByRole('dialog', { name: '메일 발송 상세' })
    expect(await within(drawer).findByRole('heading', { name: '발송001' })).toBeInTheDocument()
    expect(screen.getByText('조회된 발송 101건')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '5 페이지' })).toHaveAttribute('aria-current', 'page')
  })

  test('a frozen address filter does not match a changed current address', async () => {
    const user = userEvent.setup()
    system('/admin/notification-log?email=old.admin%40pusan.ac.kr')
    await deliveryRow('새 VM 신청')
    fireEvent.change(screen.getByLabelText('수신 이메일'), { target: { value: 'admin.kim@pusan.ac.kr' } })
    expect(await screen.findByText('조건에 맞는 발송 이력이 없습니다.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('수신 이메일'), { target: { value: 'old.admin@pusan.ac.kr' } })
    await user.click(await screen.findByRole('button', { name: '새 VM 신청' }))
    const drawer = screen.getByRole('dialog')
    expect(await within(drawer).findByText('현재 계정 주소')).toBeInTheDocument()
    expect(within(drawer).getByText('admin.kim@pusan.ac.kr')).toBeInTheDocument()
    expect(within(drawer).getAllByText('old.admin@pusan.ac.kr').length).toBeGreaterThan(0)
  })

  test('malformed detail and relation IDs are visible errors without invalid API reads', async () => {
    let detailCalls = 0
    let listCalls = 0
    server.use(http.get('*/api/v1/admin/mail-deliveries/:deliveryId', () => { detailCalls += 1 }), http.get('*/api/v1/admin/mail-deliveries', () => { listCalls += 1 }))
    system('/admin/notification-log?selected=broken&requestId=not-an-id')
    await screen.findByText('신청·발송건·기관 ID는 올바른 UUID여야 합니다. 조회 조건을 수정해 주세요.')
    expect(screen.getByText('발송 상세 ID가 올바르지 않습니다.')).toBeInTheDocument()
    expect(detailCalls).toBe(0)
    expect(listCalls).toBe(0)
  })

  test('Escape returns focus to the selected delivery, keeping list filters', async () => {
    const user = userEvent.setup()
    system('/admin/notification-log?event=request.submitted')
    const opener = await screen.findByRole('button', { name: '새 VM 신청' })
    await user.click(opener)
    const drawer = screen.getByRole('dialog')
    await within(drawer).findByRole('heading', { name: '새 VM 신청' })
    await user.keyboard('{Tab}')
    expect(drawer.contains(document.activeElement)).toBe(true)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(opener).toHaveFocus())
    expect(currentPath()).toBe('/admin/notification-log?event=request.submitted')
  })

  test('the request snapshot preserves historical roles and recipient choices with exact links', async () => {
    const user = userEvent.setup()
    system(`/admin/notification-log?selected=${uuid(410)}`)
    const drawer = await screen.findByRole('dialog')
    await within(drawer).findByRole('heading', { name: '접수 당시 기관 알림 선정' })
    expect(within(drawer).getByText(/정책 버전 3/)).toBeInTheDocument()
    const staff = within(drawer).getByRole('link', { name: '기관 승인자' }).closest('tr')!
    expect(within(staff).getByText('선정')).toBeInTheDocument()
    expect(within(staff).getByText('제외')).toBeInTheDocument()
    expect(within(drawer).getByRole('link', { name: '관련 신청' })).toHaveAttribute('href', `/admin/requests/${uuid(201)}?org=${uuid(1)}`)
    expect(within(drawer).getByRole('link', { name: '현재 기관 명단' })).toHaveAttribute('href', `/admin/org-operations?org=${uuid(1)}`)
    expect(within(drawer).getByRole('link', { name: '기관 변경 감사' })).toHaveAttribute('href', `/admin/audit?targetOrgId=${uuid(1)}&org=${uuid(1)}`)
    await user.click(within(drawer).getByRole('link', { name: '관련 신청' }))
    expect(await screen.findByRole('heading', { name: '신청 상세' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '신청 알림 발송 이력' })).toHaveAttribute('href', `/admin/notification-log?requestId=${uuid(201)}`)
  })

  test('a legacy address remains unknown and an unsupported archived link is omitted', async () => {
    mailDeliveryStore.find((row) => row.id === uuid(414))!.linkPath = 'https://example.test/console/vms/unknown'
    system(`/admin/notification-log?selected=${uuid(414)}`)
    const drawer = await screen.findByRole('dialog')
    await within(drawer).findByText(/이 기존 기록에는 당시 주소가 없습니다/)
    expect(within(drawer).queryByRole('link', { name: '관련 리소스 상세' })).not.toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: '재발송' })).not.toBeInTheDocument()
  })
})

describe('Resend, failed reads and delayed response boundaries', () => {
  test('a failed notification is confirmed once and returns an accepted queue result', async () => {
    const user = userEvent.setup()
    system()
    const row = await deliveryRow('VM 만료 7일 전')
    await user.click(within(row).getByRole('button', { name: '재발송' }))
    const confirm = screen.getByRole('dialog', { name: '알림 재발송' })
    expect(within(confirm).getByText('younghee.park@pusan.ac.kr')).toBeInTheDocument()
    expect(within(confirm).queryByText('updated.younghee@pusan.ac.kr')).not.toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: '재발송' }))
    expect(await screen.findByText('작업 접수')).toBeInTheDocument()
    expect(mailDeliveryResends).toEqual([uuid(403)])
    expect(within(await deliveryRow('VM 만료 7일 전')).getByText('발송 대기')).toBeInTheDocument()
    expect(within(await deliveryRow('VM 만료 7일 전')).getByText('재시도 대기')).toBeInTheDocument()
    const retried = await fetchMailDelivery(uuid(403))
    expect(retried.delivery).toMatchObject({ status: 'PENDING', queueState: 'RETRY_WAIT', attempts: 3, failureCode: null })
    expect(retried.delivery.nextAttemptAt).toBeTruthy()
    expect(retried.attemptHistory[0]).toMatchObject({ attemptNo: 3, outcome: 'FAILED', failureCode: 'MAIL_CONNECTION_FAILED' })
    expect(screen.queryByText('실제 완료')).not.toBeInTheDocument()
  })

  test('unknown, account and expired-content failures cannot be manually resent', async () => {
    const row = mailDeliveryStore.find((delivery) => delivery.id === uuid(414))!
    row.recipientEmail = 'old@example.test'
    row.legacyAddressUnknown = false
    row.cannotResendReason = 'CONTENT_EXPIRED'
    system()
    for (const title of ['비밀번호 재설정', '이메일 인증', '기존 알림 이력']) expect(within(await deliveryRow(title)).queryByRole('button', { name: '재발송' })).not.toBeInTheDocument()
  })

  test('a stale second resend receives an error without another accepted receipt', async () => {
    const user = userEvent.setup()
    system()
    await user.click(within(await deliveryRow('VM 만료 7일 전')).getByRole('button', { name: '재발송' }))
    const dialog = screen.getByRole('dialog')
    mailDeliveryStore.find((row) => row.id === uuid(403))!.status = 'SENT'
    await user.click(within(dialog).getByRole('button', { name: '재발송' }))
    expect(await within(dialog).findByText('재발송할 수 없습니다')).toBeInTheDocument()
    expect(mailDeliveryResends).toHaveLength(0)
    expect(screen.queryByText('작업 접수')).not.toBeInTheDocument()
    const rejected = await fetch(`/api/v1/admin/mail-deliveries/${uuid(403)}/resend`, { method: 'POST', headers: { Authorization: 'Bearer access-sys-admin' } })
    expect(rejected.status).toBe(409)
    expect((await rejected.json()).code).toBe('NOTIFICATION_NOT_RESENDABLE')
  })

  test('a cancelled old resend cannot close a new confirmation or display its receipt', async () => {
    const failed = mailDeliveryStore.find((row) => row.id === uuid(403))!
    mailDeliveryStore.push({ ...failed, id: uuid(420), title: '다른 실패 발송' })
    let completed = false
    server.use(http.post('*/api/v1/admin/mail-deliveries/:deliveryId/resend', async () => { await delay(200); completed = true; return HttpResponse.json({ message: '접수' }, { status: 202 }) }))
    const user = userEvent.setup()
    system()
    await user.click(within(await deliveryRow('VM 만료 7일 전')).getByRole('button', { name: '재발송' }))
    const old = screen.getByRole('dialog')
    await user.click(within(old).getByRole('button', { name: '재발송' }))
    await user.click(within(old).getByRole('button', { name: '취소' }))
    await user.click(within(await deliveryRow('다른 실패 발송')).getByRole('button', { name: '재발송' }))
    const next = screen.getByRole('dialog')
    await waitFor(() => expect(completed).toBe(true))
    expect(screen.getByRole('dialog')).toBe(next)
    expect(within(next).getByText('다른 실패 발송')).toBeInTheDocument()
    expect(screen.queryByText('작업 접수')).not.toBeInTheDocument()
  })

  test('filter changes do not display or resend a previous page while the next read waits', async () => {
    const user = userEvent.setup()
    system()
    await deliveryRow('VM 만료 7일 전')
    server.use(http.get('*/api/v1/admin/mail-deliveries', async () => { await delay(200); return HttpResponse.json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 1 }) }))
    await user.selectOptions(screen.getByLabelText('메일 종류'), 'ACCOUNT')
    expect(screen.queryByRole('button', { name: 'VM 만료 7일 전' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '재발송' })).not.toBeInTheDocument()
    expect(await screen.findByText('조건에 맞는 발송 이력이 없습니다.')).toBeInTheDocument()
  })

  test('read and detail errors preserve explicit retry paths', async () => {
    let calls = 0
    server.use(http.get('*/api/v1/admin/mail-deliveries', () => { calls += 1; return HttpResponse.json({ status: 403, code: 'ACCESS_DENIED', detail: '이력 조회 권한 없음' }, { status: 403 }) }))
    const user = userEvent.setup()
    system()
    await screen.findByText('이력 조회 권한 없음')
    await user.click(screen.getByRole('button', { name: '발송 이력 다시 조회' }))
    await waitFor(() => expect(calls).toBe(2))
    expect(screen.queryByText('조건에 맞는 발송 이력이 없습니다.')).not.toBeInTheDocument()
  })

  test('a failed permission refresh hides stale rows and resend controls', async () => {
    const user = userEvent.setup()
    system()
    await deliveryRow('VM 만료 7일 전')
    server.use(http.get('*/api/v1/admin/mail-deliveries', () => HttpResponse.json({ status: 403, code: 'ACCESS_DENIED', detail: '현재 조회 권한 없음' }, { status: 403 })))
    await user.click(screen.getByRole('button', { name: '현재 발송 상태 조회' }))
    await screen.findByText('현재 조회 권한 없음')
    expect(screen.queryByRole('button', { name: 'VM 만료 7일 전' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '재발송' })).not.toBeInTheDocument()
  })

  test('an ambiguous result can be reread without initiating another send', async () => {
    const user = userEvent.setup()
    system(`/admin/notification-log?selected=${uuid(413)}`)
    const drawer = await screen.findByRole('dialog')
    await within(drawer).findByRole('heading', { name: '비밀번호 재설정' })
    const stored = mailDeliveryStore.find((row) => row.id === uuid(413))!
    stored.status = 'SENT'
    stored.queueState = 'SENT'
    stored.sentAt = '2026-07-13T11:10:00+09:00'
    await user.click(within(drawer).getByRole('button', { name: '상세 상태 다시 조회' }))
    expect((await within(drawer).findAllByText('SMTP 인계')).length).toBeGreaterThan(0)
    expect(within(drawer).queryByRole('button', { name: '재발송' })).not.toBeInTheDocument()
    expect(mailDeliveryResends).toHaveLength(0)
  })
})

describe('Request selection snapshots', () => {
  test('zero recipients remain visible and do not reconstruct the current institution roster', async () => {
    requestMailSelectionStore[uuid(201)]!.staff = []
    system(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
    expect(await screen.findByText('접수 당시 기관 메일 수신자가 0명입니다. 신청자의 본인 확인 메일과는 별개입니다.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '신청 알림 발송 이력' })).toBeInTheDocument()
  })

  test('legacy requests explicitly report the absent selection snapshot', async () => {
    requestMailSelectionStore[uuid(201)] = null
    system(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
    expect(await screen.findByText(/이 신청의 접수 당시 기관 알림 선정 명단은 기록되지 않았습니다/)).toBeInTheDocument()
  })

  test('institution roles never request the system-only selection data', async () => {
    let reads = 0
    server.use(http.get('*/api/v1/admin/requests/:requestId/notification-selection', () => { reads += 1 }))
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp(`/admin/requests/${uuid(201)}?org=${uuid(1)}`)
    await screen.findByRole('heading', { name: '신청 상세' })
    expect(reads).toBe(0)
    expect(screen.queryByRole('link', { name: '신청 알림 발송 이력' })).not.toBeInTheDocument()
  })
})
