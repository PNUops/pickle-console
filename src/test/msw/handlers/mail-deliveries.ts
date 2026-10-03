import { http, HttpResponse, type RequestHandler } from 'msw'
import type { MailDelivery, MailDeliveryDetail, RequestMailSelection } from '../../../api/queries'
import { ACCESS_TOKENS, problemResponse } from './auth'
import { uuid } from '../ids'
import { adminRequestStore } from './admin'
import { requestStore } from './requests'

export const mailDeliveryResends: string[] = []
function initialDeliveries(): MailDelivery[] {
  const base = { userId: uuid(42), recipientEmail: 'example@pusan.ac.kr', currentUserEmail: 'new.example@pusan.ac.kr', sourceKind: 'NOTIFICATION', event: 'vm.create.done', title: 'VM 생성 완료', status: 'SENT', queueState: 'SENT', attempts: 1, failureCode: null, sentAt: '2026-07-13T10:00:20+09:00', createdAt: '2026-07-13T10:00:00+09:00', nextAttemptAt: null, requestId: null, orgId: uuid(1), announcementId: null, notificationId: null, linkPath: `/console/vms/${uuid(55)}`, policyRevision: null, mailMode: null, legacyAddressUnknown: false, processingUnconfirmed: false, canResend: false, cannotResendReason: 'NOT_FAILED' }
  return [
    { ...base, id: uuid(404), notificationId: uuid(404) },
    { ...base, id: uuid(403), notificationId: uuid(403), userId: uuid(58), recipientEmail: 'younghee.park@pusan.ac.kr', currentUserEmail: 'updated.younghee@pusan.ac.kr', title: 'VM 만료 7일 전', event: 'vm.expiry.d7', status: 'FAILED', queueState: 'FAILED', attempts: 3, failureCode: 'MAIL_CONNECTION_FAILED', sentAt: null, linkPath: null, canResend: true, cannotResendReason: null },
    { ...base, id: uuid(402), notificationId: uuid(402), userId: uuid(57), recipientEmail: 'cheolsu.kim@pusan.ac.kr', currentUserEmail: 'cheolsu.kim@pusan.ac.kr', title: '7월 정기 점검 안내', event: 'announcement', status: 'PENDING', queueState: 'BUNDLE_WAIT', attempts: 0, sentAt: null, nextAttemptAt: '2026-07-13T11:00:00+09:00', linkPath: null, announcementId: uuid(11) },
    { ...base, id: uuid(401), notificationId: uuid(401), title: 'VM 삭제 완료', event: 'vm.delete.completed', status: 'SKIPPED', queueState: 'SKIPPED', attempts: 0, sentAt: null, failureCode: 'ACCOUNT_INACTIVE', linkPath: null },
    { ...base, id: uuid(410), notificationId: uuid(310), userId: uuid(7), recipientEmail: 'old.admin@pusan.ac.kr', currentUserEmail: 'admin.kim@pusan.ac.kr', title: '새 VM 신청', event: 'request.submitted', status: 'PENDING', queueState: 'NORMAL_WAIT', attempts: 0, sentAt: null, requestId: uuid(201), policyRevision: 3, mailMode: 'DESIGNATED', linkPath: `/admin/requests/${uuid(201)}` },
    { ...base, id: uuid(411), title: '신청 재시도 대기', event: 'request.submitted', status: 'PENDING', queueState: 'RETRY_WAIT', attempts: 1, failureCode: 'MAIL_CONNECTION_FAILED', sentAt: null, nextAttemptAt: '2026-07-13T11:05:00+09:00', requestId: uuid(201), policyRevision: 3, mailMode: 'DESIGNATED' },
    { ...base, id: uuid(412), sourceKind: 'ACCOUNT', title: '이메일 인증', event: 'account.signup_verification', status: 'SKIPPED', queueState: 'SKIPPED', attempts: 0, sentAt: null, failureCode: 'QUEUE_FULL', linkPath: null, orgId: null, canResend: false, cannotResendReason: 'ACCOUNT_SELF_RETRY' },
    { ...base, id: uuid(413), sourceKind: 'ACCOUNT', title: '비밀번호 재설정', event: 'account.password_reset', status: 'UNKNOWN', queueState: 'UNKNOWN', sentAt: null, failureCode: 'MAIL_DELIVERY_UNKNOWN', linkPath: null, orgId: null, canResend: false, cannotResendReason: 'ACCOUNT_SELF_RETRY' },
    { ...base, id: uuid(414), title: '기존 알림 이력', status: 'FAILED', queueState: 'FAILED', recipientEmail: null, legacyAddressUnknown: true, sentAt: null, failureCode: 'LEGACY_STATUS_IMPORT', canResend: false, cannotResendReason: 'LEGACY_ADDRESS_UNKNOWN' },
    { ...base, id: uuid(415), sourceKind: 'ACCOUNT', title: '계정 메일 접수', event: 'account.already_registered', status: 'PENDING', queueState: 'ACCOUNT_WAIT', attempts: 0, sentAt: null, linkPath: null, orgId: null, canResend: false, cannotResendReason: 'ACCOUNT_SELF_RETRY' },
    { ...base, id: uuid(416), sourceKind: 'ACCOUNT', title: '계정 메일 처리 중', event: 'account.signup_verification', status: 'SENDING', queueState: 'SENDING', sentAt: null, linkPath: null, orgId: null, canResend: false, cannotResendReason: 'ACCOUNT_SELF_RETRY' },
    { ...base, id: uuid(417), sourceKind: 'ACCOUNT', title: '계정 메일 연결 실패', event: 'account.signup_verification', status: 'FAILED', queueState: 'FAILED', sentAt: null, failureCode: 'MAIL_CONNECTION_FAILED', linkPath: null, orgId: null, canResend: false, cannotResendReason: 'ACCOUNT_SELF_RETRY' },
  ]
}
function initialAttempts(): Record<string, MailDeliveryDetail['attemptHistory']> {
  const startedAt = '2026-07-13T10:00:00+09:00'
  const completedAt = '2026-07-13T10:01:00+09:00'
  return {
    [uuid(404)]: [{ attemptNo: 1, dispatchId: uuid(950), startedAt, completedAt: '2026-07-13T10:00:20+09:00', outcome: 'SENT', failureCode: null }],
    [uuid(403)]: [{ attemptNo: 3, dispatchId: uuid(951), startedAt, completedAt, outcome: 'FAILED', failureCode: 'MAIL_CONNECTION_FAILED' }],
    [uuid(411)]: [{ attemptNo: 1, dispatchId: uuid(952), startedAt, completedAt, outcome: 'FAILED', failureCode: 'MAIL_CONNECTION_FAILED' }],
    [uuid(413)]: [{ attemptNo: 1, dispatchId: uuid(953), startedAt, completedAt, outcome: 'UNKNOWN', failureCode: 'MAIL_DELIVERY_UNKNOWN' }],
    [uuid(416)]: [{ attemptNo: 1, dispatchId: uuid(954), startedAt, completedAt: null, outcome: 'STARTED', failureCode: null }],
    [uuid(417)]: [{ attemptNo: 1, dispatchId: uuid(955), startedAt, completedAt, outcome: 'FAILED', failureCode: 'MAIL_CONNECTION_FAILED' }],
  }
}
function initialSelection(): RequestMailSelection {
  return { requestId: uuid(201), orgId: uuid(1), policyRevision: 3, mailMode: 'DESIGNATED', selectedAt: '2026-07-13T08:30:00+09:00',
    requester: { userId: uuid(42), email: 'old.requester@pusan.ac.kr', name: '홍길동', status: 'ACTIVE' },
    staff: [
      { userId: uuid(7), name: '김관리', email: 'old.admin@pusan.ac.kr', role: 'ORG_ADMIN', status: 'ACTIVE', requestMail: true, currentMailRecipient: true, inAppRecipient: true, selectionReason: 'DESIGNATED', exclusionReason: null },
      { userId: uuid(60), name: '기관 승인자', email: 'approver@example.test', role: 'ORG_MANAGER', status: 'ACTIVE', requestMail: false, currentMailRecipient: false, inAppRecipient: true, selectionReason: null, exclusionReason: 'NOT_SELECTED' },
    ] }
}
export let mailDeliveryStore = initialDeliveries()
// Seeded individual evidence is independent of each delivery's aggregate state.
let mailDeliveryAttemptStore = initialAttempts()
export let requestMailSelectionStore: Record<string, RequestMailSelection | null> = { [uuid(201)]: initialSelection() }
export function resetMailDeliveryFixtures() {
  mailDeliveryStore = initialDeliveries()
  mailDeliveryAttemptStore = initialAttempts()
  requestMailSelectionStore = { [uuid(201)]: initialSelection() }
  mailDeliveryResends.length = 0
}
function access(request: Request, write = false) {
  const actor = ACCESS_TOKENS[request.headers.get('Authorization')?.replace('Bearer ', '') ?? '']
  if (!actor || !actor.role.startsWith('SYS_') || (write && actor.role === 'SYS_VIEWER')) return problemResponse({ type: 'about:blank', status: 403, code: 'ACCESS_DENIED', title: '권한이 없습니다' })
  return null
}
export const mailDeliveryHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/mail-deliveries', ({ request }) => {
    const denied = access(request)
    if (denied) return denied
    const params = new URL(request.url).searchParams
    const rows = mailDeliveryStore.filter((row) => ['sourceKind', 'event', 'status', 'queueState', 'requestId', 'announcementId', 'orgId'].every((key) => !params.get(key) || row[key as keyof MailDelivery] === params.get(key))).filter((row) => !params.get('email') || row.recipientEmail === params.get('email')).sort((a, b) => b.id.localeCompare(a.id))
    const page = Number(params.get('page') ?? '0')
    const size = Number(params.get('size') ?? '20')
    return HttpResponse.json({ content: rows.slice(page * size, (page + 1) * size), page, size, totalElements: rows.length, totalPages: Math.ceil(rows.length / size) })
  }),
  http.get('*/api/v1/admin/mail-deliveries/:deliveryId', ({ request, params }) => {
    const denied = access(request)
    if (denied) return denied
    const delivery = mailDeliveryStore.find((row) => row.id === String(params.deliveryId))
    if (!delivery) return problemResponse({ type: 'about:blank', status: 404, code: 'RESOURCE_NOT_FOUND', title: '발송 기록을 찾을 수 없습니다' })
    const detail: MailDeliveryDetail = { delivery, selection: delivery.requestId ? requestMailSelectionStore[delivery.requestId] ?? null : null,
      attemptHistory: mailDeliveryAttemptStore[delivery.id] ?? [] }
    return HttpResponse.json(detail)
  }),
  http.post('*/api/v1/admin/mail-deliveries/:deliveryId/resend', ({ request, params }) => {
    const denied = access(request, true)
    if (denied) return denied
    const delivery = mailDeliveryStore.find((row) => row.id === String(params.deliveryId))
    if (!delivery) return problemResponse({ type: 'about:blank', status: 404, code: 'RESOURCE_NOT_FOUND', title: '발송 기록을 찾을 수 없습니다' })
    if (!delivery.canResend || delivery.status !== 'FAILED' || delivery.sourceKind === 'ACCOUNT') return problemResponse({ type: 'about:blank', status: 409, code: 'NOTIFICATION_NOT_RESENDABLE', title: '재발송할 수 없습니다' })
    mailDeliveryResends.push(delivery.id)
    delivery.status = 'PENDING'
    delivery.queueState = 'RETRY_WAIT'
    delivery.failureCode = null
    delivery.nextAttemptAt = new Date().toISOString()
    delivery.canResend = false
    delivery.cannotResendReason = 'NOT_FAILED'
    return HttpResponse.json({ message: '알림 재발송을 접수했습니다. 잠시 후 발송 상태가 갱신됩니다.' }, { status: 202 })
  }),
  http.get('*/api/v1/admin/requests/:requestId/notification-selection', ({ request, params }) => {
    const denied = access(request)
    if (denied) return denied
    const requestId = String(params.requestId)
    if (!adminRequestStore.some((row) => row.id === requestId) && !requestStore.some((row) => row.id === requestId) && !Object.hasOwn(requestMailSelectionStore, requestId)) return problemResponse({ type: 'about:blank', status: 404, code: 'RESOURCE_NOT_FOUND', title: '신청을 찾을 수 없습니다' })
    return HttpResponse.json({ requestId, selection: requestMailSelectionStore[requestId] ?? null })
  }),
]
